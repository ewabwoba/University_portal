import { ForbiddenError } from '../../../../shared/domain/domain-error.js';
import type { RoleView } from '../repositories/role.repository.js';
import {
  assertCanManagePermissions,
  assertCanManageRoles,
} from './role-grant-policy.js';

const role = (name: string, permissions: string[]): RoleView => ({
  id: name,
  name,
  description: null,
  isSystem: true,
  permissions,
});

describe('role grant policy (anti-escalation)', () => {
  const caller = new Set(['a:x:read', 'a:x:write']);

  it('allows managing roles whose permissions the caller fully holds', () => {
    expect(() =>
      assertCanManageRoles(caller, [role('R1', ['a:x:read']), role('R2', [])]),
    ).not.toThrow();
  });

  it('blocks a role carrying even one permission the caller lacks', () => {
    expect(() =>
      assertCanManageRoles(caller, [role('ADMIN', ['a:x:read', 'z:y:delete'])]),
    ).toThrow(ForbiddenError);
  });

  it('applies the same rule to individual permissions', () => {
    expect(() =>
      assertCanManagePermissions(caller, ['a:x:write']),
    ).not.toThrow();
    expect(() =>
      assertCanManagePermissions(caller, ['a:x:write', 'z:y:delete']),
    ).toThrow(/cannot grant or revoke/);
  });
});
