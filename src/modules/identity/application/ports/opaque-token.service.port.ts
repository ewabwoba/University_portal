export const OPAQUE_TOKEN_SERVICE = Symbol('OPAQUE_TOKEN_SERVICE');

export interface OpaqueTokenService {
  /** A new high-entropy secret: `raw` goes to the client, only `hash` is stored. */
  generate(): { raw: string; hash: string };
  hash(raw: string): string;
}
