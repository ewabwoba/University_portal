export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export type TransactionIsolation =
  'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

export interface TransactionOptions {
  /** Only honoured when this call opens the outermost transaction. */
  isolation?: TransactionIsolation;
}

export interface TransactionManager {
  /**
   * Runs `work` atomically. Nested calls (including calls made through another module's
   * contract) join the ambient transaction instead of opening a new one.
   */
  run<T>(work: () => Promise<T>, options?: TransactionOptions): Promise<T>;
}
