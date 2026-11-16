import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxStatus } from '@prisma/client';
import { buildConfiguration } from '../../src/config/configuration.js';
import type {
  AppConfig,
  TypedConfigService,
} from '../../src/config/app-config.js';
import { DomainEvent } from '../../src/shared/domain/domain-event.js';
import { PrismaIdempotencyStore } from '../../src/shared/infrastructure/idempotency/prisma-idempotency.store.js';
import { OutboxDispatcher } from '../../src/shared/infrastructure/outbox/outbox.dispatcher.js';
import { OutboxEventPublisher } from '../../src/shared/infrastructure/outbox/outbox-event.publisher.js';
import { PrismaContext } from '../../src/shared/infrastructure/prisma/prisma-context.js';
import { PrismaTransactionManager } from '../../src/shared/infrastructure/prisma/prisma-transaction.manager.js';
import { SystemClock } from '../../src/shared/infrastructure/time/system.clock.js';
import { createTestPrisma, resetDatabase } from '../support/database.js';
import { validEnv } from '../support/valid-env.js';

class ProbeEvent extends DomainEvent<{ n: number }> {
  readonly eventName = 'test.probe';
  readonly aggregateType = 'Probe';
  constructor(id: string, payload: { n: number }) {
    super(id, payload);
  }
}

const settings: AppConfig = buildConfiguration({
  ...validEnv,
  OUTBOX_BATCH_SIZE: '2',
  OUTBOX_MAX_ATTEMPTS: '3',
});
const config = {
  get: (key: keyof AppConfig) => settings[key],
} as unknown as TypedConfigService;
const clock = new SystemClock();

