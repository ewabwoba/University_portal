import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import {
  DomainError,
  UnauthenticatedError,
} from '../../../../shared/domain/domain-error.js';
import type { RefreshToken } from '../../domain/entities/refresh-token.entity.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/repositories/refresh-token.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import type { AuthTokens } from '../dto/auth-tokens.js';
import { OPAQUE_TOKEN_SERVICE } from '../ports/opaque-token.service.port.js';
import type { OpaqueTokenService } from '../ports/opaque-token.service.port.js';
import { SessionService } from '../services/session.service.js';

type Outcome =
  | { kind: 'success'; tokens: AuthTokens }
  | { kind: 'failure'; error: DomainError };

const invalid = (): Outcome => ({
  kind: 'failure',
  error: new UnauthenticatedError('Refresh token is invalid or expired.', {
    code: IdentityErrorCodes.REFRESH_TOKEN_INVALID,
  }),
});

/**
 * Rotating refresh tokens with reuse detection: presenting a token that was already rotated means
 * it leaked, so the whole token family (every descendant) is revoked and the user must sign in again.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(OPAQUE_TOKEN_SERVICE) private readonly opaque: OpaqueTokenService,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly session: SessionService,
  ) {}

  async execute(rawRefreshToken: string): Promise<AuthTokens> {
    const outcome = await this.transactions.run(() =>
      this.rotate(rawRefreshToken),
    );
    if (outcome.kind === 'failure') throw outcome.error;
    return outcome.tokens;
  }

  private async rotate(raw: string): Promise<Outcome> {
    const stored = await this.refreshTokens.findByHash(this.opaque.hash(raw));
    if (!stored) return invalid();

    const now = this.clock.now();
    if (stored.isRevoked) return this.reuseDetected(stored, now);
    if (stored.isExpired(now)) return invalid();

    const user = await this.users.findById(stored.userId);
    if (!user || !user.isActive) {
      await this.refreshTokens.revokeFamily(stored.familyId, now);
      return {
        kind: 'failure',
        error: new UnauthenticatedError('This account is disabled.', {
          code: IdentityErrorCodes.ACCOUNT_DISABLED,
        }),
      };
    }

    const next = this.session.prepareRefreshToken(
      user.id,
      now,
      stored.familyId,
    );
    // Losing this race means another request already rotated the same token: treat as reuse.
    if (!(await this.refreshTokens.rotate(stored.id, next.entity, now))) {
      return this.reuseDetected(stored, now);
    }

    return {
      kind: 'success',
      tokens: await this.session.buildTokens(user.id, next.raw, now),
    };
  }

  private async reuseDetected(
    stored: RefreshToken,
    now: Date,
  ): Promise<Outcome> {
    await this.refreshTokens.revokeFamily(stored.familyId, now);
    await this.audit.record({
      action: 'REFRESH_TOKEN_REUSE_DETECTED',
      module: 'identity',
      entityName: 'User',
      entityId: stored.userId,
      actorId: stored.userId,
      newValues: { familyId: stored.familyId },
    });
    return {
      kind: 'failure',
      error: new UnauthenticatedError(
        'Refresh token was already used. Please sign in again.',
        {
          code: IdentityErrorCodes.REFRESH_TOKEN_REUSED,
        },
      ),
    };
  }
}
