import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { IS_PUBLIC_KEY } from '../../../../shared/constants/metadata.constants.js';
import { UnauthenticatedError } from '../../../../shared/domain/domain-error.js';
import type { AuthenticatedRequest } from '../../../../shared/presentation/http/request.types.js';
import { AuthenticateRequestUseCase } from '../../application/use-cases/authenticate-request.use-case.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/** Global guard: every route requires a valid bearer token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticate: AuthenticateRequestUseCase,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthenticatedError('A bearer token is required.', {
        code: IdentityErrorCodes.TOKEN_INVALID,
      });
    }

    const principal = await this.authenticate.execute(token);
    request.user = principal;
    this.requestContext.setPrincipal(principal);
    return true;
  }
}
