import type { PolicyVersion } from '../entities/policy-version.entity.js';

export const POLICY_VERSION_REPOSITORY = Symbol('POLICY_VERSION_REPOSITORY');

/** Write methods must be called inside TransactionManager.run(). */
export interface PolicyVersionRepository {
  /** Serialises all changes to one policy key until the transaction ends (also covers the first-ever version). */
  lockKey(policyKey: string): Promise<void>;
  nextVersionNumber(policyKey: string): Promise<number>;
  insert(version: PolicyVersion): Promise<void>;
  update(version: PolicyVersion): Promise<void>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<PolicyVersion | null>;
  /** Newest first. */
  findByKey(policyKey: string): Promise<PolicyVersion[]>;
  /** The approved version with the latest effective date. */
  findLatestApproved(policyKey: string): Promise<PolicyVersion | null>;
  /** The approved version in force at `at`, including superseded ones (history stays resolvable). */
  findEffective(policyKey: string, at: Date): Promise<PolicyVersion | null>;
}
