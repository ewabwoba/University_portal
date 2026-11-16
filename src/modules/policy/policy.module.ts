import { Module } from '@nestjs/common';
import { POLICY_RESOLVER } from './contracts/policy-resolver.port.js';
import {
  ApprovePolicyVersionUseCase,
  CreatePolicyDraftUseCase,
  DiscardPolicyDraftUseCase,
  ListPolicyDefinitionsUseCase,
  ListPolicyVersionsUseCase,
  PolicyResolverService,
} from './application/use-cases/policy-use-cases.js';
import { POLICY_VERSION_REPOSITORY } from './domain/repositories/policy-version.repository.js';
import { PrismaPolicyVersionRepository } from './infrastructure/prisma-policy-version.repository.js';
import { PoliciesController } from './presentation/policies.controller.js';

@Module({
  controllers: [PoliciesController],
  providers: [
    ListPolicyDefinitionsUseCase,
    ListPolicyVersionsUseCase,
    CreatePolicyDraftUseCase,
    ApprovePolicyVersionUseCase,
    DiscardPolicyDraftUseCase,
    PolicyResolverService,
    {
      provide: POLICY_VERSION_REPOSITORY,
      useClass: PrismaPolicyVersionRepository,
    },
    // The ONLY way other modules read policies.
    { provide: POLICY_RESOLVER, useExisting: PolicyResolverService },
  ],
  exports: [POLICY_RESOLVER],
})
export class PolicyModule {}
