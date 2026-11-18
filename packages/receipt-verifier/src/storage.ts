/** Storage contract v1. Hosts own connections, authentication and transaction scope. */
export interface StoredRecord {
  readonly key: string;
  readonly value: unknown;
}
export interface RecordTransaction {
  get(key: string): Promise<unknown>;
  insert(key: string, value: unknown): Promise<void>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  scan(prefix: string, limit: number): Promise<readonly StoredRecord[]>;
}
export interface VerificationStorage {
  readonly callerTransaction?: boolean;
  read(key: string): Promise<unknown>;
  /** Atomic work; scoped adapters leave commit/rollback/retry to the caller. */
  transaction<T>(work: (transaction: RecordTransaction) => Promise<T>): Promise<T>;
}

/** A caller-owned transaction must be retried as a whole; never partially retry work. */
export class StorageConflict extends Error {
  constructor() {
    super('Storage transaction conflict; retry the whole transaction');
    this.name = 'StorageConflict';
  }
}
