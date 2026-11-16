import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  TransactionIsolation,
  TransactionManager,
  TransactionOptions,
} from '../../application/ports/transaction-manager.port.js';
import type { TypedConfigService } from '../../../config/app-config.js';
import { PrismaContext } from './prisma-context.js';
import { PrismaService } from './prisma.service.js';

const ISOLATION_LEVELS: Record<
  TransactionIsolation,
  Prisma.TransactionIsolationLevel
> = {
  READ_COMMITTED: Prisma.TransactionIsolationLevel.ReadCommitted,
  REPEATABLE_READ: Prisma.TransactionIsolationLevel.RepeatableRead,
  SERIALIZABLE: Prisma.TransactionIsolationLevel.Serializable,
};

@Injectable()
export class PrismaTransactionManager implements TransactionManager {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PrismaContext,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  run<T>(work: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    // Nested call (possibly from another module): join the ambient transaction.
    if (this.context.inTransaction) {
      return work();
    }

    const { txTimeoutMs, txMaxWaitMs } = this.config.get('database', {
      infer: true,
    });
    return this.prisma.$transaction((tx) => this.context.runWith(tx, work), {
      timeout: txTimeoutMs,
      maxWait: txMaxWaitMs,
      isolationLevel: options.isolation
        ? ISOLATION_LEVELS[options.isolation]
        : undefined,
    });
  }
}
