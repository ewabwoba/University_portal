export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** Burns the same time as a real verification, so unknown accounts are not detectable by timing. */
  verifyDummy(plain: string): Promise<void>;
}
