import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Idempotent } from '../../../shared/presentation/decorators/idempotent.decorator.js';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator.js';
import { PolicyPermissions } from '../contracts/permissions.js';
import { PolicyResolverService } from '../application/use-cases/policy-use-cases.js';
import {
  ApprovePolicyVersionUseCase,
  CreatePolicyDraftUseCase,
  DiscardPolicyDraftUseCase,
  ListPolicyDefinitionsUseCase,
  ListPolicyVersionsUseCase,
} from '../application/use-cases/policy-use-cases.js';
import type { PolicyKey } from '../contracts/policy-values.js';
import type { PolicyVersion } from '../domain/entities/policy-version.entity.js';
import {
  CreatePolicyVersionDto,
  EffectivePolicyQueryDto,
} from './dto/policy.dto.js';

const toView = (v: PolicyVersion) => ({
  id: v.id,
  policyKey: v.policyKey,
  version: v.version,
  status: v.status,
  effectiveFrom: v.effectiveFrom,
  effectiveTo: v.effectiveTo,
  value: v.value,
  createdBy: v.createdBy,
  approvedBy: v.approvedBy,
  createdAt: v.createdAt,
});

@ApiTags('Policies')
@Controller('policies')
export class PoliciesController {
  constructor(
    private readonly definitions: ListPolicyDefinitionsUseCase,
    private readonly listVersions: ListPolicyVersionsUseCase,
    private readonly createDraft: CreatePolicyDraftUseCase,
    private readonly approve: ApprovePolicyVersionUseCase,
    private readonly discard: DiscardPolicyDraftUseCase,
    private readonly resolver: PolicyResolverService,
  ) {}

  @RequirePermissions(PolicyPermissions.READ)
  @Get('definitions')
  listDefinitions() {
    return this.definitions.execute();
  }

  @RequirePermissions(PolicyPermissions.READ)
  @Get(':key/versions')
  async versions(@Param('key') key: string) {
    return (await this.listVersions.execute(key)).map(toView);
  }

  @RequirePermissions(PolicyPermissions.READ)
  @Get(':key/effective')
  async effective(
    @Param('key') key: string,
    @Query() query: EffectivePolicyQueryDto,
  ) {
    return this.resolver.resolve(
      key as PolicyKey,
      query.at ? new Date(query.at) : undefined,
    );
  }

  @RequirePermissions(PolicyPermissions.DRAFT)
  @Idempotent()
  @Post(':key/versions')
  async draft(@Param('key') key: string, @Body() dto: CreatePolicyVersionDto) {
    return toView(
      await this.createDraft.execute({
        key,
        value: dto.value,
        effectiveFrom: new Date(dto.effectiveFrom),
      }),
    );
  }

  @RequirePermissions(PolicyPermissions.APPROVE)
  @HttpCode(HttpStatus.OK)
  @Post('versions/:id/approve')
  async approveVersion(@Param('id', ParseUUIDPipe) id: string) {
    return toView(await this.approve.execute(id));
  }

  @RequirePermissions(PolicyPermissions.DRAFT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('versions/:id')
  discardDraft(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.discard.execute(id);
  }
}
