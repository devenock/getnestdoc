import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { SymbolRecord } from "../extract/types.ts";
import { sanitizeSymbolRecord } from "../extract/sanitize.ts";
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

const SYMBOL_KINDS = new Set<string>(["function", "class", "interface", "type", "enum", "const", "variable"]);

function isStringPairList(value: unknown, a: string, b: string): boolean {
  return Array.isArray(value) && value.every((item) => item !== null && typeof item === "object" && typeof item[a] === "string" && typeof item[b] === "string");
}

// Valid JSON isn't a valid entry: a truncated-then-repaired or hand-edited file can parse fine and still be missing
// `symbols`, which used to crash the lookup with exit 4. Every field a consumer reads is checked.
function isSymbolRecord(value: unknown): value is SymbolRecord {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.name === "string" &&
    typeof s.kind === "string" &&
    SYMBOL_KINDS.has(s.kind) &&
    typeof s.signature === "string" &&
    typeof s.doc === "string" &&
    isStringPairList(s.tags, "name", "text") &&
    isStringPairList(s.see, "text", "url") &&
    typeof s.isPublicApi === "boolean" &&
    typeof s.file === "string" &&
    typeof s.line === "number"
  );
}

function deleteQuietly(filePath: string): void {
  try {
    rmSync(filePath, { force: true });
  } catch {
    // best-effort self-heal; a failed delete still results in a miss
  }
}

// Reads a cache entry. Unparseable or wrongly-shaped files are deleted and treated as a miss; a format-version
// mismatch is a plain miss, overwritten by the next write.
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    deleteQuietly(filePath);
    return undefined;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    deleteQuietly(filePath);
    return undefined;
  }
  const entry = parsed as CacheFile;
  if (entry.version !== CACHE_FORMAT_VERSION) return undefined;
  if (!Array.isArray(entry.symbols) || !entry.symbols.every(isSymbolRecord)) {
    deleteQuietly(filePath);
    return undefined;
  }

  // Re-sanitized on every read, since an entry written by an older version of this tool (or tampered with on disk)
  // may predate this cleanup.
  return { ...entry, symbols: entry.symbols.map(sanitizeSymbolRecord) };
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
