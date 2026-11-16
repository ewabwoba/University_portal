import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import {
  BusinessRuleViolationError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from '../errors/academic-error-codes.js';
import { requireInt } from '../validation.js';

export const OfferingStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type OfferingStatus =
  (typeof OfferingStatus)[keyof typeof OfferingStatus];

const MAX_CAPACITY = 5_000;
const CLASS_GROUP_PATTERN = /^[A-Z0-9]{1,10}$/;

export interface UnitOfferingState {
  unitId: string;
  semesterId: string;
  classGroup: string;
  capacity: number;
  enrolledCount: number;
  status: OfferingStatus;
}

/**
 * A unit delivered in a semester. `enrolledCount` is read-only here: seats are taken and returned
 * exclusively through the atomic OfferingCapacity operations, never by editing this aggregate.
 */
export class UnitOffering extends AggregateRoot<string> {
  private constructor(
    id: string,
    private state: UnitOfferingState,
  ) {
    super(id);
  }

  static create(input: {
    unitId: string;
    semesterId: string;
    classGroup?: string;
    capacity: number;
  }): UnitOffering {
    return new UnitOffering(randomUUID(), {
      unitId: input.unitId,
      semesterId: input.semesterId,
      classGroup: UnitOffering.classGroup(input.classGroup ?? 'A'),
      capacity: requireInt(input.capacity, 'capacity', 1, MAX_CAPACITY),
      enrolledCount: 0,
      status: OfferingStatus.OPEN,
    });
  }

  static restore(id: string, state: UnitOfferingState): UnitOffering {
    return new UnitOffering(id, { ...state });
  }

  private static classGroup(raw: string): string {
    const value = raw.trim().toUpperCase();
    if (!CLASS_GROUP_PATTERN.test(value)) {
      throw new ValidationError('classGroup must be 1-10 letters or digits.', {
        code: AcademicErrorCodes.CODE_INVALID,
      });
    }
    return value;
  }

  get unitId(): string {
    return this.state.unitId;
  }
  get semesterId(): string {
    return this.state.semesterId;
  }
  get classGroup(): string {
    return this.state.classGroup;
  }
  get capacity(): number {
    return this.state.capacity;
  }
  get enrolledCount(): number {
    return this.state.enrolledCount;
  }
  get status(): OfferingStatus {
    return this.state.status;
  }
  get seatsRemaining(): number {
    return this.state.capacity - this.state.enrolledCount;
  }

  changeCapacity(capacity: number): void {
    this.assertNotCancelled();
    requireInt(capacity, 'capacity', 1, MAX_CAPACITY);
    if (capacity < this.state.enrolledCount) {
      throw new BusinessRuleViolationError(
        `Capacity cannot drop below the ${this.state.enrolledCount} students already enrolled.`,
        {
          code: AcademicErrorCodes.CAPACITY_BELOW_ENROLMENT,
          details: { enrolled: this.state.enrolledCount },
        },
      );
    }
    this.state.capacity = capacity;
  }

  changeStatus(status: OfferingStatus): void {
    if (status === this.state.status) return;
    this.assertNotCancelled();
    if (status === OfferingStatus.CANCELLED && this.state.enrolledCount > 0) {
      throw new BusinessRuleViolationError(
        'An offering with enrolled students cannot be cancelled. Transfer or deregister them first.',
        {
          code: AcademicErrorCodes.OFFERING_HAS_ENROLMENTS,
          details: { enrolled: this.state.enrolledCount },
        },
      );
    }
    this.state.status = status;
  }

  private assertNotCancelled(): void {
    if (this.state.status === OfferingStatus.CANCELLED) {
      throw new BusinessRuleViolationError(
        'A cancelled offering cannot be changed.',
        { code: AcademicErrorCodes.OFFERING_CANCELLED },
      );
    }
  }
}
