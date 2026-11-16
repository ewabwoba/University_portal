import type { ConfigService } from '@nestjs/config';

export const NodeEnv = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const LogLevel = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
  SILENT: 'silent',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface AppSettings {
  env: NodeEnv;
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  bodyLimit: string;
  swaggerEnabled: boolean;
}

export interface DatabaseSettings {
  txTimeoutMs: number;
  txMaxWaitMs: number;
}

export interface ThrottleSettings {
  ttlMs: number;
  limit: number;
  /** Tighter limit for credential endpoints (login, refresh, password change). */
  strictTtlMs: number;
  strictLimit: number;
}

export interface AuthSettings {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlMs: number;
  issuer: string;
  audience: string;
}

export interface SecuritySettings {
  argon2: { memoryCostKib: number; timeCost: number; parallelism: number };
  passwordMinLength: number;
  loginMaxAttempts: number;
  loginLockMs: number;
}

export interface PaginationSettings {
  defaultLimit: number;
  maxLimit: number;
}

/** Only used by the seed command. */
export interface SeedSettings {
  adminEmail?: string;
  adminPassword?: string;
  /** Add any missing preset permissions to roles that already exist (never removes anything). */
  reapplyPresets: boolean;
}

export interface IdempotencySettings {
  ttlMs: number;
  lockTimeoutMs: number;
  keyMaxLength: number;
}

export interface OutboxSettings {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  lockTimeoutMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

export interface LoggingSettings {
  level: LogLevel;
  pretty: boolean;
}

/** The single typed shape of all configuration. Add a namespace here, never read process.env elsewhere. */
export interface AppConfig {
  app: AppSettings;
  database: DatabaseSettings;
  throttle: ThrottleSettings;
  auth: AuthSettings;
  security: SecuritySettings;
  pagination: PaginationSettings;
  seed: SeedSettings;
  idempotency: IdempotencySettings;
  outbox: OutboxSettings;
  logging: LoggingSettings;
}

/** Inject as `ConfigService<AppConfig, true>` and read with `get('app', { infer: true })`. */
export type TypedConfigService = ConfigService<AppConfig, true>;
