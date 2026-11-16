import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE } from '../../application/ports/idempotency-store.port.js';
import { PrismaIdempotencyStore } from './prisma-idempotency.store.js';

@Global()
@Module({
  providers: [{ provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore }],
  exports: [IDEMPOTENCY_STORE],
})
export class IdempotencyModule {}
