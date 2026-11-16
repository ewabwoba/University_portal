import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../../shared/presentation/decorators/require-permissions.decorator.js';
import { IdentityPermissions } from '../../contracts/permissions.js';
import { ListRolesUseCase } from '../../application/use-cases/list-roles.use-case.js';
import { UpdateRolePermissionsUseCase } from '../../application/use-cases/update-role-permissions.use-case.js';
import { UpdateRolePermissionsDto } from '../dto/role.dto.js';

@ApiTags('Roles')
@Controller()
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly updatePermissions: UpdateRolePermissionsUseCase,
  ) {}

  @RequirePermissions(IdentityPermissions.ROLE_READ)
  @Get('roles')
  roles() {
    return this.listRoles.roleList();
  }

  @RequirePermissions(IdentityPermissions.ROLE_READ)
  @Get('permissions')
  permissions() {
    return this.listRoles.permissionCatalog();
  }

  @RequirePermissions(IdentityPermissions.ROLE_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('roles/:id/permissions')
  replacePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<void> {
    return this.updatePermissions.execute({
      roleId: id,
      permissions: dto.permissions,
    });
  }
}
