import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxStatus, Prisma } from '@prisma/client';
import { CLOCK } from '../../application/ports/clock.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { DomainEventEnvelope } from '../../domain/domain-event.js';
import type { TypedConfigService } from '../../../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface ClaimedRow {
  id: string;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Prisma.JsonValue;
  occurred_at: Date;
  attempts: number;
}

const MAX_ERROR_LENGTH = 1_000;

/** Exponential backoff: base * 2^(attempt-1), capped. `attempt` is 1-based. */
export function computeRetryDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

/**
 * Polls the outbox and re-emits events in-process through EventEmitter2.
 * Delivery is AT-LEAST-ONCE: every `@OnEvent` handler must be idempotent.
 * Multiple instances are safe (FOR UPDATE SKIP LOCKED); set OUTBOX_ENABLED=false on instances
 * that should not dispatch.
 */
@Injectable()
export class OutboxDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.settings.enabled) {
      this.logger.log('Outbox dispatcher disabled (OUTBOX_ENABLED=false).');
      return;
    }
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
  }

  private get settings() {
    return this.config.get('outbox', { infer: true });
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick().then((processed) => {
        // A full batch means there is probably more waiting: continue immediately.
        this.schedule(
          processed >= this.settings.batchSize
            ? 0
            : this.settings.pollIntervalMs,
        );
      });
    }, delayMs);
    this.timer.unref();
  }

  /** One poll cycle. Never throws: a failing cycle is logged and retried on the next tick. */
  async tick(): Promise<number> {
    try {
      const rows = await this.claimBatch();
      // RETURNING does not guarantee order, so restore chronological dispatch within the batch.
      rows.sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
      for (const row of rows) {
        await this.dispatch(row);
      }
      return rows.length;
    } catch (error) {
      this.logger.error(
        'Outbox poll cycle failed.',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }

  /**
   * Atomically claims a batch. Time comparisons use the DATABASE clock (as naive UTC, matching
   * how Prisma stores DateTime), so every worker shares one time source and the result does not
   * depend on the session time zone or on clock skew between app servers.
   */
  private claimBatch(): Promise<ClaimedRow[]> {
    const { batchSize, lockTimeoutMs } = this.settings;

    return this.prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
      UPDATE "outbox_events" AS o
      SET "status" = ${OutboxStatus.PROCESSING}::"outbox_status",
          "locked_until" = (now() AT TIME ZONE 'UTC') + (${lockTimeoutMs}::int * interval '1 millisecond'),
          "attempts" = o."attempts" + 1
      WHERE o."id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE ("status" = ${OutboxStatus.PENDING}::"outbox_status"
               AND "next_attempt_at" <= (now() AT TIME ZONE 'UTC'))
           OR ("status" = ${OutboxStatus.PROCESSING}::"outbox_status"
               AND "locked_until" < (now() AT TIME ZONE 'UTC'))
        ORDER BY "occurred_at" ASC
        LIMIT ${batchSize}::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING o."id", o."event_name", o."aggregate_type", o."aggregate_id",
                o."payload", o."occurred_at", o."attempts"
    `);
  }

  private async dispatch(row: ClaimedRow): Promise<void> {
    const envelope: DomainEventEnvelope = {
      eventId: row.id,
      eventName: row.event_name,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      occurredAt: row.occurred_at,
      payload: row.payload as Record<string, unknown>,
    };

    try {
      await this.emitter.emitAsync(row.event_name, envelope);
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: OutboxStatus.PROCESSED,
          processedAt: this.clock.now(),
          lockedUntil: null,
          lastError: null,
        },
      });
    } catch (error) {
      await this.recordFailure(row, error);
    }
  }

  private async recordFailure(row: ClaimedRow, error: unknown): Promise<void> {
    const { maxAttempts, retryBaseMs, retryMaxMs } = this.settings;
    const exhausted = row.attempts >= maxAttempts;
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, MAX_ERROR_LENGTH);

    if (exhausted) {
      this.logger.error(
        `Outbox event ${row.id} (${row.event_name}) exhausted ${row.attempts} attempts: ${message}`,
      );
    }

    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        lockedUntil: null,
        lastError: message,
        nextAttemptAt: new Date(
          this.clock.now().getTime() +
            computeRetryDelayMs(row.attempts, retryBaseMs, retryMaxMs),
        ),
      },
    });
  }
}
