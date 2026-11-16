import { DomainEvent } from '../../../../shared/domain/domain-event.js';
import { IdentityEvents } from '../../contracts/events.js';

export class UserStatusChangedEvent extends DomainEvent<{ isActive: boolean }> {
  readonly eventName = IdentityEvents.USER_STATUS_CHANGED;
  readonly aggregateType = 'User';

  constructor(userId: string, payload: { isActive: boolean }) {
    super(userId, payload);
  }
}
