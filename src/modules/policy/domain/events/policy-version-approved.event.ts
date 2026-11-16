import { DomainEvent } from '../../../../shared/domain/domain-event.js';
import { PolicyEvents } from '../../contracts/events.js';

export class PolicyVersionApprovedEvent extends DomainEvent<{
  policyKey: string;
  version: number;
  effectiveFrom: string;
}> {
  readonly eventName = PolicyEvents.VERSION_APPROVED;
  readonly aggregateType = 'PolicyVersion';

  constructor(
    id: string,
    payload: { policyKey: string; version: number; effectiveFrom: string },
  ) {
    super(id, payload);
  }
}
