import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TypedConfigService } from '../../config/app-config.js';
import { ACCESS_CONTEXT_READER } from './application/ports/access-context-reader.port.js';
import { ACCESS_TOKEN_SERVICE } from './application/ports/access-token.service.port.js';
import { OPAQUE_TOKEN_SERVICE } from './application/ports/opaque-token.service.port.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port.js';
import {
  LOCKOUT_POLICY,
  PASSWORD_POLICY,
} from './application/ports/policy.tokens.js';
import { SessionService } from './application/services/session.service.js';
import { AssignUserRolesUseCase } from './application/use-cases/assign-user-roles.use-case.js';
import { AuthenticateRequestUseCase } from './application/use-cases/authenticate-request.use-case.js';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case.js';
import { GetUserUseCase } from './application/use-cases/get-user.use-case.js';
import { ListRolesUseCase } from './application/use-cases/list-roles.use-case.js';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case.js';
import { LoginUseCase } from './application/use-cases/login.use-case.js';
import { LogoutUseCase } from './application/use-cases/logout.use-case.js';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case.js';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case.js';
import { SetUserStatusUseCase } from './application/use-cases/set-user-status.use-case.js';
import { UpdateRolePermissionsUseCase } from './application/use-cases/update-role-permissions.use-case.js';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository.js';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository.js';
import { USER_REPOSITORY } from './domain/repositories/user.repository.js';
import { LockoutPolicy } from './domain/services/lockout-policy.js';
import { PasswordPolicy } from './domain/services/password-policy.js';
import { PrismaAccessContextReader } from './infrastructure/persistence/prisma-access-context.reader.js';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma-refresh-token.repository.js';
import { PrismaRoleRepository } from './infrastructure/persistence/prisma-role.repository.js';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository.js';
import { Argon2PasswordHasher } from './infrastructure/providers/argon2-password-hasher.js';
import { CryptoOpaqueTokenService } from './infrastructure/providers/crypto-opaque-token.service.js';
import { JoseAccessTokenService } from './infrastructure/providers/jose-access-token.service.js';
import { IdentitySeeder } from './infrastructure/seed/identity.seeder.js';
import { AuthController } from './presentation/controllers/auth.controller.js';
import { RolesController } from './presentation/controllers/roles.controller.js';
import { UsersController } from './presentation/controllers/users.controller.js';

@Module({
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    // use cases
    SessionService,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    ChangePasswordUseCase,
    AuthenticateRequestUseCase,
    RegisterUserUseCase,
    SetUserStatusUseCase,
    AssignUserRolesUseCase,
    UpdateRolePermissionsUseCase,
    ListUsersUseCase,
    GetUserUseCase,
    ListRolesUseCase,
    IdentitySeeder,
    // domain policies, built from configuration
    {
      provide: PASSWORD_POLICY,
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) =>
        new PasswordPolicy(
          config.get('security', { infer: true }).passwordMinLength,
        ),
    },
    {
      provide: LOCKOUT_POLICY,
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => {
        const { loginMaxAttempts, loginLockMs } = config.get('security', {
          infer: true,
        });
        return new LockoutPolicy(loginMaxAttempts, loginLockMs);
      },
    },
    // ports -> adapters
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: ACCESS_CONTEXT_READER, useClass: PrismaAccessContextReader },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JoseAccessTokenService },
    { provide: OPAQUE_TOKEN_SERVICE, useClass: CryptoOpaqueTokenService },
  ],
  // The guards are registered globally in AppModule and need these.
  exports: [AuthenticateRequestUseCase, IdentitySeeder],
})
export class IdentityModule {}
