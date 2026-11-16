import { Injectable } from '@nestjs/common';
import type { HealthCheck } from '../../application/ports/health-check.port.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaHealthCheck implements HealthCheck {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
