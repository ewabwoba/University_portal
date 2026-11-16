import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Principal } from '../../../../shared/application/principal.js';
import { AuthenticatedOnly } from '../../../../shared/presentation/decorators/authenticated-only.decorator.js';
import { CurrentPrincipal } from '../../../../shared/presentation/decorators/current-principal.decorator.js';
import { Public } from '../../../../shared/presentation/decorators/public.decorator.js';
import { StrictThrottle } from '../../../../shared/presentation/decorators/strict-throttle.decorator.js';
import type { AuthTokens } from '../../application/dto/auth-tokens.js';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case.js';
import { LoginUseCase } from '../../application/use-cases/login.use-case.js';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case.js';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case.js';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
} from '../dto/auth.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  @Public()
  @StrictThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.login.execute(dto);
  }

  @Public()
  @StrictThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  rotate(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.refresh.execute(dto.refreshToken);
  }

  @Public()
  @StrictThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  signOut(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.logoutUseCase.execute(dto.refreshToken);
  }

  @AuthenticatedOnly()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return {
      id: principal.id,
      email: principal.email,
      roles: principal.roles,
      permissions: [...principal.permissions].sort(),
    };
  }

  @AuthenticatedOnly()
  @StrictThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto): Promise<void> {
    return this.changePasswordUseCase.execute(dto);
  }
}
