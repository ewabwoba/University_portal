import { Module } from '@nestjs/common';
import { HEALTH_CHECK } from '../shared/application/ports/health-check.port.js';
import { GetReadinessUseCase } from '../shared/application/use-cases/get-readiness.use-case.js';
import { PrismaHealthCheck } from '../shared/infrastructure/prisma/prisma-health.check.js';
import { HealthController } from '../shared/presentation/health/health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [
    GetReadinessUseCase,
    // Register additional checks (redis, storage, ...) here as they are introduced.
    {
      provide: HEALTH_CHECK,
      useFactory: (db: PrismaHealthCheck) => [db],
      inject: [PrismaHealthCheck],
    },
  ],
})
export class HealthModule {}
