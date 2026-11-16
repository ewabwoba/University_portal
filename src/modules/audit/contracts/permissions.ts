import type { PermissionDefinition } from '../../../shared/application/permission-definition.js';

export const AuditPermissions = { LOG_READ: 'audit:log:read' } as const;

export const AUDIT_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    name: AuditPermissions.LOG_READ,
    module: 'audit',
    description: 'View the audit trail',
  },
];
