/** Roles from BRD section 4. Created by the seed command; their permissions are editable by admins. */
export const SystemRoles = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  REGISTRAR: 'REGISTRAR',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  HOD: 'HOD',
  LECTURER: 'LECTURER',
  STUDENT: 'STUDENT',
} as const;
export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

export const SYSTEM_ROLE_DESCRIPTIONS: Record<SystemRole, string> = {
  SUPER_ADMIN: 'System super administrator. Always holds every permission.',
  REGISTRAR: 'Registrar / academic administrator',
  FINANCE_ADMIN: 'Finance administrator',
  FINANCE_OFFICER: 'Finance officer',
  HOD: 'Head of department / academic reviewer',
  LECTURER: 'Lecturer',
  STUDENT: 'Student',
};
