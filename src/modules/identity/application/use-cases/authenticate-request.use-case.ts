import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../../shared/application/principal.js';
import { UnauthenticatedError } from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { ACCESS_CONTEXT_READER } from '../ports/access-context-reader.port.js';
import type { AccessContextReader } from '../ports/access-context-reader.port.js';
import { ACCESS_TOKEN_SERVICE } from '../ports/access-token.service.port.js';
import type { AccessTokenService } from '../ports/access-token.service.port.js';

/**
 * Turns a bearer token into a Principal. The token proves identity only; roles, permissions and
 * account status are re-read on every request, so deactivation and role changes apply immediately.
 */
@Injectable()
export class AuthenticateRequestUseCase {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly tokens: AccessTokenService,
    @Inject(ACCESS_CONTEXT_READER) private readonly reader: AccessContextReader,
  ) {}

  async execute(token: string): Promise<Principal> {
    const claims = await this.tokens.verify(token);
    const context = await this.reader.load(claims.userId);

    if (!context || !context.isActive) {
      throw new UnauthenticatedError('This account is disabled.', {
        code: IdentityErrorCodes.ACCOUNT_DISABLED,
      });
    }

    // Tokens issued before the last password change are dead.
    if (context.passwordChangedAt) {
      if (claims.issuedAt.getTime() < context.passwordChangedAt.getTime()) {
        throw new UnauthenticatedError(
          'Session expired. Please sign in again.',
          { code: IdentityErrorCodes.TOKEN_INVALID },
        );
      }
    }

    return {
      id: context.id,
      email: context.email,
      roles: context.roles,
      permissions: new Set(context.permissions),
    };
  }
}
