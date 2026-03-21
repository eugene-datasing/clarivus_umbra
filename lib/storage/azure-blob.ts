import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import type { StorageProvider } from "./types";

/**
 * Azure Blob Storage implementation of StorageProvider.
 *
 * Configuration via environment variables:
 *   AZURE_STORAGE_CONNECTION_STRING  — full connection string (preferred)
 *   or
 *   AZURE_STORAGE_ACCOUNT_NAME      — account name
 *   AZURE_STORAGE_ACCOUNT_KEY        — account key
 *
 *   AZURE_STORAGE_CONTAINER          — container name (default: "veil-documents")
 */
export class AzureBlobStorageProvider implements StorageProvider {
  private container: ContainerClient;
  private containerReady: Promise<void>;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const containerName = process.env.AZURE_STORAGE_CONTAINER || "veil-documents";

    let client: BlobServiceClient;

    if (connectionString) {
      client = BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName && accountKey) {
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      client = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential,
      );
    } else {
      throw new Error(
        "Azure Blob Storage requires AZURE_STORAGE_CONNECTION_STRING or " +
          "AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY",
      );
    }

    this.container = client.getContainerClient(containerName);
    // Ensure the container exists (create if missing). This is a one-time
    // operation that runs on first use.
    this.containerReady = this.container
      .createIfNotExists({ access: undefined })
      .then(() => {})
      .catch((err) => {
        console.error("[azure-blob] Failed to create container:", err.message);
      });
  }

  async upload(key: string, data: Buffer, mimeType: string): Promise<void> {
    await this.containerReady;
    const blob = this.container.getBlockBlobClient(key);
    await blob.uploadData(data, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });
  }

  async download(key: string): Promise<Buffer> {
    await this.containerReady;
    const blob = this.container.getBlockBlobClient(key);
    return Buffer.from(await blob.downloadToBuffer());
  }

  getUrl(key: string): string {
    // Serve through our own API route (which handles auth + Content-Disposition)
    // rather than exposing a direct SAS URL.
    return `/api/files/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.containerReady;
    const blob = this.container.getBlockBlobClient(key);
    try {
      await blob.deleteIfExists();
    } catch {
      // Ignore — blob may not exist
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.containerReady;
    const blob = this.container.getBlockBlobClient(key);
    return blob.exists();
  }
}
