import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import {
  BusinessRuleViolationError,
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { PolicyVersionApprovedEvent } from '../events/policy-version-approved.event.js';
import { PolicyErrorCodes } from '../errors/policy-error-codes.js';

export const PolicyStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
} as const;
export type PolicyStatus = (typeof PolicyStatus)[keyof typeof PolicyStatus];

export interface PolicyVersionState {
  policyKey: string;
  version: number;
  value: unknown;
  status: PolicyStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: Date;
}

/**
 * One numbered revision of a policy. Drafts are proposals; approval makes a revision binding from its
 * `effectiveFrom`. History is never edited, so any past decision can be re-evaluated under the exact
 * rules that applied at the time.
 */
export class PolicyVersion extends AggregateRoot<string> {
  private constructor(
    id: string,
    private state: PolicyVersionState,
  ) {
    super(id);
  }

  static draft(input: {
    policyKey: string;
    version: number;
    value: unknown;
    effectiveFrom: Date;
    createdBy: string;
    now: Date;
  }): PolicyVersion {
    if (Number.isNaN(input.effectiveFrom.getTime())) {
      throw new ValidationError('The effective date is not a valid date.', {
        code: PolicyErrorCodes.EFFECTIVE_DATE_INVALID,
      });
    }
    return new PolicyVersion(randomUUID(), {
      policyKey: input.policyKey,
      version: input.version,
      value: input.value,
      status: PolicyStatus.DRAFT,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      createdBy: input.createdBy,
      approvedBy: null,
      createdAt: input.now,
    });
  }

  static restore(id: string, state: PolicyVersionState): PolicyVersion {
    return new PolicyVersion(id, { ...state });
  }

  get policyKey(): string {
    return this.state.policyKey;
  }
  get version(): number {
    return this.state.version;
  }
  get value(): unknown {
    return this.state.value;
  }
  get status(): PolicyStatus {
    return this.state.status;
  }
  get effectiveFrom(): Date {
    return this.state.effectiveFrom;
  }
  get effectiveTo(): Date | null {
    return this.state.effectiveTo;
  }
  get createdBy(): string | null {
    return this.state.createdBy;
  }
  get approvedBy(): string | null {
    return this.state.approvedBy;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }

  /** Separation of duties: the person who proposed a policy can never approve it. */
  approve(approverId: string): void {
    if (this.state.status !== PolicyStatus.DRAFT) {
      throw new BusinessRuleViolationError('Only a draft can be approved.', {
        code: PolicyErrorCodes.NOT_A_DRAFT,
      });
    }
    if (this.state.createdBy === approverId) {
      throw new ForbiddenError(
        'You cannot approve a policy version you proposed.',
        { code: PolicyErrorCodes.SELF_APPROVAL },
      );
    }
    this.state.status = PolicyStatus.ACTIVE;
    this.state.approvedBy = approverId;
    this.addEvent(
      new PolicyVersionApprovedEvent(this.id, {
        policyKey: this.state.policyKey,
        version: this.state.version,
        effectiveFrom: this.state.effectiveFrom.toISOString(),
      }),
    );
  }

  /**
   * Ends this revision when its successor takes over. Supersession is purely date-based: the revision stays
   * resolvable for any moment before `successorEffectiveFrom`. (RETIRED is reserved for an explicit
   * "withdraw" action and is not set by supersession.)
   */
  supersede(successorEffectiveFrom: Date): void {
    this.state.effectiveTo = successorEffectiveFrom;
  }

  isEffectiveAt(at: Date): boolean {
    const t = at.getTime();
    return (
      this.state.status !== PolicyStatus.DRAFT &&
      this.state.effectiveFrom.getTime() <= t &&
      (this.state.effectiveTo === null || this.state.effectiveTo.getTime() > t)
    );
  }
}
