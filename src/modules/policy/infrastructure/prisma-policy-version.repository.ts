import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PolicyVersion as PolicyVersionRow } from '@prisma/client';
import { ConflictError } from '../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../shared/infrastructure/prisma/prisma-context.js';
import {
  PolicyStatus,
  PolicyVersion,
} from '../domain/entities/policy-version.entity.js';
import type { PolicyVersionRepository } from '../domain/repositories/policy-version.repository.js';

const UNIQUE_VIOLATION = 'P2002';
const APPROVED = [PolicyStatus.ACTIVE, PolicyStatus.RETIRED];

const toDomain = (row: PolicyVersionRow): PolicyVersion =>
  PolicyVersion.restore(row.id, {
    policyKey: row.policyKey,
    version: row.version,
    value: row.value,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt,
  });

@Injectable()
export class PrismaPolicyVersionRepository implements PolicyVersionRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async lockKey(policyKey: string): Promise<void> {
    // Transaction-scoped advisory lock keyed on the policy: released automatically at commit/rollback.
    await this.db
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`policy:${policyKey}`}))`;
  }

  async nextVersionNumber(policyKey: string): Promise<number> {
    const latest = await this.db.policyVersion.aggregate({
      where: { policyKey },
      _max: { version: true },
    });
    return (latest._max.version ?? 0) + 1;
  }

  async insert(version: PolicyVersion): Promise<void> {
    try {
      await this.db.policyVersion.create({
        data: {
          id: version.id,
          policyKey: version.policyKey,
          version: version.version,
          value: version.value as Prisma.InputJsonValue,
          status: version.status,
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
          createdBy: version.createdBy,
          approvedBy: version.approvedBy,
          createdAt: version.createdAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictError(
          'That policy version number already exists. Retry.',
          { code: 'POLICY_VERSION_CONFLICT', cause: error },
        );
      }
      throw error;
    }
  }

  async update(version: PolicyVersion): Promise<void> {
    await this.db.policyVersion.update({
      where: { id: version.id },
      data: {
        status: version.status,
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        approvedBy: version.approvedBy,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.policyVersion.delete({ where: { id } });
  }

  async findById(id: string): Promise<PolicyVersion | null> {
    const row = await this.db.policyVersion.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByKey(policyKey: string): Promise<PolicyVersion[]> {
    const rows = await this.db.policyVersion.findMany({
      where: { policyKey },
      orderBy: { version: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findLatestApproved(policyKey: string): Promise<PolicyVersion | null> {
    const row = await this.db.policyVersion.findFirst({
      where: { policyKey, status: { in: APPROVED } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? toDomain(row) : null;
  }

  async findEffective(
    policyKey: string,
    at: Date,
  ): Promise<PolicyVersion | null> {
    const row = await this.db.policyVersion.findFirst({
      where: {
        policyKey,
        status: { in: APPROVED },
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? toDomain(row) : null;
  }
}
