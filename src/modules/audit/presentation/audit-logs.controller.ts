import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../../../shared/presentation/pagination/pagination-query.dto.js';
import { ListAuditLogsUseCase } from '../application/use-cases/list-audit-logs.use-case.js';
import { AuditPermissions } from '../contracts/permissions.js';

const FIELD_MAX_LENGTH = 100;

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(FIELD_MAX_LENGTH) entityName?: string;
  @IsOptional() @IsString() @MaxLength(FIELD_MAX_LENGTH) entityId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MaxLength(FIELD_MAX_LENGTH) action?: string;
}

@ApiTags('Audit')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly listAuditLogs: ListAuditLogsUseCase) {}

  @RequirePermissions(AuditPermissions.LOG_READ)
  @Get()
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.listAuditLogs.execute(query);
  }
}
