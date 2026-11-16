import { ValidationError } from '../../../../shared/domain/domain-error.js';
import type {
  PolicyKey,
  PolicyValueMap,
} from '../../contracts/policy-values.js';
import type { Issues, Parser } from './schema.js';

export const POLICY_VALUE_INVALID = 'POLICY_VALUE_INVALID';

export interface PolicyDefinition<K extends PolicyKey = PolicyKey> {
  key: K;
  module: string;
  description: string;
  /** A valid sample, shown by the API so administrators start from something correct. */
  example: PolicyValueMap[K];
  /** Throws ValidationError (POLICY_VALUE_INVALID) listing every problem found. */
  validate(raw: unknown): PolicyValueMap[K];
}

export function definePolicy<K extends PolicyKey>(spec: {
  key: K;
  module: string;
  description: string;
  example: PolicyValueMap[K];
  parser: Parser<PolicyValueMap[K]>;
  /** Cross-field rules that a per-field parser cannot express. Runs only when the shape is valid. */
  refine?: (value: PolicyValueMap[K], issues: Issues) => void;
}): PolicyDefinition<K> {
  const definition: PolicyDefinition<K> = {
    key: spec.key,
    module: spec.module,
    description: spec.description,
    example: spec.example,
    validate(raw) {
      const issues: Issues = [];
      const value = spec.parser(raw, 'value', issues);
      if (value !== undefined && issues.length === 0)
        spec.refine?.(value, issues);
      if (issues.length > 0 || value === undefined) {
        throw new ValidationError(
          `The value is not a valid ${spec.key} policy.`,
          {
            code: POLICY_VALUE_INVALID,
            details: { issues },
          },
        );
      }
      return value;
    },
  };
  return definition;
}
