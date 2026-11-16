import { Global, Module } from '@nestjs/common';
import { TRANSACTION_MANAGER } from '../../application/ports/transaction-manager.port.js';
import { PrismaContext } from './prisma-context.js';
import { PrismaHealthCheck } from './prisma-health.check.js';
import { PrismaTransactionManager } from './prisma-transaction.manager.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaContext,
    PrismaHealthCheck,
    { provide: TRANSACTION_MANAGER, useClass: PrismaTransactionManager },
  ],
  exports: [
    PrismaService,
    PrismaContext,
    PrismaHealthCheck,
    TRANSACTION_MANAGER,
  ],
})
export class PrismaModule {}
