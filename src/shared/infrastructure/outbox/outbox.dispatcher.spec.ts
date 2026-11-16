import { OutboxStatus } from '@prisma/client';
import { OutboxDispatcher, computeRetryDelayMs } from './outbox.dispatcher.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const settings = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 10,
  maxAttempts: 3,
  lockTimeoutMs: 30_000,
  retryBaseMs: 2_000,
  retryMaxMs: 10_000,
};

const row = (id: string, occurredAt: string, attempts = 1) => ({
  id,
  event_name: 'finance.payment.confirmed',
  aggregate_type: 'Payment',
  aggregate_id: `agg-${id}`,
  payload: { amount: 100 },
  occurred_at: new Date(occurredAt),
  attempts,
});

function setup(rows: ReturnType<typeof row>[]) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    outboxEvent: { update: vi.fn().mockResolvedValue({}) },
  };
  const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };
  const dispatcher = new OutboxDispatcher(
    prisma as never,
    emitter as never,
    { now: () => NOW },
    { get: () => settings } as never,
  );
  return { dispatcher, prisma, emitter };
}

describe('computeRetryDelayMs', () => {
  it('backs off exponentially and caps at the maximum', () => {
    expect(computeRetryDelayMs(1, 2_000, 10_000)).toBe(2_000);
    expect(computeRetryDelayMs(2, 2_000, 10_000)).toBe(4_000);
    expect(computeRetryDelayMs(3, 2_000, 10_000)).toBe(8_000);
    expect(computeRetryDelayMs(4, 2_000, 10_000)).toBe(10_000);
  });
});

describe('OutboxDispatcher.tick', () => {
  it('delivers events in chronological order and marks them processed', async () => {
    const { dispatcher, prisma, emitter } = setup([
      row('b', '2026-11-10T09:00:02Z'),
      row('a', '2026-11-10T09:00:01Z'),
    ]);

    await expect(dispatcher.tick()).resolves.toBe(2);

    expect(
      emitter.emitAsync.mock.calls.map(([, envelope]) => envelope.eventId),
    ).toEqual(['a', 'b']);
    expect(emitter.emitAsync).toHaveBeenCalledWith(
      'finance.payment.confirmed',
      expect.objectContaining({
        aggregateType: 'Payment',
        aggregateId: 'agg-a',
        payload: { amount: 100 },
      }),
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({
          status: OutboxStatus.PROCESSED,
          processedAt: NOW,
        }),
      }),
    );
  });

  it('schedules a retry with backoff when a listener fails', async () => {
    const { dispatcher, prisma, emitter } = setup([
      row('a', '2026-11-10T09:00:00Z', 2),
    ]);
    emitter.emitAsync.mockRejectedValue(new Error('listener exploded'));

    await dispatcher.tick();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: {
        status: OutboxStatus.PENDING,
        lockedUntil: null,
        lastError: 'listener exploded',
        nextAttemptAt: new Date(NOW.getTime() + 4_000),
      },
    });
  });

  it('parks the event as FAILED once attempts are exhausted', async () => {
    const { dispatcher, prisma, emitter } = setup([
      row('a', '2026-11-10T09:00:00Z', 3),
    ]);
    emitter.emitAsync.mockRejectedValue(new Error('still broken'));

    await dispatcher.tick();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.FAILED }),
      }),
    );
  });

  it('never throws when the poll itself fails', async () => {
    const { dispatcher, prisma } = setup([]);
    prisma.$queryRaw.mockRejectedValue(new Error('db unreachable'));

    await expect(dispatcher.tick()).resolves.toBe(0);
  });
});
