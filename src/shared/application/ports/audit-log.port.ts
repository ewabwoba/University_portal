export const AUDIT_LOG = Symbol('AUDIT_LOG');

export interface AuditEntry {
  /** Verb in SCREAMING_SNAKE_CASE, e.g. USER_CREATED, LOGIN_FAILED. */
  action: string;
  module: string;
  entityName: string;
  entityId?: string;
  /** Never put secrets (passwords, tokens, national ids) in these. */
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  /** For flows that have no authenticated principal yet (login). Defaults to the current principal. */
  actorId?: string;
}

export interface AuditLog {
  /** Writes in the ambient transaction, so the audit row commits or rolls back with the change. */
  record(entry: AuditEntry): Promise<void>;
}
