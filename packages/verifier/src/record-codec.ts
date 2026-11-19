export class StorageDataError extends Error {
  constructor() {
    super('Invalid receipt storage data or schema');
    this.name = 'StorageDataError';
  }
}
export function validateStorageKey(key: string): void {
  if (typeof key !== 'string' || !/^rv1:[a-z]{1,12}:[a-f0-9]{64}$/.test(key))
    throw new StorageDataError();
}
export function validateStorageScan(prefix: string, limit: number): void {
  if (
    typeof prefix !== 'string' ||
    !/^rv1:[a-z]{1,12}:$/.test(prefix) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    throw new StorageDataError();
}
export function encodeStorageRecord(value: unknown): string {
  try {
    const payload = JSON.stringify(value);
    if (typeof payload !== 'string' || Buffer.byteLength(payload) > 32_000)
      throw new StorageDataError();
    return payload;
  } catch {
    throw new StorageDataError();
  }
}
export function decodeStorageRecord(payload: string | undefined): unknown {
  if (payload === undefined) return undefined;
  if (typeof payload !== 'string' || Buffer.byteLength(payload) > 32_000)
    throw new StorageDataError();
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new StorageDataError();
  }
}
