import { DomainEvent } from '../../../../shared/domain/domain-event.js';
import { IdentityEvents } from '../../contracts/events.js';

export class UserRegisteredEvent extends DomainEvent<{
  email: string;
  roles: string[];
}> {
  readonly eventName = IdentityEvents.USER_REGISTERED;
  readonly aggregateType = 'User';

  constructor(userId: string, payload: { email: string; roles: string[] }) {
    super(userId, payload);
  }
}
