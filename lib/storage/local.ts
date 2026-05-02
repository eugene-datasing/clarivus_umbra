import { mkdir, readFile, writeFile, unlink, stat, readdir } from "fs/promises";
import path from "path";
import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.UPLOAD_DIR || "./uploads";
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    return resolved;
  }

  async upload(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async download(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  getUrl(key: string): string {
    return `/api/files/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch {
      // File may not exist
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async listByPrefix(prefix: string): Promise<string[]> {
    const base = path.resolve(this.baseDir);
    const startDir = this.resolvePath(prefix);
    const out: string[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          // Convert absolute path back to a storage key (relative to baseDir).
          const relative = path.relative(base, full);
          out.push(relative);
        }
      }
    }

    // If prefix points to a file rather than a directory, return just that key.
    try {
      const info = await stat(startDir);
      if (info.isFile()) {
        out.push(path.relative(base, startDir));
        return out;
      }
    } catch {
      // Path doesn't exist — return empty.
      return out;
    }

    await walk(startDir);
    // Filter to keys that strictly start with the requested prefix string.
    // (Walk is by directory so all results already match, but this is
    // defensive in case the prefix doesn't end at a path boundary.)
    return out.filter((k) => k.startsWith(prefix));
  }
}
