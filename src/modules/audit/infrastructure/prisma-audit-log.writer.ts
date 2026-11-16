import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuditEntry,
  AuditLog,
} from '../../../shared/application/ports/audit-log.port.js';
import { REQUEST_CONTEXT } from '../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../shared/application/ports/request-context.port.js';
import { PrismaContext } from '../../../shared/infrastructure/prisma/prisma-context.js';

const USER_AGENT_MAX_LENGTH = 512;

const toJson = (
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined =>
  value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/** Writes through the ambient transaction, so an audit row exists if and only if the change committed. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLog {
  constructor(
    private readonly context: PrismaContext,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const request = this.requestContext.get();
    await this.context.client.auditLog.create({
      data: {
        userId: entry.actorId ?? request.principal?.id ?? null,
        action: entry.action,
        module: entry.module,
        entityName: entry.entityName,
        entityId: entry.entityId ?? null,
        oldValues: toJson(entry.oldValues),
        newValues: toJson(entry.newValues),
        ipAddress: request.ipAddress ?? null,
        userAgent: request.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        correlationId: request.correlationId ?? null,
      },
    });
  }
}
