import type { Principal } from '../principal.js';

export const REQUEST_CONTEXT = Symbol('REQUEST_CONTEXT');

export interface RequestContext {
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  principal?: Principal;
}

/**
 * Per-request facts (who, from where) available to use cases and adapters without threading
 * them through every call. Backed by AsyncLocalStorage.
 */
export interface RequestContextAccessor {
  get(): Readonly<RequestContext>;
  run<T>(context: RequestContext, work: () => T): T;
  setPrincipal(principal: Principal): void;
}
