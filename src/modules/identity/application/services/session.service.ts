import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import { RefreshToken } from '../../domain/entities/refresh-token.entity.js';
import { ACCESS_TOKEN_SERVICE } from '../ports/access-token.service.port.js';
import type { AccessTokenService } from '../ports/access-token.service.port.js';
import { OPAQUE_TOKEN_SERVICE } from '../ports/opaque-token.service.port.js';
import type { OpaqueTokenService } from '../ports/opaque-token.service.port.js';
import type { AuthTokens } from '../dto/auth-tokens.js';

const USER_AGENT_MAX_LENGTH = 512;

/** Builds the refresh/access token pair. Shared by login and refresh so both behave identically. */
@Injectable()
export class SessionService {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
    @Inject(OPAQUE_TOKEN_SERVICE) private readonly opaque: OpaqueTokenService,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  prepareRefreshToken(
    userId: string,
    now: Date,
    familyId?: string,
  ): { entity: RefreshToken; raw: string } {
    const { raw, hash } = this.opaque.generate();
    const { userAgent, ipAddress } = this.requestContext.get();
    const entity = RefreshToken.issue({
      userId,
      tokenHash: hash,
      now,
      ttlMs: this.config.get('auth', { infer: true }).refreshTtlMs,
      familyId,
      userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH),
      ipAddress,
    });
    return { entity, raw };
  }

  async buildTokens(
    userId: string,
    rawRefreshToken: string,
    now: Date,
  ): Promise<AuthTokens> {
    const access = await this.accessTokens.issue(userId, now);
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresInSeconds,
      refreshToken: rawRefreshToken,
    };
  }
}
