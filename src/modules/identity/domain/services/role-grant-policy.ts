import { ForbiddenError } from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../errors/identity-error-codes.js';
import type { RoleView } from '../repositories/role.repository.js';

/**
 * Anti-escalation: nobody can grant (or revoke) a role that carries permissions they do not
 * hold themselves. Without this, anyone allowed to assign roles could make themselves SUPER_ADMIN.
 */
export function assertCanManageRoles(
  callerPermissions: ReadonlySet<string>,
  roles: RoleView[],
): void {
  for (const role of roles) {
    const missing = role.permissions.filter(
      (permission) => !callerPermissions.has(permission),
    );
    if (missing.length > 0) {
      throw new ForbiddenError(
        `You cannot manage the role ${role.name}: it carries permissions you do not hold.`,
        {
          code: IdentityErrorCodes.ROLE_ESCALATION,
          details: { role: role.name },
        },
      );
    }
  }
}

/** Same rule for individual permissions being added to or removed from a role. */
export function assertCanManagePermissions(
  callerPermissions: ReadonlySet<string>,
  permissions: string[],
): void {
  const missing = permissions.filter(
    (permission) => !callerPermissions.has(permission),
  );
  if (missing.length > 0) {
    throw new ForbiddenError(
      'You cannot grant or revoke permissions you do not hold.',
      {
        code: IdentityErrorCodes.ROLE_ESCALATION,
        details: { permissions: missing },
      },
    );
  }
}
