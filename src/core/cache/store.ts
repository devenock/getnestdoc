import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { SymbolRecord } from "../extract/types.ts";
import { sanitizeExtractedText } from "../extract/sanitize.ts";
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
let warnedUnsafePath = false;

// Only reachable via getCacheFilePath's defense-in-depth branch, not its
// normal flattening (see paths.ts) — if this ever fires, something about the
// package's own package.json is unusual enough that the primary sanitization
// didn't produce a safe path at all. Worth surfacing, unlike a plain
// unwritable directory, since it's a signal about the package, not the
// environment.
function warnUnsafePath(packageName: string): void {
  if (warnedUnsafePath) return;
  warnedUnsafePath = true;
  process.stderr.write(`getnestdoc: "${packageName}"'s package.json produced an unsafe cache path; skipping the cache for it.\n`);
}

// Corrupt file -> delete, re-extract, continue silently (ARCHITECTURE.md §10). A version mismatch is treated the same as a miss.
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

  // Re-sanitized on the way out, not just on the way in at extraction time —
  // a cache entry written by a pre-fix version of this tool could already
  // have raw escape sequences baked into it from a malicious package's
  // JSDoc, and upgrading nest-doc doesn't retroactively clean an existing
  // ~/.cache/getnestdoc/*.json. A cache entry doesn't invalidate just
  // because the *tool* changed (only a package version bump does), so this
  // has to run every read, not once.
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

// Atomic temp-file-then-rename (ARCHITECTURE.md §5.3). Caching is an optimisation, not a correctness requirement, so an unwritable dir warns once and never throws.
export function writeCache(cacheDir: string, cacheFile: CacheFile): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const filePath = getCacheFilePath(cacheDir, cacheFile.package, cacheFile.packageVersion);
    if (!filePath) {
      warnUnsafePath(cacheFile.package);
      return;
    }
    // Derived from the already-validated filePath, not re-flattened from cacheFile.packageVersion directly — a second, independent construction here previously bypassed getCacheFilePath's own safety check entirely.
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
