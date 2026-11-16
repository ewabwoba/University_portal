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
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/repositories/refresh-token.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import { LockoutPolicy } from '../../domain/services/lockout-policy.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import type { AuthTokens } from '../dto/auth-tokens.js';
import { PASSWORD_HASHER } from '../ports/password-hasher.port.js';
import type { PasswordHasher } from '../ports/password-hasher.port.js';
import { LOCKOUT_POLICY } from '../ports/policy.tokens.js';
import { SessionService } from '../services/session.service.js';

type Outcome =
  | { kind: 'success'; tokens: AuthTokens }
  | { kind: 'failure'; error: DomainError };

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOCKOUT_POLICY) private readonly lockout: LockoutPolicy,
    private readonly session: SessionService,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<AuthTokens> {
    // Failures are RETURNED from the transaction (so lockout counters and audit rows commit)
    // and thrown only afterwards.
    const outcome = await this.transactions.run(() => this.attempt(input));
    if (outcome.kind === 'failure') throw outcome.error;
    return outcome.tokens;
  }

  private async attempt(input: {
    email: string;
    password: string;
  }): Promise<Outcome> {
    const email = this.parseEmail(input.email);
    const user = email ? await this.users.findByEmail(email) : null;

    if (!user) {
      await this.hasher.verifyDummy(input.password);
      return this.invalidCredentials();
    }

    const now = this.clock.now();
    const audit = (action: string, newValues?: Record<string, unknown>) =>
      this.audit.record({
        action,
        module: 'identity',
        entityName: 'User',
        entityId: user.id,
        actorId: user.id,
        newValues,
      });

    if (user.isLocked(now)) {
      await audit('LOGIN_BLOCKED_LOCKED');
      return {
        kind: 'failure',
        error: new UnauthenticatedError(
          'Too many failed attempts. Try again later.',
          {
            code: IdentityErrorCodes.ACCOUNT_LOCKED,
          },
        ),
      };
    }

    if (!(await this.hasher.verify(user.passwordHash, input.password))) {
      const attempts = await this.users.incrementFailedLogins(user.id);
      await audit('LOGIN_FAILED', { failedAttempts: attempts });
      if (this.lockout.shouldLock(attempts)) {
        const until = this.lockout.lockedUntil(now);
        await this.users.lockUntil(user.id, until);
        await audit('ACCOUNT_LOCKED', { lockedUntil: until.toISOString() });
      }
      return this.invalidCredentials();
    }

    if (!user.isActive) {
      await audit('LOGIN_BLOCKED_INACTIVE');
      return {
        kind: 'failure',
        error: new UnauthenticatedError('This account is disabled.', {
          code: IdentityErrorCodes.ACCOUNT_DISABLED,
        }),
      };
    }

    await this.users.recordSuccessfulLogin(user.id, now);
    const { entity, raw } = this.session.prepareRefreshToken(user.id, now);
    await this.refreshTokens.save(entity);
    const tokens = await this.session.buildTokens(user.id, raw, now);
    await audit('LOGIN_SUCCEEDED');
    return { kind: 'success', tokens };
  }

  private parseEmail(raw: string): Email | null {
    try {
      return Email.create(raw);
    } catch {
      return null;
    }
  }

  private invalidCredentials(): Outcome {
    return {
      kind: 'failure',
      error: new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE, {
        code: IdentityErrorCodes.INVALID_CREDENTIALS,
      }),
    };
  }
}
