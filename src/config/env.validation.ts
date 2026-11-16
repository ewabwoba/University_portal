import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { LogLevel, NodeEnv } from './app-config.js';

const BOOLEAN_STRINGS = ['true', 'false'] as const;

/** Every environment variable the application reads. Missing or invalid values abort startup. */
export class EnvironmentVariables {
  @IsIn(Object.values(NodeEnv)) NODE_ENV!: NodeEnv;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) PORT!: number;
  @IsString() API_PREFIX!: string;
  /** Comma-separated list of allowed origins. Empty string disables cross-origin access. */
  @IsString() CORS_ORIGINS!: string;
  @IsString() BODY_LIMIT!: string;
  @IsIn(BOOLEAN_STRINGS) SWAGGER_ENABLED!: string;

  @IsString() DATABASE_URL!: string;
  @Type(() => Number) @IsInt() @Min(1) DB_TX_TIMEOUT_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) DB_TX_MAX_WAIT_MS!: number;

  @Type(() => Number) @IsInt() @Min(1) THROTTLE_TTL_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) THROTTLE_LIMIT!: number;
  @Type(() => Number) @IsInt() @Min(1) STRICT_THROTTLE_TTL_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) STRICT_THROTTLE_LIMIT!: number;

  /** HS256 signing key. At least 32 characters; generate with `openssl rand -base64 48`. */
  @IsString() @MinLength(32) JWT_ACCESS_SECRET!: string;
  @Type(() => Number) @IsInt() @Min(60) JWT_ACCESS_TTL_SECONDS!: number;
  @Type(() => Number) @IsInt() @Min(1) JWT_REFRESH_TTL_DAYS!: number;
  @IsString() @MinLength(1) JWT_ISSUER!: string;
  @IsString() @MinLength(1) JWT_AUDIENCE!: string;

  @Type(() => Number) @IsInt() @Min(8) ARGON2_MEMORY_COST_KIB!: number;
  @Type(() => Number) @IsInt() @Min(1) ARGON2_TIME_COST!: number;
  @Type(() => Number) @IsInt() @Min(1) ARGON2_PARALLELISM!: number;
  @Type(() => Number) @IsInt() @Min(8) @Max(128) PASSWORD_MIN_LENGTH!: number;
  @Type(() => Number) @IsInt() @Min(1) LOGIN_MAX_ATTEMPTS!: number;
  @Type(() => Number) @IsInt() @Min(1) LOGIN_LOCK_MINUTES!: number;

  @Type(() => Number) @IsInt() @Min(1) PAGINATION_DEFAULT_LIMIT!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) PAGINATION_MAX_LIMIT!: number;

  /** Only needed when running `npm run seed`. */
  @IsOptional() @IsString() @MaxLength(254) SEED_ADMIN_EMAIL?: string;
  @IsOptional() @IsString() SEED_ADMIN_PASSWORD?: string;
  @IsOptional() @IsIn(BOOLEAN_STRINGS) SEED_REAPPLY_PRESETS?: string;

  @Type(() => Number) @IsInt() @Min(1) IDEMPOTENCY_TTL_HOURS!: number;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_LOCK_TIMEOUT_SECONDS!: number;
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(255)
  IDEMPOTENCY_KEY_MAX_LENGTH!: number;

  @IsIn(BOOLEAN_STRINGS) OUTBOX_ENABLED!: string;
  @Type(() => Number) @IsInt() @Min(50) OUTBOX_POLL_INTERVAL_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) OUTBOX_BATCH_SIZE!: number;
  @Type(() => Number) @IsInt() @Min(1) OUTBOX_MAX_ATTEMPTS!: number;
  @Type(() => Number) @IsInt() @Min(1000) OUTBOX_LOCK_TIMEOUT_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) OUTBOX_RETRY_BASE_MS!: number;
  @Type(() => Number) @IsInt() @Min(1) OUTBOX_RETRY_MAX_MS!: number;

  @IsIn(Object.values(LogLevel)) LOG_LEVEL!: LogLevel;
  @IsIn(BOOLEAN_STRINGS) LOG_PRETTY!: string;
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw);
  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    // Report variable names and violated rules only - never the values, which may be secrets.
    const lines = errors.map(
      (e) =>
        `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed;
}
