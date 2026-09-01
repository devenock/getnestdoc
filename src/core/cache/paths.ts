import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

// Resolves the cache directory: $XDG_CACHE_HOME or ~/.cache, then a getnestdoc subdirectory.
export function getCacheDir(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome && xdgCacheHome.length > 0 ? xdgCacheHome : join(homedir(), ".cache");
  return join(base, "getnestdoc");
}

// Strips path separators from a package name/version so a malicious value can never traverse outside the cache directory.
function flattenPathSegment(value: string): string {
  return value.replace(/[/\\]/g, "+");
}

// Builds the cache file path, returning undefined as a defense-in-depth backstop if it somehow still resolves outside cacheDir.
export function getCacheFilePath(cacheDir: string, packageName: string, packageVersion: string): string | undefined {
  const fileName = `${flattenPathSegment(packageName)}@${flattenPathSegment(packageVersion)}.json`;
  const filePath = join(cacheDir, fileName);

  const resolvedCacheDir = resolve(cacheDir) + sep;
  return resolve(filePath).startsWith(resolvedCacheDir) ? filePath : undefined;
}
