import { Inject, Injectable } from '@nestjs/common';
import { ServiceUnavailableError } from '../../domain/domain-error.js';
import { HEALTH_CHECK } from '../ports/health-check.port.js';
import type { HealthCheck } from '../ports/health-check.port.js';

export interface ReadinessReport {
  status: 'ok';
  checks: Record<string, 'up'>;
}

@Injectable()
export class GetReadinessUseCase {
  constructor(@Inject(HEALTH_CHECK) private readonly checks: HealthCheck[]) {}

  async execute(): Promise<ReadinessReport> {
    const results = await Promise.allSettled(this.checks.map((c) => c.check()));
    const failed = this.checks
      .filter((_, i) => results[i].status === 'rejected')
      .map((c) => c.name);

    if (failed.length > 0) {
      throw new ServiceUnavailableError('Service is not ready.', {
        code: 'NOT_READY',
        details: { failed },
      });
    }
    return {
      status: 'ok',
      checks: Object.fromEntries(
        this.checks.map((c) => [c.name, 'up' as const]),
      ),
    };
  }
}
