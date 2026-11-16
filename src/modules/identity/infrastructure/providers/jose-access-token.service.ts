import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { UnauthenticatedError } from '../../../../shared/domain/domain-error.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/ports/access-token.service.port.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';

const ALGORITHM = 'HS256';
/** Millisecond-precision issue time. JWT `iat` is whole seconds, too coarse to compare with a password change. */
const ISSUED_AT_MS_CLAIM = 'iatMs';
const MS_PER_SECOND = 1_000;

@Injectable()
export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ConfigService) private readonly config: TypedConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(
      this.config.get('auth', { infer: true }).accessSecret,
    );
  }

  async issue(userId: string, now: Date): Promise<IssuedAccessToken> {
    const { issuer, audience, accessTtlSeconds } = this.config.get('auth', {
      infer: true,
    });
    const issuedAt = Math.floor(now.getTime() / MS_PER_SECOND);

    const token = await new SignJWT({ [ISSUED_AT_MS_CLAIM]: now.getTime() })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + accessTtlSeconds)
      .sign(this.key);

    return { token, expiresInSeconds: accessTtlSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { issuer, audience } = this.config.get('auth', { infer: true });
    try {
      // Pinning the algorithm prevents "alg: none" and key-confusion downgrade attacks.
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer,
        audience,
        currentDate: this.clock.now(),
      });
      const issuedAtMs = payload[ISSUED_AT_MS_CLAIM];
      if (!payload.sub || typeof issuedAtMs !== 'number')
        throw new Error('missing claims');
      return { userId: payload.sub, issuedAt: new Date(issuedAtMs) };
    } catch {
      throw new UnauthenticatedError('Invalid or expired token.', {
        code: IdentityErrorCodes.TOKEN_INVALID,
      });
    }
  }
}
