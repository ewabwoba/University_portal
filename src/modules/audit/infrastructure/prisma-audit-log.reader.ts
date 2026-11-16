import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaContext } from '../../../shared/infrastructure/prisma/prisma-context.js';
import type {
  AuditLogFilter,
  AuditLogReader,
  AuditLogView,
} from '../domain/repositories/audit-log.repository.js';

@Injectable()
export class PrismaAuditLogReader implements AuditLogReader {
  constructor(private readonly context: PrismaContext) {}

  async find(
    filter: AuditLogFilter,
    page: { skip: number; limit: number },
  ): Promise<{ items: AuditLogView[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entityName ? { entityName: filter.entityName } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
    };
    const [rows, total] = await Promise.all([
      this.context.client.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.limit,
        select: {
          id: true,
          userId: true,
          action: true,
          module: true,
          entityName: true,
          entityId: true,
          oldValues: true,
          newValues: true,
          ipAddress: true,
          correlationId: true,
          createdAt: true,
        },
      }),
      this.context.client.auditLog.count({ where }),
    ]);
    return { items: rows, total };
  }
}
