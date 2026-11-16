import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The raw Prisma client. Only infrastructure that deliberately runs OUTSIDE the ambient
 * transaction (outbox dispatcher, idempotency store, health checks) injects this directly.
 * Repositories must go through PrismaContext so they join the active transaction.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Disconnect late: after the HTTP server has drained and the outbox dispatcher has stopped.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
