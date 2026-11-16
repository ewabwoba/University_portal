import { NodeEnv } from './app-config.js';
import type { AppConfig } from './app-config.js';
import { validateEnv } from './env.validation.js';

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const toBoolean = (value: string): boolean => value === 'true';

/** Pure: validates `env` and maps it to the typed config tree. Unit-testable without Nest. */
export function buildConfiguration(env: Record<string, unknown>): AppConfig {
  const v = validateEnv(env);

  return {
    app: {
      env: v.NODE_ENV,
      isProduction: v.NODE_ENV === NodeEnv.PRODUCTION,
      port: v.PORT,
      apiPrefix: v.API_PREFIX,
      corsOrigins: v.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      bodyLimit: v.BODY_LIMIT,
      swaggerEnabled: toBoolean(v.SWAGGER_ENABLED),
    },
    database: {
      txTimeoutMs: v.DB_TX_TIMEOUT_MS,
      txMaxWaitMs: v.DB_TX_MAX_WAIT_MS,
    },
    throttle: {
      ttlMs: v.THROTTLE_TTL_MS,
      limit: v.THROTTLE_LIMIT,
      strictTtlMs: v.STRICT_THROTTLE_TTL_MS,
      strictLimit: v.STRICT_THROTTLE_LIMIT,
    },
    auth: {
      accessSecret: v.JWT_ACCESS_SECRET,
      accessTtlSeconds: v.JWT_ACCESS_TTL_SECONDS,
      refreshTtlMs: v.JWT_REFRESH_TTL_DAYS * MS_PER_DAY,
      issuer: v.JWT_ISSUER,
      audience: v.JWT_AUDIENCE,
    },
    security: {
      argon2: {
        memoryCostKib: v.ARGON2_MEMORY_COST_KIB,
        timeCost: v.ARGON2_TIME_COST,
        parallelism: v.ARGON2_PARALLELISM,
      },
      passwordMinLength: v.PASSWORD_MIN_LENGTH,
      loginMaxAttempts: v.LOGIN_MAX_ATTEMPTS,
      loginLockMs: v.LOGIN_LOCK_MINUTES * MS_PER_MINUTE,
    },
    pagination: {
      defaultLimit: v.PAGINATION_DEFAULT_LIMIT,
      maxLimit: v.PAGINATION_MAX_LIMIT,
    },
    seed: {
      adminEmail: v.SEED_ADMIN_EMAIL,
      adminPassword: v.SEED_ADMIN_PASSWORD,
      reapplyPresets: toBoolean(v.SEED_REAPPLY_PRESETS ?? 'false'),
    },
    idempotency: {
      ttlMs: v.IDEMPOTENCY_TTL_HOURS * MS_PER_HOUR,
      lockTimeoutMs: v.IDEMPOTENCY_LOCK_TIMEOUT_SECONDS * MS_PER_SECOND,
      keyMaxLength: v.IDEMPOTENCY_KEY_MAX_LENGTH,
    },
    outbox: {
      enabled: toBoolean(v.OUTBOX_ENABLED),
      pollIntervalMs: v.OUTBOX_POLL_INTERVAL_MS,
      batchSize: v.OUTBOX_BATCH_SIZE,
      maxAttempts: v.OUTBOX_MAX_ATTEMPTS,
      lockTimeoutMs: v.OUTBOX_LOCK_TIMEOUT_MS,
      retryBaseMs: v.OUTBOX_RETRY_BASE_MS,
      retryMaxMs: v.OUTBOX_RETRY_MAX_MS,
    },
    logging: {
      level: v.LOG_LEVEL,
      pretty: toBoolean(v.LOG_PRETTY),
    },
  };
}

/** Loader handed to ConfigModule. Runs at boot, so an invalid environment stops the app. */
export const configuration = (): AppConfig => buildConfiguration(process.env);
