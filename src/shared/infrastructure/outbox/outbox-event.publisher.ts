import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DomainEventPublisher } from '../../application/ports/domain-event-publisher.port.js';
import type { DomainEvent } from '../../domain/domain-event.js';
import { PrismaContext } from '../prisma/prisma-context.js';

@Injectable()
export class OutboxEventPublisher implements DomainEventPublisher {
  constructor(private readonly context: PrismaContext) {}

  async publish(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Publishing outside a transaction would break the atomic "state change + event" guarantee.
    if (!this.context.inTransaction) {
      throw new Error(
        'DomainEventPublisher.publish() must be called inside TransactionManager.run().',
      );
    }

    await this.context.client.outboxEvent.createMany({
      data: events.map((event) => ({
        id: event.eventId,
        eventName: event.eventName,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        // Normalise to plain JSON (Dates -> ISO strings) so what is stored is what listeners can rely on.
        payload: JSON.parse(
          JSON.stringify(event.payload),
        ) as Prisma.InputJsonObject,
        occurredAt: event.occurredAt,
      })),
    });
  }
}
