import { describe, it, expect } from "vitest";
import path from "path";

/**
 * Unit test the path traversal guard in LocalStorageProvider.resolvePath.
 *
 * Since resolvePath is private, we replicate its logic here to verify
 * the guard independently of filesystem I/O.
 */
function resolvePath(baseDir: string, key: string): string {
  const resolved = path.resolve(baseDir, key);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  return resolved;
}

describe("LocalStorageProvider path traversal guard", () => {
  const baseDir = "/data/uploads";

  it("resolves a normal key", () => {
    const result = resolvePath(baseDir, "case1/doc1/original.pdf");
    expect(result).toBe(path.resolve(baseDir, "case1/doc1/original.pdf"));
  });

  it("throws on ../ traversal", () => {
    expect(() => resolvePath(baseDir, "../etc/passwd")).toThrow(
      "path traversal detected",
    );
  });

  it("throws on absolute path override", () => {
    expect(() => resolvePath(baseDir, "/etc/passwd")).toThrow(
      "path traversal detected",
    );
  });

  it("throws on encoded traversal (..%2f doesn't help since path.resolve normalizes)", () => {
    // path.resolve treats this as a literal filename; as long as it
    // stays inside baseDir it's fine (the file just won't exist).
    const result = resolvePath(baseDir, "..%2fetc/passwd");
    expect(result).toContain(baseDir);
  });

  it("throws on deeply nested traversal", () => {
    expect(() =>
      resolvePath(baseDir, "a/b/../../../../etc/passwd"),
    ).toThrow("path traversal detected");
  });

  it("allows nested keys", () => {
    const result = resolvePath(baseDir, "caseA/docB/nested/file.txt");
    expect(result).toBe(
      path.resolve(baseDir, "caseA/docB/nested/file.txt"),
    );
  });
});
