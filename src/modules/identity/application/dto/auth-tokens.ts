export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
}
