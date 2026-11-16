import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';

const MODULE_NAME = 'academic';

export class EntityAudit {
  constructor(
    private readonly audit: AuditLog,
    private readonly entityName: string,
  ) {}

  private action(verb: string): string {
    return `${this.entityName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_${verb}`;
  }

  created(id: string, values: Record<string, unknown>): Promise<void> {
    return this.audit.record({
      action: this.action('CREATED'),
      module: MODULE_NAME,
      entityName: this.entityName,
      entityId: id,
      newValues: values,
    });
  }

  updated(
    id: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action: this.action('UPDATED'),
      module: MODULE_NAME,
      entityName: this.entityName,
      entityId: id,
      oldValues,
      newValues,
    });
  }

  removed(id: string, oldValues: Record<string, unknown>): Promise<void> {
    return this.audit.record({
      action: this.action('REMOVED'),
      module: MODULE_NAME,
      entityName: this.entityName,
      entityId: id,
      oldValues,
    });
  }
}
