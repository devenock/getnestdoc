import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SymbolRecord } from "../extract/types.ts";
import { getCacheFilePath } from "./paths.ts";

// SPEC.md §3. `version` is the cache *format* version — `packageVersion` is already part of the filename, so an upgrade invalidates naturally.
export type CacheFile = {
  version: 1;
  package: string;
  packageVersion: string;
  entryFile: string;
  extractedAt: string;
  symbols: SymbolRecord[];
};

const CACHE_FORMAT_VERSION = 1;
let warnedUnwritable = false;

// Corrupt file -> delete, re-extract, continue silently (ARCHITECTURE.md §10). A version mismatch is treated the same as a miss.
export function readCache(cacheDir: string, packageName: string, packageVersion: string): CacheFile | undefined {
  const filePath = getCacheFilePath(cacheDir, packageName, packageVersion);
  if (!existsSync(filePath)) return undefined;

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: CacheFile;
  try {
    parsed = JSON.parse(raw) as CacheFile;
  } catch {
    try {
      rmSync(filePath, { force: true });
    } catch {
      // best-effort self-heal; a failed delete still results in a miss below
    }
    return undefined;
  }

  if (parsed.version !== CACHE_FORMAT_VERSION) return undefined;

  return parsed;
}

// Atomic temp-file-then-rename (ARCHITECTURE.md §5.3). Caching is an optimisation, not a correctness requirement, so an unwritable dir warns once and never throws.
export function writeCache(cacheDir: string, cacheFile: CacheFile): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const filePath = getCacheFilePath(cacheDir, cacheFile.package, cacheFile.packageVersion);
    const flatName = cacheFile.package.replace(/\//g, "+");
    const tempPath = join(dirname(filePath), `.${flatName}@${cacheFile.packageVersion}.${process.pid}.tmp`);
    writeFileSync(tempPath, JSON.stringify(cacheFile));
    renameSync(tempPath, filePath);
  } catch (err) {
    if (!warnedUnwritable) {
      warnedUnwritable = true;
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`getnestdoc: could not write cache (${message}); continuing without caching.\n`);
    }
  }
}

export function clearCache(cacheDir: string): void {
  try {
    rmSync(cacheDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
