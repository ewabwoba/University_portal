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
import { SystemRoles } from '../../contracts/system-roles.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.js';
import type { RoleRepository } from '../../domain/repositories/role.repository.js';
import { assertCanManagePermissions } from '../../domain/services/role-grant-policy.js';

@Injectable()
export class UpdateRolePermissionsUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  /** Replaces the role's permission set. */
  async execute(input: {
    roleId: string;
    permissions: string[];
  }): Promise<void> {
    const principal = requirePrincipal(this.requestContext);
    const requested = [...new Set(input.permissions)];

    await this.transactions.run(async () => {
      const role = await this.roles.findById(input.roleId);
      if (!role)
        throw new NotFoundError('Role not found.', {
          code: IdentityErrorCodes.ROLE_NOT_FOUND,
        });
      if (role.name === SystemRoles.SUPER_ADMIN) {
        throw new ForbiddenError(
          'The SUPER_ADMIN role always holds every permission and cannot be edited.',
          {
            code: IdentityErrorCodes.ROLE_IMMUTABLE,
          },
        );
      }

      const catalog = new Set(
        (await this.roles.findAllPermissions()).map(
          (permission) => permission.name,
        ),
      );
      const unknown = requested.filter((name) => !catalog.has(name));
      if (unknown.length > 0) {
        throw new ValidationError('Unknown permission(s).', {
          code: IdentityErrorCodes.PERMISSION_NOT_FOUND,
          details: { permissions: unknown },
        });
      }

      const changed = [
        ...requested.filter((p) => !role.permissions.includes(p)),
        ...role.permissions.filter((p) => !requested.includes(p)),
      ];
      assertCanManagePermissions(principal.permissions, changed);

      await this.roles.replacePermissions(role.id, requested);
      await this.audit.record({
        action: 'ROLE_PERMISSIONS_CHANGED',
        module: 'identity',
        entityName: 'Role',
        entityId: role.id,
        oldValues: { permissions: role.permissions },
        newValues: { permissions: requested },
      });
    });
  }
}