describe('shared infrastructure on PostgreSQL', () => {
  const prisma = createTestPrisma();
  const context = new PrismaContext(prisma);
  const transactions = new PrismaTransactionManager(prisma, context, config);
  const publisher = new OutboxEventPublisher(context);

  beforeAll(() => prisma.$connect());
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  describe('TransactionManager', () => {
    const permissionCount = () => prisma.permission.count();
    const create = (name: string) =>
      context.client.permission.create({ data: { name, module: 'test' } });

    it('commits everything written through the context', async () => {
      await transactions.run(async () => {
        await create('a:b:c');
        expect(context.inTransaction).toBe(true);
      });
      expect(context.inTransaction).toBe(false);
      expect(await permissionCount()).toBe(1);
    });

    it('rolls everything back when the work throws', async () => {
      await expect(
        transactions.run(async () => {
          await create('a:b:c');
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await permissionCount()).toBe(0);
    });

    it('lets a nested call (e.g. another module) join the same transaction', async () => {
      await expect(
        transactions.run(async () => {
          await create('outer');
          await transactions.run(() => create('inner'));
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await permissionCount()).toBe(0); // the inner write was rolled back with the outer
    });

    it('keeps concurrent, simultaneously-open transactions isolated from each other', async () => {
      // Both transactions must be open at the same time, so each waits for the other's write.
      const barrier = () => {
        let release!: () => void;
        const reached = new Promise<void>((resolve) => (release = resolve));
        return { reached, release };
      };
      const first = barrier();
      const second = barrier();

      const visibleToFirst = transactions.run(async () => {
        await create('t1');
        first.release();
        await second.reached;
        return context.client.permission.count();
      });
      const visibleToSecond = transactions.run(async () => {
        await create('t2');
        second.release();
        await first.reached;
        return context.client.permission.count();
      });

      // Each sees only its own uncommitted row: neither the data nor the ambient client leaks across.
      expect(await Promise.all([visibleToFirst, visibleToSecond])).toEqual([
        1, 1,
      ]);
      expect(await permissionCount()).toBe(2);
    });
  });

  describe('outbox', () => {
    it('stores events with the business change, and drops them on rollback', async () => {
      await transactions.run(() =>
        publisher.publish([new ProbeEvent('a1', { n: 1 })]),
      );
      await expect(
        transactions.run(async () => {
          await publisher.publish([new ProbeEvent('a2', { n: 2 })]);
          throw new Error('rollback');
        }),
      ).rejects.toThrow();

      const rows = await prisma.outboxEvent.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        aggregateId: 'a1',
        status: OutboxStatus.PENDING,
        eventName: 'test.probe',
      });
    });

    it('refuses to publish outside a transaction', async () => {
      await expect(
        publisher.publish([new ProbeEvent('a', { n: 1 })]),
      ).rejects.toThrow(/inside TransactionManager/);
    });

    const setup = () => {
      const emitter = new EventEmitter2();
      const seen: number[] = [];
      const handler = vi.fn(async (envelope: { payload: { n: number } }) => {
        seen.push(envelope.payload.n);
      });
      emitter.on('test.probe', handler);
      return {
        emitter,
        seen,
        handler,
        dispatcher: new OutboxDispatcher(prisma, emitter, clock, config),
      };
    };

    const publishMany = (count: number) =>
      transactions.run(() =>
        publisher.publish(
          Array.from(
            { length: count },
            (_, i) => new ProbeEvent(`agg-${i}`, { n: i }),
          ),
        ),
      );

    it('delivers in order, batch by batch, and marks events processed', async () => {
      const { dispatcher, seen } = setup();
      await publishMany(3);

      expect(await dispatcher.tick()).toBe(2); // batch size 2
      expect(await dispatcher.tick()).toBe(1);
      expect(await dispatcher.tick()).toBe(0);

      expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2]);
      const rows = await prisma.outboxEvent.findMany();
      expect(
        rows.every(
          (row) =>
            row.status === OutboxStatus.PROCESSED && row.processedAt !== null,
        ),
      ).toBe(true);
    });

    it('retries a failing listener with backoff, then parks the event as FAILED', async () => {
      const { dispatcher, handler } = setup();
      handler.mockRejectedValue(new Error('listener down'));
      await publishMany(1);

      expect(await dispatcher.tick()).toBe(1);
      let row = await prisma.outboxEvent.findFirstOrThrow();
      expect(row).toMatchObject({
        status: OutboxStatus.PENDING,
        attempts: 1,
        lastError: 'listener down',
      });
      expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(await dispatcher.tick()).toBe(0); // not due yet

      const makeDue = () =>
        prisma.$executeRaw`UPDATE "outbox_events" SET "next_attempt_at" = now() - interval '1 minute'`;
      await makeDue();
      await dispatcher.tick(); // attempt 2
      await makeDue();
      await dispatcher.tick(); // attempt 3 = maxAttempts

      row = await prisma.outboxEvent.findFirstOrThrow();
      expect(row).toMatchObject({ status: OutboxStatus.FAILED, attempts: 3 });
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('reclaims an event whose worker crashed mid-processing', async () => {
      const { dispatcher, handler } = setup();
      await publishMany(1);
      await prisma.$executeRaw`UPDATE "outbox_events" SET "status" = 'PROCESSING', "locked_until" = now() - interval '1 minute', "attempts" = 1`;

      expect(await dispatcher.tick()).toBe(1);
      expect(handler).toHaveBeenCalledOnce();
      expect((await prisma.outboxEvent.findFirstOrThrow()).status).toBe(
        OutboxStatus.PROCESSED,
      );
    });

    it('never delivers an event twice when several dispatchers run at once', async () => {
      const emitter = new EventEmitter2();
      const delivered: string[] = [];
      emitter.on('test.probe', async (envelope: { eventId: string }) => {
        delivered.push(envelope.eventId);
      });
      const workers = [1, 2, 3].map(
        () => new OutboxDispatcher(prisma, emitter, clock, config),
      );
      await publishMany(20);

      let processed = 0;
      while (processed < 20) {
        const counts = await Promise.all(
          workers.map((worker) => worker.tick()),
        );
        const batch = counts.reduce((a, b) => a + b, 0);
        if (batch === 0) break;
        processed += batch;
      }

      expect(delivered).toHaveLength(20);
      expect(new Set(delivered).size).toBe(20);
    });
  });

  describe('idempotency store', () => {
    const store = new PrismaIdempotencyStore(prisma, clock, config);
    const base = { principalId: 'user-1', key: 'key-1', requestHash: 'hash-a' };

    it('runs once, then replays the stored response', async () => {
      expect(await store.begin(base)).toEqual({ kind: 'started' });
      expect(await store.begin(base)).toEqual({ kind: 'in_progress' });

      await store.complete({
        ...base,
        responseBody: { id: 'p1', amount: 500 },
      });
      expect(await store.begin(base)).toEqual({
        kind: 'replay',
        responseBody: { id: 'p1', amount: 500 },
      });
    });

    it('flags reuse of a key with a different request', async () => {
      await store.begin(base);
      expect(await store.begin({ ...base, requestHash: 'hash-b' })).toEqual({
        kind: 'mismatch',
      });
    });

    it('scopes keys per principal', async () => {
      await store.begin(base);
      expect(await store.begin({ ...base, principalId: 'user-2' })).toEqual({
        kind: 'started',
      });
    });

    it('lets the client retry after a failure is abandoned', async () => {
      await store.begin(base);
      await store.abandon(base);
      expect(await store.begin(base)).toEqual({ kind: 'started' });
    });

    it('never discards a COMPLETED response when abandon is called', async () => {
      await store.begin(base);
      await store.complete({ ...base, responseBody: { ok: true } });
      await store.abandon(base);
      expect(await store.begin(base)).toEqual({
        kind: 'replay',
        responseBody: { ok: true },
      });
    });

    it('reclaims an expired key (crashed worker or elapsed retention)', async () => {
      await store.begin(base);
      await prisma.$executeRaw`UPDATE "idempotency_keys" SET "expires_at" = now() - interval '1 minute'`;
      expect(await store.begin(base)).toEqual({ kind: 'started' });
    });

    it('lets exactly one of many concurrent first requests proceed', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => store.begin(base)),
      );
      expect(results.filter((r) => r.kind === 'started')).toHaveLength(1);
      expect(results.filter((r) => r.kind === 'in_progress')).toHaveLength(7);
    });
  });
});
