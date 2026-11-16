import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { requirePrincipal } from '../../../../shared/application/require-principal.js';
import {
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/repositories/refresh-token.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import { PasswordPolicy } from '../../domain/services/password-policy.js';
import { PASSWORD_HASHER } from '../ports/password-hasher.port.js';
import type { PasswordHasher } from '../ports/password-hasher.port.js';
import { PASSWORD_POLICY } from '../ports/policy.tokens.js';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_POLICY) private readonly policy: PasswordPolicy,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  /** Revokes every session: all refresh tokens, and (via passwordChangedAt) all access tokens. */
  async execute(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const principal = requirePrincipal(this.requestContext);
    const user = await this.users.findById(principal.id);
    if (!user)
      throw new NotFoundError('User not found.', {
        code: IdentityErrorCodes.USER_NOT_FOUND,
      });

    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw new ValidationError('The current password is incorrect.', {
        code: IdentityErrorCodes.CURRENT_PASSWORD_INCORRECT,
      });
    }
    this.policy.assertValid(input.newPassword, user.email);
    if (input.newPassword === input.currentPassword) {
      throw new ValidationError(
        'The new password must differ from the current one.',
        { code: IdentityErrorCodes.WEAK_PASSWORD },
      );
    }

    const newHash = await this.hasher.hash(input.newPassword);
    await this.transactions.run(async () => {
      const now = this.clock.now();
      user.changePassword(newHash, now);
      await this.users.update(user);
      await this.refreshTokens.revokeAllForUser(user.id, now);
      await this.audit.record({
        action: 'PASSWORD_CHANGED',
        module: 'identity',
        entityName: 'User',
        entityId: user.id,
      });
    });
  }
}
