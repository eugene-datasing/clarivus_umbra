import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";

let storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!storage) {
    storage = new LocalStorageProvider();
  }
  return storage;
}

export type { StorageProvider };
