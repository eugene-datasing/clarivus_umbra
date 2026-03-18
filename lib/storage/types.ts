export interface StorageProvider {
  upload(key: string, data: Buffer, mimeType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
