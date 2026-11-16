export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface PermissionView {
  id: string;
  name: string;
  module: string;
  description: string | null;
}

export interface RoleRepository {
  findAll(): Promise<RoleView[]>;
  findById(id: string): Promise<RoleView | null>;
  findByNames(names: string[]): Promise<RoleView[]>;
  findAllPermissions(): Promise<PermissionView[]>;
  /** Replaces the role's permission set. Call inside TransactionManager.run(). */
  replacePermissions(roleId: string, permissionNames: string[]): Promise<void>;
}
