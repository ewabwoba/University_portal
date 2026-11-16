import type { PolicyKey, PolicyValueMap } from './policy-values.js';

export const POLICY_RESOLVER = Symbol('POLICY_RESOLVER');

export interface ResolvedPolicy<K extends PolicyKey> {
  key: K;
  version: number;
  effectiveFrom: Date;
  value: PolicyValueMap[K];
}

export interface PolicyResolver {
  /**
   * The policy version in force at `at` (default: now). Pass the date of the decision being made, so
   * historical decisions are always evaluated under the rules that applied then.
   * Fails closed with POLICY_NOT_CONFIGURED when nothing is in force.
   */
  resolve<K extends PolicyKey>(key: K, at?: Date): Promise<ResolvedPolicy<K>>;
}
