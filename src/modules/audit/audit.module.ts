import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG } from '../../shared/application/ports/audit-log.port.js';
import { ListAuditLogsUseCase } from './application/use-cases/list-audit-logs.use-case.js';
import { AUDIT_LOG_READER } from './domain/repositories/audit-log.repository.js';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader.js';
import { PrismaAuditLogWriter } from './infrastructure/prisma-audit-log.writer.js';
import { AuditLogsController } from './presentation/audit-logs.controller.js';

/** Global so any module can inject the AUDIT_LOG port without importing this module. */
@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [
    ListAuditLogsUseCase,
    { provide: AUDIT_LOG, useClass: PrismaAuditLogWriter },
    { provide: AUDIT_LOG_READER, useClass: PrismaAuditLogReader },
  ],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
