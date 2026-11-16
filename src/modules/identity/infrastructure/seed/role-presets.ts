import {
  ACADEMIC_PERMISSION_DEFINITIONS,
  AcademicPermissions,
} from '../../../academic-structure/contracts/permissions.js';
import { PolicyPermissions } from '../../../policy/contracts/permissions.js';
import type { SystemRole } from '../../contracts/system-roles.js';

const ALL_ACADEMIC = ACADEMIC_PERMISSION_DEFINITIONS.map(
  (permission) => permission.name,
);
const READ_STRUCTURE = [AcademicPermissions.STRUCTURE_READ];

/**
 * Initial permissions given to a role WHEN IT IS FIRST CREATED. After that, admins own the
 * assignment (PUT /roles/:id/permissions) and the seed never overwrites it. Set SEED_REAPPLY_PRESETS=true
 * to ADD any missing preset permissions to roles that already exist (it never removes anything).
 * SUPER_ADMIN is special: it is always synced to the full catalog.
 * Each later module appends its presets here.
 *
 * Policy approval is deliberately given to nobody but SUPER_ADMIN: proposers (REGISTRAR, FINANCE_ADMIN)
 * cannot approve their own proposals, and the university decides who else may.
 */
export const ROLE_PRESETS: Partial<Record<SystemRole, string[]>> = {
  REGISTRAR: [...ALL_ACADEMIC, PolicyPermissions.READ, PolicyPermissions.DRAFT],
  FINANCE_ADMIN: [
    ...READ_STRUCTURE,
    PolicyPermissions.READ,
    PolicyPermissions.DRAFT,
  ],
  FINANCE_OFFICER: [...READ_STRUCTURE],
  HOD: [...READ_STRUCTURE, PolicyPermissions.READ],
  LECTURER: [...READ_STRUCTURE],
  STUDENT: [...READ_STRUCTURE],
};
