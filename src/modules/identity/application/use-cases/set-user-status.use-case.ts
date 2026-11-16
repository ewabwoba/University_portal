import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { DOMAIN_EVENT_PUBLISHER } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import type { DomainEventPublisher } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { requirePrincipal } from '../../../../shared/application/require-principal.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/repositories/refresh-token.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';

@Injectable()
export class SetUserStatusUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly events: DomainEventPublisher,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  async execute(input: { userId: string; active: boolean }): Promise<void> {
    const principal = requirePrincipal(this.requestContext);
    if (principal.id === input.userId) {
      throw new ForbiddenError('You cannot change your own account status.', {
        code: IdentityErrorCodes.SELF_MODIFICATION,
      });
    }

    await this.transactions.run(async () => {
      const user = await this.users.findById(input.userId);
      if (!user)
        throw new NotFoundError('User not found.', {
          code: IdentityErrorCodes.USER_NOT_FOUND,
        });

      const wasActive = user.isActive;
      if (input.active) user.activate();
      else user.deactivate();
      if (wasActive === user.isActive) return; // already in the requested state

      await this.users.update(user);
      if (!user.isActive)
        await this.refreshTokens.revokeAllForUser(user.id, this.clock.now());
      await this.events.publish(user.pullEvents());
      await this.audit.record({
        action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        module: 'identity',
        entityName: 'User',
        entityId: user.id,
        oldValues: { isActive: wasActive },
        newValues: { isActive: user.isActive },
      });
    });
  }
}
