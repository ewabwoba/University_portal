import type { PermissionDefinition } from '../../../shared/application/permission-definition.js';

export const IdentityPermissions = {
  USER_CREATE: 'identity:user:create',
  USER_READ: 'identity:user:read',
  USER_ASSIGN_ROLES: 'identity:user:assign-roles',
  USER_CHANGE_STATUS: 'identity:user:change-status',
  ROLE_READ: 'identity:role:read',
  ROLE_MANAGE: 'identity:role:manage',
} as const;

export const IDENTITY_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    name: IdentityPermissions.USER_CREATE,
    module: 'identity',
    description: 'Create user accounts',
  },
  {
    name: IdentityPermissions.USER_READ,
    module: 'identity',
    description: 'View user accounts',
  },
  {
    name: IdentityPermissions.USER_ASSIGN_ROLES,
    module: 'identity',
    description: 'Assign roles to users',
  },
  {
    name: IdentityPermissions.USER_CHANGE_STATUS,
    module: 'identity',
    description: 'Activate or deactivate users',
  },
  {
    name: IdentityPermissions.ROLE_READ,
    module: 'identity',
    description: 'View roles and permissions',
  },
  {
    name: IdentityPermissions.ROLE_MANAGE,
    module: 'identity',
    description: 'Change the permissions of a role',
  },
];
