import { UnauthenticatedError } from '../domain/domain-error.js';
import type { Principal } from './principal.js';
import type { RequestContextAccessor } from './ports/request-context.port.js';

export function requirePrincipal(context: RequestContextAccessor): Principal {
  const principal = context.get().principal;
  if (!principal) throw new UnauthenticatedError('Authentication is required.');
  return principal;
}
