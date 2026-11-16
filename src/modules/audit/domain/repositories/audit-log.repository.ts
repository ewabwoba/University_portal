export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');

export interface AuditLogView {
  id: string;
  userId: string | null;
  action: string;
  module: string;
  entityName: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export interface AuditLogFilter {
  entityName?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

/** Read-only by design: the audit trail is append-only and nothing in the application edits it. */
export interface AuditLogReader {
  find(
    filter: AuditLogFilter,
    page: { skip: number; limit: number },
  ): Promise<{ items: AuditLogView[]; total: number }>;
}
