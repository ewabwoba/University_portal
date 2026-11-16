import { IsDateString, IsObject, IsOptional } from 'class-validator';

export class CreatePolicyVersionDto {
  /** Validated against the policy's own schema by the use case, which reports every problem by path. */
  @IsObject() value!: Record<string, unknown>;
  /** ISO 8601. Must be later than the currently latest version, and not in the past, when approved. */
  @IsDateString() effectiveFrom!: string;
}

export class EffectivePolicyQueryDto {
  @IsOptional() @IsDateString() at?: string;
}
