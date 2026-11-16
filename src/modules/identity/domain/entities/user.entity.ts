import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import { UserRegisteredEvent } from '../events/user-registered.event.js';
import { UserStatusChangedEvent } from '../events/user-status-changed.event.js';
import type { Email } from '../value-objects/email.vo.js';

export interface UserState {
  email: Email;
  passwordHash: string;
  phoneNumber: string | null;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  roles: string[];
  /** Optimistic-lock counter, incremented by the repository on every update. */
  version: number;
  createdAt: Date;
}

export class User extends AggregateRoot<string> {
  private constructor(
    id: string,
    private state: UserState,
  ) {
    super(id);
  }

  static register(input: {
    email: Email;
    passwordHash: string;
    phoneNumber?: string | null;
    roles: string[];
    now: Date;
  }): User {
    const user = new User(randomUUID(), {
      email: input.email,
      passwordHash: input.passwordHash,
      phoneNumber: input.phoneNumber ?? null,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      roles: [...new Set(input.roles)],
      version: 1,
      createdAt: input.now,
    });
    user.addEvent(
      new UserRegisteredEvent(user.id, {
        email: input.email.value,
        roles: user.roles,
      }),
    );
    return user;
  }

  /** Rebuilds an aggregate from persisted state. Raises no events. */
  static restore(id: string, state: UserState): User {
    return new User(id, { ...state, roles: [...state.roles] });
  }

  get email(): Email {
    return this.state.email;
  }
  get passwordHash(): string {
    return this.state.passwordHash;
  }
  get phoneNumber(): string | null {
    return this.state.phoneNumber;
  }
  get isActive(): boolean {
    return this.state.isActive;
  }
  get failedLoginAttempts(): number {
    return this.state.failedLoginAttempts;
  }
  get lockedUntil(): Date | null {
    return this.state.lockedUntil;
  }
  get lastLoginAt(): Date | null {
    return this.state.lastLoginAt;
  }
  get passwordChangedAt(): Date | null {
    return this.state.passwordChangedAt;
  }
  get roles(): string[] {
    return [...this.state.roles];
  }
  get version(): number {
    return this.state.version;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }

  isLocked(now: Date): boolean {
    return (
      this.state.lockedUntil !== null &&
      this.state.lockedUntil.getTime() > now.getTime()
    );
  }

  changePassword(newHash: string, now: Date): void {
    this.state.passwordHash = newHash;
    this.state.passwordChangedAt = now;
    this.state.failedLoginAttempts = 0;
    this.state.lockedUntil = null;
  }

  assignRoles(roles: string[]): void {
    this.state.roles = [...new Set(roles)];
  }

  deactivate(): void {
    if (!this.state.isActive) return;
    this.state.isActive = false;
    this.addEvent(new UserStatusChangedEvent(this.id, { isActive: false }));
  }

  activate(): void {
    if (this.state.isActive) return;
    this.state.isActive = true;
    this.addEvent(new UserStatusChangedEvent(this.id, { isActive: true }));
  }
}
