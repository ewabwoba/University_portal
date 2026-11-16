import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { DOMAIN_EVENT_PUBLISHER } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import type { DomainEventPublisher } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { requirePrincipal } from '../../../../shared/application/require-principal.js';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import type {
  PolicyKey,
  PolicyValueMap,
} from '../../contracts/policy-values.js';
import type {
  PolicyResolver,
  ResolvedPolicy,
} from '../../contracts/policy-resolver.port.js';
import {
  POLICY_DEFINITIONS,
  isPolicyKey,
} from '../../domain/definitions/policy-definitions.js';
import type { PolicyDefinition } from '../../domain/definitions/policy-definition.js';
import {
  PolicyStatus,
  PolicyVersion,
} from '../../domain/entities/policy-version.entity.js';
import { PolicyErrorCodes } from '../../domain/errors/policy-error-codes.js';
import { POLICY_VERSION_REPOSITORY } from '../../domain/repositories/policy-version.repository.js';
import type { PolicyVersionRepository } from '../../domain/repositories/policy-version.repository.js';

export function definitionFor(key: string): PolicyDefinition {
  if (!isPolicyKey(key)) {
    throw new NotFoundError(`Unknown policy "${key}".`, {
      code: PolicyErrorCodes.POLICY_UNKNOWN,
    });
  }
  return POLICY_DEFINITIONS[key] as PolicyDefinition;
}

@Injectable()
export class ListPolicyDefinitionsUseCase {
  execute() {
    return Object.values(POLICY_DEFINITIONS).map(
      ({ key, module, description, example }) => ({
        key,
        module,
        description,
        example,
      }),
    );
  }
}

@Injectable()
export class ListPolicyVersionsUseCase {
  constructor(
    @Inject(POLICY_VERSION_REPOSITORY)
    private readonly versions: PolicyVersionRepository,
  ) {}

  execute(key: string): Promise<PolicyVersion[]> {
    definitionFor(key);
    return this.versions.findByKey(key);
  }
}

@Injectable()
export class CreatePolicyDraftUseCase {
  constructor(
    @Inject(POLICY_VERSION_REPOSITORY)
    private readonly versions: PolicyVersionRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  async execute(input: {
    key: string;
    value: unknown;
    effectiveFrom: Date;
  }): Promise<PolicyVersion> {
    const principal = requirePrincipal(this.requestContext);
    const definition = definitionFor(input.key);
    const value = definition.validate(input.value); // rejects malformed or inconsistent policies up front

    return this.transactions.run(async () => {
      await this.versions.lockKey(input.key);
      const draft = PolicyVersion.draft({
        policyKey: input.key,
        version: await this.versions.nextVersionNumber(input.key),
        value,
        effectiveFrom: input.effectiveFrom,
        createdBy: principal.id,
        now: this.clock.now(),
      });
      await this.versions.insert(draft);
      await this.audit.record({
        action: 'POLICY_DRAFTED',
        module: 'policy',
        entityName: 'PolicyVersion',
        entityId: draft.id,
        newValues: {
          policyKey: input.key,
          version: draft.version,
          effectiveFrom: draft.effectiveFrom.toISOString(),
          value,
        },
      });
      return draft;
    });
  }
}

@Injectable()
export class ApprovePolicyVersionUseCase {
  constructor(
    @Inject(POLICY_VERSION_REPOSITORY)
    private readonly versions: PolicyVersionRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly events: DomainEventPublisher,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  /** Appends the version to the policy's timeline and closes its predecessor. History is never rewritten. */
  async execute(versionId: string): Promise<PolicyVersion> {
    const principal = requirePrincipal(this.requestContext);

    return this.transactions.run(async () => {
      const found = await this.versions.findById(versionId);
      if (!found)
        throw new NotFoundError('Policy version not found.', {
          code: PolicyErrorCodes.VERSION_NOT_FOUND,
        });

      await this.versions.lockKey(found.policyKey);
      const version = (await this.versions.findById(versionId))!; // re-read: state may have changed while waiting for the lock
      const now = this.clock.now();
      const previous = await this.versions.findLatestApproved(
        version.policyKey,
      );

      version.approve(principal.id);

      if (previous) {
        if (
          version.effectiveFrom.getTime() <= previous.effectiveFrom.getTime()
        ) {
          throw new ConflictError(
            'A policy version must take effect after the one currently latest.',
            {
              code: PolicyErrorCodes.OUT_OF_ORDER,
              details: {
                latestEffectiveFrom: previous.effectiveFrom.toISOString(),
              },
            },
          );
        }
        // Changing the rules for decisions already made would silently rewrite history.
        if (version.effectiveFrom.getTime() < now.getTime()) {
          throw new BusinessRuleViolationError(
            'A policy change cannot take effect in the past.',
            { code: PolicyErrorCodes.RETROACTIVE },
          );
        }
        previous.supersede(version.effectiveFrom);
        await this.versions.update(previous);
      }

      await this.versions.update(version);
      await this.events.publish(version.pullEvents());
      await this.audit.record({
        action: 'POLICY_APPROVED',
        module: 'policy',
        entityName: 'PolicyVersion',
        entityId: version.id,
        oldValues: { status: PolicyStatus.DRAFT },
        newValues: {
          status: PolicyStatus.ACTIVE,
          policyKey: version.policyKey,
          version: version.version,
          effectiveFrom: version.effectiveFrom.toISOString(),
        },
      });
      return version;
    });
  }
}

@Injectable()
export class DiscardPolicyDraftUseCase {
  constructor(
    @Inject(POLICY_VERSION_REPOSITORY)
    private readonly versions: PolicyVersionRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async execute(versionId: string): Promise<void> {
    await this.transactions.run(async () => {
      const version = await this.versions.findById(versionId);
      if (!version)
        throw new NotFoundError('Policy version not found.', {
          code: PolicyErrorCodes.VERSION_NOT_FOUND,
        });
      if (version.status !== PolicyStatus.DRAFT) {
        throw new BusinessRuleViolationError(
          'Only drafts can be discarded; approved history is permanent.',
          { code: PolicyErrorCodes.NOT_A_DRAFT },
        );
      }
      await this.versions.delete(version.id);
      await this.audit.record({
        action: 'POLICY_DRAFT_DISCARDED',
        module: 'policy',
        entityName: 'PolicyVersion',
        entityId: version.id,
        oldValues: { policyKey: version.policyKey, version: version.version },
      });
    });
  }
}

/** Implements the public POLICY_RESOLVER contract. */
@Injectable()
export class PolicyResolverService implements PolicyResolver {
  constructor(
    @Inject(POLICY_VERSION_REPOSITORY)
    private readonly versions: PolicyVersionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolve<K extends PolicyKey>(
    key: K,
    at: Date = this.clock.now(),
  ): Promise<ResolvedPolicy<K>> {
    definitionFor(key);
    const version = await this.versions.findEffective(key, at);
    if (!version) {
      // Fail closed: a missing rule must stop the operation, never fall back to a guess.
      throw new BusinessRuleViolationError(
        `The ${key} policy is not configured for ${at.toISOString()}. Contact the registry.`,
        {
          code: PolicyErrorCodes.NOT_CONFIGURED,
          details: { policy: key },
        },
      );
    }
    // Stored values were validated when drafted. They are deliberately NOT re-validated here: tightening
    // a rule later must not make history unreadable.
    return {
      key,
      version: version.version,
      effectiveFrom: version.effectiveFrom,
      value: version.value as PolicyValueMap[K],
    };
  }
}
