import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions } from '../../../../shared/application/principal.js';
import {
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../../../shared/constants/metadata.constants.js';
import { ForbiddenError } from '../../../../shared/domain/domain-error.js';
import type { AuthenticatedRequest } from '../../../../shared/presentation/http/request.types.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';

/**
 * Global guard, runs after JwtAuthGuard. Deny by default: a route must declare @Public(),
 * @AuthenticatedOnly() or @RequirePermissions(...). A forgotten decorator fails closed.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    )
      return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      targets,
    );
    const authenticatedOnly = this.reflector.getAllAndOverride<
      boolean | undefined
    >(AUTHENTICATED_ONLY_KEY, targets);

    if (!required && !authenticatedOnly) {
      throw new ForbiddenError('This endpoint has no access policy.', {
        code: IdentityErrorCodes.ROUTE_NOT_AUTHORIZED,
      });
    }

    if (required) {
      const principal = context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>().user;
      if (!principal || !hasAllPermissions(principal, required)) {
        throw new ForbiddenError(
          'You do not have permission to perform this action.',
          {
            code: IdentityErrorCodes.PERMISSION_DENIED,
          },
        );
      }
    }
    return true;
  }
}
