import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { requirePrincipal } from '../../../../shared/application/require-principal.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.js';
import type { RoleRepository } from '../../domain/repositories/role.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import { assertCanManageRoles } from '../../domain/services/role-grant-policy.js';

@Injectable()
export class AssignUserRolesUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  /** Replaces the user's roles. */
  async execute(input: { userId: string; roles: string[] }): Promise<void> {
    const principal = requirePrincipal(this.requestContext);
    if (principal.id === input.userId) {
      throw new ForbiddenError('You cannot change your own roles.', {
        code: IdentityErrorCodes.SELF_MODIFICATION,
      });
    }

    const requested = [...new Set(input.roles)];

    await this.transactions.run(async () => {
      const user = await this.users.findById(input.userId);
      if (!user)
        throw new NotFoundError('User not found.', {
          code: IdentityErrorCodes.USER_NOT_FOUND,
        });

      const current = user.roles;
      const changed = [
        ...requested.filter((r) => !current.includes(r)),
        ...current.filter((r) => !requested.includes(r)),
      ];
      const roleViews = await this.roles.findByNames([
        ...new Set([...requested, ...changed]),
      ]);

      const known = new Set(roleViews.map((role) => role.name));
      const missing = requested.filter((name) => !known.has(name));
      if (missing.length > 0) {
        throw new ValidationError('Unknown role(s).', {
          code: IdentityErrorCodes.ROLE_NOT_FOUND,
          details: { roles: missing },
        });
      }
      // Adding AND removing a role both require holding everything that role carries.
      assertCanManageRoles(
        principal.permissions,
        roleViews.filter((role) => changed.includes(role.name)),
      );

      user.assignRoles(requested);
      await this.users.update(user);
      await this.audit.record({
        action: 'USER_ROLES_CHANGED',
        module: 'identity',
        entityName: 'User',
        entityId: user.id,
        oldValues: { roles: current },
        newValues: { roles: requested },
      });
    });
  }
}
