import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

/**
 * Holds the transaction client for the current async call chain. Because it is carried by
 * AsyncLocalStorage, repositories in ANY module automatically join a transaction opened
 * by a use case in another module - no client is passed around.
 */
@Injectable()
export class PrismaContext {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  /** Repositories use this client: the ambient transaction if one is open, else the base client. */
  get client(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }

  get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  runWith<T>(tx: Prisma.TransactionClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}
