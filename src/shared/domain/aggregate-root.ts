import { DomainEvent } from './domain-event.js';
import { Entity } from './entity.js';

export abstract class AggregateRoot<TId> extends Entity<TId> {
  private pendingEvents: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }

  /** Returns and clears the events raised since the last call. Called by use cases after persisting. */
  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
