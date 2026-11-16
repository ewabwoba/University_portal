export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

export interface IdempotencyBeginInput {
  principalId: string;
  key: string;
  requestHash: string;
}

export type IdempotencyBeginResult =
  | { kind: 'started' }
  | { kind: 'replay'; responseBody: unknown }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' };

export interface IdempotencyStore {
  begin(input: IdempotencyBeginInput): Promise<IdempotencyBeginResult>;
  complete(input: {
    principalId: string;
    key: string;
    responseBody: unknown;
  }): Promise<void>;
  /** Releases a key after a failed attempt so the client may retry with the same key. */
  abandon(input: { principalId: string; key: string }): Promise<void>;
}
