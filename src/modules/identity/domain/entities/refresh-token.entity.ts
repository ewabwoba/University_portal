import { randomUUID } from 'node:crypto';
import { Entity } from '../../../../shared/domain/entity.js';

export interface RefreshTokenState {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

/** One link in a rotation chain. Only the hash of the secret is ever stored. */
export class RefreshToken extends Entity<string> {
  private constructor(
    id: string,
    private readonly state: RefreshTokenState,
  ) {
    super(id);
  }

  static issue(input: {
    userId: string;
    tokenHash: string;
    now: Date;
    ttlMs: number;
    familyId?: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): RefreshToken {
    return new RefreshToken(randomUUID(), {
      userId: input.userId,
      familyId: input.familyId ?? randomUUID(),
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.now.getTime() + input.ttlMs),
      revokedAt: null,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: input.now,
    });
  }

  static restore(id: string, state: RefreshTokenState): RefreshToken {
    return new RefreshToken(id, state);
  }

  get userId(): string {
    return this.state.userId;
  }
  get familyId(): string {
    return this.state.familyId;
  }
  get tokenHash(): string {
    return this.state.tokenHash;
  }
  get expiresAt(): Date {
    return this.state.expiresAt;
  }
  get revokedAt(): Date | null {
    return this.state.revokedAt;
  }
  get userAgent(): string | null {
    return this.state.userAgent;
  }
  get ipAddress(): string | null {
    return this.state.ipAddress;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }

  get isRevoked(): boolean {
    return this.state.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.state.expiresAt.getTime() <= now.getTime();
  }
}
