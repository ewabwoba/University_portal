import { Injectable } from '@nestjs/common';
import type { RefreshToken as RefreshTokenRow } from '@prisma/client';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import { RefreshToken } from '../../domain/entities/refresh-token.entity.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';

const toDomain = (row: RefreshTokenRow): RefreshToken =>
  RefreshToken.restore(row.id, {
    userId: row.userId,
    familyId: row.familyId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  });

const toCreateData = (token: RefreshToken) => ({
  id: token.id,
  userId: token.userId,
  familyId: token.familyId,
  tokenHash: token.tokenHash,
  expiresAt: token.expiresAt,
  userAgent: token.userAgent,
  ipAddress: token.ipAddress,
  createdAt: token.createdAt,
});

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async save(token: RefreshToken): Promise<void> {
    await this.db.refreshToken.create({ data: toCreateData(token) });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async rotate(
    currentId: string,
    next: RefreshToken,
    now: Date,
  ): Promise<boolean> {
    // The `revokedAt: null` condition makes this a compare-and-swap: only one caller can win.
    const claimed = await this.db.refreshToken.updateMany({
      where: { id: currentId, revokedAt: null },
      data: { revokedAt: now, replacedByTokenId: next.id },
    });
    if (claimed.count === 0) return false;

    await this.db.refreshToken.create({ data: toCreateData(next) });
    return true;
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
