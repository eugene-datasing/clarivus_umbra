export interface StorageProvider {
  upload(key: string, data: Buffer, mimeType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * List every key whose path starts with `prefix`. Returns the full
   * key (not relative to the prefix). Empty array if nothing matches.
   * Used by Phase 6c's audit-archive flow for blob cleanup
   * (`{batchId}/`) and the cross-batch download scan
   * (`archives/{YYYY}/`).
   */
  listByPrefix(prefix: string): Promise<string[]>;
}
