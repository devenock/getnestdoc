import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

// SPEC.md §3: ${XDG_CACHE_HOME:-~/.cache}/getnestdoc/<name>@<version>.json, "/" in scoped names replaced by "+".
export function getCacheDir(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome && xdgCacheHome.length > 0 ? xdgCacheHome : join(homedir(), ".cache");
  return join(base, "getnestdoc");
}

// packageName/packageVersion come from a *third-party* package.json —
// untrusted, attacker-controlled data. Verified as a real vulnerability, not
// a theoretical one: a crafted "version" field like "../../../../etc/passwd"
// resolved to a path completely outside the cache directory, giving
// arbitrary file write (readCache/writeCache) and arbitrary file delete
// (readCache's corrupt-file self-heal calls rmSync on this same path) —
// triggered simply by a victim running `nest-doc <that-package>`. Replacing
// every "/" and "\" is the actual fix: without a path separator left
// anywhere in either string, there is no way for it to introduce a new path
// segment, so the flattened result can never resolve outside cacheDir no
// matter how many "../" it contains (verified across 3-20 levels of
// traversal — every one collapses into one ordinary, if ugly, filename).
function flattenPathSegment(value: string): string {
  return value.replace(/[/\\]/g, "+");
}

// The undefined-return branch below is a defense-in-depth backstop, not the
// mechanism actually doing the work above — flattening alone already makes
// straightforward "/"-based traversal impossible. This exists for whatever
// that replacement doesn't anticipate (a future change to this function, a
// platform-specific separator, null bytes) rather than for the case already
// verified and fixed. Both call sites treat "no path" as "skip caching for
// this", exactly like an unwritable cache directory.
export function getCacheFilePath(cacheDir: string, packageName: string, packageVersion: string): string | undefined {
  const fileName = `${flattenPathSegment(packageName)}@${flattenPathSegment(packageVersion)}.json`;
  const filePath = join(cacheDir, fileName);

  const resolvedCacheDir = resolve(cacheDir) + sep;
  return resolve(filePath).startsWith(resolvedCacheDir) ? filePath : undefined;
}
