import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";

let storage: StorageProvider | null = null;

/**
 * Returns the configured storage provider.
 *
 * Provider selection:
 *   - If AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME is set,
 *     uses Azure Blob Storage.
 *   - Otherwise falls back to local filesystem (suitable for development).
 */
export function getStorage(): StorageProvider {
  if (!storage) {
    const useAzure =
      process.env.AZURE_STORAGE_CONNECTION_STRING ||
      process.env.AZURE_STORAGE_ACCOUNT_NAME;

    if (useAzure) {
      // Dynamic import avoidance: we require at init time to keep this synchronous.
      // The Azure SDK is tree-shaken when not used in local dev.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AzureBlobStorageProvider } = require("./azure-blob");
      storage = new AzureBlobStorageProvider() as StorageProvider;
    } else {
      storage = new LocalStorageProvider();
    }
  }
  return storage!;
}

export type { StorageProvider };
