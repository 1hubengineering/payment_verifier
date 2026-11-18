import { StorageConflict } from '@1hubengineering/receipt-verifier';
import type { RecordTransaction, VerificationStorage } from '@1hubengineering/receipt-verifier';
import {
  StorageDataError,
  validateStorageKey,
  validateStorageScan,
  encodeStorageRecord,
  decodeStorageRecord,
} from '@1hubengineering/receipt-verifier/storage';

export interface PrismaRecord {
  readonly recordKey: string;
  readonly payload: string;
}
export interface PrismaReceiptTransaction {
  readonly receiptVerifierRecord: {
    findUnique(args: { where: { recordKey: string } }): Promise<PrismaRecord | null>;
    create(args: { data: PrismaRecord }): Promise<PrismaRecord>;
    updateMany(args: {
      where: { recordKey: string };
      data: { payload: string };
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { recordKey: string } }): Promise<{ count: number }>;
    findMany(args: {
      where: { recordKey: { startsWith: string } };
      orderBy: { recordKey: 'asc' };
      take: number;
    }): Promise<PrismaRecord[]>;
  };
}
export interface PrismaReceiptClient extends PrismaReceiptTransaction {
  $transaction<T>(
    work: (transaction: PrismaReceiptTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable'; maxWait: number; timeout: number },
  ): Promise<T>;
}
function records(client: PrismaReceiptTransaction): RecordTransaction {
  return {
    async get(key) {
      validateStorageKey(key);
      return decodeStorageRecord(
        (await client.receiptVerifierRecord.findUnique({ where: { recordKey: key } }))?.payload,
      );
    },
    async insert(key, value) {
      validateStorageKey(key);
      await client.receiptVerifierRecord.create({
        data: { recordKey: key, payload: encodeStorageRecord(value) },
      });
    },
    async set(key, value) {
      validateStorageKey(key);
      const result = await client.receiptVerifierRecord.updateMany({
        where: { recordKey: key },
        data: { payload: encodeStorageRecord(value) },
      });
      if (result.count !== 1) throw new StorageDataError();
    },
    async delete(key) {
      validateStorageKey(key);
      await client.receiptVerifierRecord.deleteMany({ where: { recordKey: key } });
    },
    async scan(prefix, limit) {
      validateStorageScan(prefix, limit);
      const rows = await client.receiptVerifierRecord.findMany({
        where: { recordKey: { startsWith: prefix } },
        orderBy: { recordKey: 'asc' },
        take: limit,
      });
      return rows.map((row) => ({ key: row.recordKey, value: decodeStorageRecord(row.payload) }));
    },
  };
}
function validate(client: PrismaReceiptTransaction): void {
  if (
    !client ||
    !client.receiptVerifierRecord ||
    typeof client.receiptVerifierRecord.findUnique !== 'function' ||
    typeof client.receiptVerifierRecord.create !== 'function'
  )
    throw new TypeError('Expected a Prisma 7.10.1 receipt model client');
}
function conflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const value = current as {
      code?: unknown;
      originalCode?: unknown;
      kind?: unknown;
      cause?: unknown;
    };
    if (
      typeof value.code === 'string' &&
      ['P2002', 'P2034', 'P1008', 'SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_LOCKED'].includes(
        value.code,
      )
    )
      return true;
    if (
      value.kind === 'TransactionWriteConflict' ||
      value.originalCode === '40001' ||
      value.originalCode === '40P01'
    )
      return true;
    current = value.cause;
  }
  return false;
}
/** Receives a generated host client; never connects, disconnects or opens another driver. */
export function prismaStorage(client: PrismaReceiptClient): VerificationStorage {
  validate(client);
  if (typeof client.$transaction !== 'function')
    throw new TypeError('Expected a Prisma client transaction factory');
  return {
    callerTransaction: false,
    read: (key) => records(client).get(key),
    async transaction(work) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await client.$transaction((tx) => work(records(tx)), {
            isolationLevel: 'Serializable',
            maxWait: 5000,
            timeout: 5000,
          });
        } catch (error) {
          if (!conflict(error)) throw error;
          if (attempt >= 7) throw new StorageConflict();
          await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
        }
      }
    },
  };
}
/** Caller must have selected Serializable on the actual enclosing Prisma transaction. */
export function prismaTransaction(
  client: PrismaReceiptTransaction,
  policy: { readonly isolationLevel: 'Serializable' },
): VerificationStorage {
  validate(client);
  if (policy?.isolationLevel !== 'Serializable')
    throw new TypeError('Expected a caller-owned Serializable Prisma transaction');
  return {
    callerTransaction: true,
    read: (key) => records(client).get(key),
    async transaction(work) {
      try {
        return await work(records(client));
      } catch (error) {
        if (conflict(error)) throw new StorageConflict();
        throw error;
      }
    },
  };
}
