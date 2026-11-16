import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Idempotent } from '../../../../shared/presentation/decorators/idempotent.decorator.js';
import { RequirePermissions } from '../../../../shared/presentation/decorators/require-permissions.decorator.js';
import { IdentityPermissions } from '../../contracts/permissions.js';
import { AssignUserRolesUseCase } from '../../application/use-cases/assign-user-roles.use-case.js';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case.js';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case.js';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case.js';
import { SetUserStatusUseCase } from '../../application/use-cases/set-user-status.use-case.js';
import {
  AssignRolesDto,
  CreateUserDto,
  ListUsersQueryDto,
} from '../dto/user.dto.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly assignRoles: AssignUserRolesUseCase,
    private readonly setStatus: SetUserStatusUseCase,
  ) {}

  @RequirePermissions(IdentityPermissions.USER_CREATE)
  @Idempotent()
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.registerUser.execute(dto);
  }

  @RequirePermissions(IdentityPermissions.USER_READ)
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.listUsers.execute(query);
  }

  @RequirePermissions(IdentityPermissions.USER_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.getUser.execute(id);
  }

  @RequirePermissions(IdentityPermissions.USER_ASSIGN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':id/roles')
  replaceRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<void> {
    return this.assignRoles.execute({ userId: id, roles: dto.roles });
  }

  @RequirePermissions(IdentityPermissions.USER_CHANGE_STATUS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.setStatus.execute({ userId: id, active: true });
  }

  @RequirePermissions(IdentityPermissions.USER_CHANGE_STATUS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.setStatus.execute({ userId: id, active: false });
  }
}
