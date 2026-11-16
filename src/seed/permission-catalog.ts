import type { PermissionDefinition } from '../shared/application/permission-definition.js';
import { ACADEMIC_PERMISSION_DEFINITIONS } from '../modules/academic-structure/contracts/permissions.js';
import { POLICY_PERMISSION_DEFINITIONS } from '../modules/policy/contracts/permissions.js';
import { AUDIT_PERMISSION_DEFINITIONS } from '../modules/audit/contracts/permissions.js';
import { IDENTITY_PERMISSION_DEFINITIONS } from '../modules/identity/contracts/permissions.js';

/** Every permission in the system. Each new module appends its definitions here. */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  ...IDENTITY_PERMISSION_DEFINITIONS,
  ...AUDIT_PERMISSION_DEFINITIONS,
  ...POLICY_PERMISSION_DEFINITIONS,
  ...ACADEMIC_PERMISSION_DEFINITIONS,
];
