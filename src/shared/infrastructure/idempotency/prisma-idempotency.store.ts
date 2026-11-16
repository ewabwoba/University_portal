import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { CLOCK } from '../../application/ports/clock.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type {
  IdempotencyBeginInput,
  IdempotencyBeginResult,
  IdempotencyStore,
} from '../../application/ports/idempotency-store.port.js';
import type { TypedConfigService } from '../../../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';

const UNIQUE_VIOLATION = 'P2002';
/** begin() retries once after clearing an expired or concurrently-deleted row. */
const MAX_BEGIN_ATTEMPTS = 2;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION;

/**
 * Uses the base client on purpose: idempotency bookkeeping must commit independently of the
 * business transaction, so a rolled-back operation can still be retried under the same key.
 */
@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  private get settings() {
    return this.config.get('idempotency', { infer: true });
  }

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyBeginResult> {
    const { principalId, key, requestHash } = input;

    for (let attempt = 0; attempt < MAX_BEGIN_ATTEMPTS; attempt++) {
      const now = this.clock.now();

      try {
        await this.prisma.idempotencyKey.create({
          data: {
            principalId,
            key,
            requestHash,
            status: IdempotencyStatus.IN_PROGRESS,
            // While running, the row only "locks" the key for the lock timeout, so a crashed
            // worker cannot block the client for the full retention period.
            expiresAt: new Date(now.getTime() + this.settings.lockTimeoutMs),
          },
        });
        return { kind: 'started' };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { principalId_key: { principalId, key } },
      });
      if (!existing) continue; // deleted between our insert and read: try again

      if (existing.expiresAt <= now) {
        await this.prisma.idempotencyKey.deleteMany({
          where: { id: existing.id, expiresAt: { lte: now } },
        });
        continue;
      }

      if (existing.requestHash !== requestHash) return { kind: 'mismatch' };
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return { kind: 'replay', responseBody: existing.responseBody };
      }
      return { kind: 'in_progress' };
    }

    return { kind: 'in_progress' };
  }

  async complete(input: {
    principalId: string;
    key: string;
    responseBody: unknown;
  }): Promise<void> {
    const now = this.clock.now();
    const { principalId, key, responseBody } = input;

    await this.prisma.idempotencyKey.updateMany({
      where: { principalId, key },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseBody:
          responseBody === undefined || responseBody === null
            ? Prisma.JsonNull
            : (JSON.parse(
                JSON.stringify(responseBody),
              ) as Prisma.InputJsonValue),
        completedAt: now,
        expiresAt: new Date(now.getTime() + this.settings.ttlMs),
      },
    });
  }

  async abandon(input: { principalId: string; key: string }): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: { ...input, status: IdempotencyStatus.IN_PROGRESS },
    });
  }
}
