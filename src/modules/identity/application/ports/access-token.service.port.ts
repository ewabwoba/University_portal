export const ACCESS_TOKEN_SERVICE = Symbol('ACCESS_TOKEN_SERVICE');

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export interface AccessTokenClaims {
  userId: string;
  issuedAt: Date;
}

export interface AccessTokenService {
  issue(userId: string, now: Date): Promise<IssuedAccessToken>;
  /** Throws UnauthenticatedError (TOKEN_INVALID) for anything not a valid, unexpired token of ours. */
  verify(token: string): Promise<AccessTokenClaims>;
}
