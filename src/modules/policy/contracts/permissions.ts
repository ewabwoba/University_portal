import type { PermissionDefinition } from '../../../shared/application/permission-definition.js';

export const PolicyPermissions = {
  READ: 'policy:policy:read',
  DRAFT: 'policy:policy:draft',
  APPROVE: 'policy:policy:approve',
} as const;

export const POLICY_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    name: PolicyPermissions.READ,
    module: 'policy',
    description: 'View policies and their history',
  },
  {
    name: PolicyPermissions.DRAFT,
    module: 'policy',
    description: 'Propose or discard draft policy versions',
  },
  {
    name: PolicyPermissions.APPROVE,
    module: 'policy',
    description: 'Approve a policy version (never your own draft)',
  },
];
