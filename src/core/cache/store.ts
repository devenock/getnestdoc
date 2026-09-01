import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { SymbolRecord } from "../extract/types.ts";
import { sanitizeExtractedText } from "../extract/sanitize.ts";
import { getCacheFilePath } from "./paths.ts";

// `version` is the cache format version, separate from packageVersion, which already sits in the filename.
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
let warnedUnsafePath = false;

// Warns once when a package's own metadata produced an unsafe cache path, skipping the cache for it.
function warnUnsafePath(packageName: string): void {
  if (warnedUnsafePath) return;
  warnedUnsafePath = true;
  process.stderr.write(`getnestdoc: "${packageName}"'s package.json produced an unsafe cache path; skipping the cache for it.\n`);
}

// Reads a cache entry; a corrupt file or a format-version mismatch is deleted and treated as a miss.
export function readCache(cacheDir: string, packageName: string, packageVersion: string): CacheFile | undefined {
  const filePath = getCacheFilePath(cacheDir, packageName, packageVersion);
  if (!filePath) {
    warnUnsafePath(packageName);
    return undefined;
  }
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

  // Re-sanitized on every read, since an entry written by an older version of this tool may predate this cleanup.
  return {
    ...parsed,
    symbols: parsed.symbols.map((symbol) => ({
      ...symbol,
      signature: sanitizeExtractedText(symbol.signature),
      doc: sanitizeExtractedText(symbol.doc),
      tags: symbol.tags.map((tag) => ({ name: tag.name, text: sanitizeExtractedText(tag.text) })),
      see: symbol.see.map((link) => ({ text: sanitizeExtractedText(link.text), url: sanitizeExtractedText(link.url) })),
    })),
  };
}

// Writes atomically via a temp file plus rename; an unwritable cache directory warns once and never throws.
export function writeCache(cacheDir: string, cacheFile: CacheFile): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const filePath = getCacheFilePath(cacheDir, cacheFile.package, cacheFile.packageVersion);
    if (!filePath) {
      warnUnsafePath(cacheFile.package);
      return;
    }
    // Derived from the already-validated filePath, not re-flattened from raw input.
    const tempPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.tmp`);
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
