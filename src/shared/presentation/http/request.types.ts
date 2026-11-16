import type { Request } from 'express';
import type { Principal } from '../../application/principal.js';

/** `user` is set by the JWT guard. */
export interface AuthenticatedRequest extends Request {
  user?: Principal;
}

/** The request id assigned by the logger middleware; echoed to clients as `correlationId`. */
export function correlationIdOf(req: Request): string | undefined {
  const id = (req as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}
