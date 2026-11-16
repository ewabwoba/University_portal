import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolvePage,
  toPaginated,
} from '../../../../shared/application/pagination.js';
import type {
  PageQuery,
  Paginated,
} from '../../../../shared/application/pagination.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import { AUDIT_LOG_READER } from '../../domain/repositories/audit-log.repository.js';
import type {
  AuditLogFilter,
  AuditLogReader,
  AuditLogView,
} from '../../domain/repositories/audit-log.repository.js';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_READER) private readonly reader: AuditLogReader,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  async execute(
    query: PageQuery & AuditLogFilter,
  ): Promise<Paginated<AuditLogView>> {
    const page = resolvePage(
      query,
      this.config.get('pagination', { infer: true }),
    );
    const { entityName, entityId, userId, action } = query;
    const { items, total } = await this.reader.find(
      { entityName, entityId, userId, action },
      { skip: page.skip, limit: page.limit },
    );
    return toPaginated(items, total, page);
  }
}
