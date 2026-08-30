import { homedir } from "node:os";
import { join } from "node:path";

// SPEC.md §3: ${XDG_CACHE_HOME:-~/.cache}/getnestdoc/<name>@<version>.json, "/" in scoped names replaced by "+".
export function getCacheDir(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome && xdgCacheHome.length > 0 ? xdgCacheHome : join(homedir(), ".cache");
  return join(base, "getnestdoc");
}

export function getCacheFilePath(cacheDir: string, packageName: string, packageVersion: string): string {
  const flatName = packageName.replace(/\//g, "+");
  return join(cacheDir, `${flatName}@${packageVersion}.json`);
}
