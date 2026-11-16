import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.js';
import type {
  PermissionView,
  RoleRepository,
  RoleView,
} from '../../domain/repositories/role.repository.js';

@Injectable()
export class ListRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
  ) {}

  roleList(): Promise<RoleView[]> {
    return this.roles.findAll();
  }

  permissionCatalog(): Promise<PermissionView[]> {
    return this.roles.findAllPermissions();
  }
}
