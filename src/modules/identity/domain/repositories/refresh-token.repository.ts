import type { RefreshToken } from '../entities/refresh-token.entity.js';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  save(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /**
   * Atomically revokes `currentId` and stores `next`. Returns false (and stores nothing) if
   * `currentId` was already revoked, i.e. another request rotated it first.
   */
  rotate(currentId: string, next: RefreshToken, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
