import { randomUUID } from 'node:crypto';

/**
 * Something that happened in the domain. Subclasses fix `eventName` and `aggregateType`
 * (declare names once, in the owning module's contracts) and carry a JSON-safe payload.
 */
export abstract class DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  abstract readonly eventName: string;
  abstract readonly aggregateType: string;

  readonly eventId: string = randomUUID();
  readonly occurredAt: Date = new Date();

  protected constructor(
    readonly aggregateId: string,
    readonly payload: TPayload,
  ) {}
}

/**
 * The plain shape listeners receive after an event has travelled through the outbox.
 * Other modules type their `@OnEvent` handlers with this, never with the producer's class.
 */
export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: TPayload;
}
