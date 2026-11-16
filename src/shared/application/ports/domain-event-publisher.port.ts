import type { DomainEvent } from '../../domain/domain-event.js';

export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');

export interface DomainEventPublisher {
  /**
   * Records events so they are delivered after commit. Call inside TransactionManager.run
   * so the events commit or roll back together with the business change.
   */
  publish(events: readonly DomainEvent[]): Promise<void>;
}
