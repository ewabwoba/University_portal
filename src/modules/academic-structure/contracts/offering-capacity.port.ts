export const OFFERING_CAPACITY = Symbol('OFFERING_CAPACITY');

/**
 * The ONLY way seats are taken or returned. Each call is a single atomic database statement, so
 * simultaneous registrations can never oversubscribe an offering. Call inside the registration transaction:
 * if that transaction rolls back, the seat goes back with it.
 */
export interface OfferingCapacity {
  /** Throws NotFoundError (OFFERING_NOT_FOUND), BusinessRuleViolationError (OFFERING_NOT_OPEN | OFFERING_FULL). */
  reserveSeat(offeringId: string): Promise<void>;
  /** Idempotent floor at zero. */
  releaseSeat(offeringId: string): Promise<void>;
}
