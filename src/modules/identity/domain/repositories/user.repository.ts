import type { User } from '../entities/user.entity.js';
import type { Email } from '../value-objects/email.vo.js';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserSummary {
  id: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  roles: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserListFilter {
  search?: string;
  isActive?: boolean;
}

/**
 * Write methods must be called inside TransactionManager.run(). `insert` and `update` are
 * optimistic: a stale aggregate raises ConcurrencyError.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  /** Raises ConflictError (EMAIL_ALREADY_REGISTERED) if the email is taken, even under a race. */
  insert(user: User): Promise<void>;
  update(user: User): Promise<void>;

  // Login bookkeeping is atomic and version-free, so concurrent guesses cannot dodge lockout.
  incrementFailedLogins(userId: string): Promise<number>;
  lockUntil(userId: string, until: Date): Promise<void>;
  recordSuccessfulLogin(userId: string, now: Date): Promise<void>;

  findSummaryById(id: string): Promise<UserSummary | null>;
  findSummaries(
    filter: UserListFilter,
    page: { skip: number; limit: number },
  ): Promise<{ items: UserSummary[]; total: number }>;
}
