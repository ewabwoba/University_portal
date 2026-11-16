import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator.js';
import { GetReadinessUseCase } from '../../application/use-cases/get-readiness.use-case.js';
import type { ReadinessReport } from '../../application/use-cases/get-readiness.use-case.js';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: GetReadinessUseCase) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies (database) are reachable. */
  @Get('ready')
  ready(): Promise<ReadinessReport> {
    return this.readiness.execute();
  }
}
