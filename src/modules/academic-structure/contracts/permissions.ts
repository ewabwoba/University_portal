import type { PermissionDefinition } from '../../../shared/application/permission-definition.js';

export const AcademicPermissions = {
  STRUCTURE_READ: 'academic:structure:read',
  STRUCTURE_MANAGE: 'academic:structure:manage',
  CURRICULUM_MANAGE: 'academic:curriculum:manage',
  CALENDAR_MANAGE: 'academic:calendar:manage',
  OFFERING_MANAGE: 'academic:offering:manage',
} as const;

export const ACADEMIC_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    name: AcademicPermissions.STRUCTURE_READ,
    module: 'academic',
    description:
      'View campuses, faculties, departments, programmes, units, calendar, curriculum and offerings',
  },
  {
    name: AcademicPermissions.STRUCTURE_MANAGE,
    module: 'academic',
    description:
      'Create and edit campuses, faculties, departments, programmes and units',
  },
  {
    name: AcademicPermissions.CURRICULUM_MANAGE,
    module: 'academic',
    description: 'Map units to programmes, study years and prerequisites',
  },
  {
    name: AcademicPermissions.CALENDAR_MANAGE,
    module: 'academic',
    description: 'Manage academic years, semesters and registration windows',
  },
  {
    name: AcademicPermissions.OFFERING_MANAGE,
    module: 'academic',
    description: 'Create and manage unit offerings',
  },
];
