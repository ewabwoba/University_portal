import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module.js';
import type { TypedConfigService } from './config/app-config.js';
import { AcademicStructureModule } from './modules/academic-structure/academic-structure.module.js';
import { PolicyModule } from './modules/policy/policy.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { JwtAuthGuard } from './modules/identity/presentation/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './modules/identity/presentation/guards/permissions.guard.js';
import { STRICT_THROTTLE_KEY } from './shared/constants/metadata.constants.js';
import { RequestContextModule } from './shared/request-context.module.js';
import { HealthModule } from './health/health.module.js';
import { IdempotencyModule } from './shared/infrastructure/idempotency/idempotency.module.js';
import { LoggingModule } from './shared/infrastructure/logging/logging.module.js';
import { OutboxModule } from './shared/infrastructure/outbox/outbox.module.js';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module.js';
import { ClockModule } from './shared/infrastructure/time/clock.module.js';
import { ProblemDetailsFilter } from './shared/presentation/filters/problem-details.filter.js';
import { createValidationPipe } from './shared/presentation/http/validation.pipe.js';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => {
        const { ttlMs, limit, strictTtlMs, strictLimit } = config.get(
          'throttle',
          { infer: true },
        );
        return {
          throttlers: [
            { name: 'default', ttl: ttlMs, limit },
            {
              // Applies only to handlers marked @StrictThrottle() (login, refresh, change-password).
              name: 'strict',
              ttl: strictTtlMs,
              limit: strictLimit,
              skipIf: (context: ExecutionContext) =>
                !Reflect.getMetadata(STRICT_THROTTLE_KEY, context.getHandler()),
            },
          ],
        };
      },
    }),
    ClockModule,
    RequestContextModule,
    PrismaModule,
    OutboxModule,
    IdempotencyModule,
    HealthModule,
    AuditModule,
    IdentityModule,
    PolicyModule,
    AcademicStructureModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Order matters: throttle first (cheap), then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
