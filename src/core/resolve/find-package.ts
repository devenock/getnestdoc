import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { FoundPackage, PackageManifest } from "./types.ts";

function stringField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" ? value : undefined;
}

// package.json is third-party input (ADR-0009): keep only fields of the type resolution expects, so a crafted
// `"types": 5` or `"version": {}` degrades to "field absent" instead of a TypeError further down.
function normaliseManifest(raw: Record<string, unknown>): PackageManifest {
  const manifest: PackageManifest = {};
  for (const key of ["name", "version", "main", "types", "typings"] as const) {
    const value = stringField(raw, key);
    if (value !== undefined) manifest[key] = value;
  }
  if (raw.exports !== undefined && raw.exports !== null) manifest.exports = raw.exports;
  return manifest;
}

function tryLoad(name: string, nameParts: string[], nodeModulesDir: string): FoundPackage | undefined {
  const packageDir = join(nodeModulesDir, ...nameParts);
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath)) return undefined;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    // The parser's own message can quote file content — third-party bytes — so it's deliberately not surfaced.
    return { name, packageDir, nodeModulesDir, manifest: {}, manifestError: "package.json is not valid JSON" };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { name, packageDir, nodeModulesDir, manifest: {}, manifestError: "package.json is not a JSON object" };
  }
  return { name, packageDir, nodeModulesDir, manifest: normaliseManifest(raw as Record<string, unknown>) };
}

// The node_modules directory the running program itself is installed in, if any. For a global install this *is* the
// global root, whatever the prefix: `<prefix>/bin/nest-doc` is a symlink into `<prefix>/lib/node_modules/getnestdoc/`,
// and argv[1]'s real path walks up to it. This is the case process.execPath can't see — Homebrew's execPath resolves
// into its Cellar (`.../Cellar/node/<v>/bin/node`, verified), not the prefix whose lib/node_modules holds the globals.
function ownNodeModulesDir(): string | undefined {
  const script = process.argv[1];
  if (!script) return undefined;
  let dir: string;
  try {
    dir = dirname(realpathSync(script));
  } catch {
    return undefined;
  }
  while (basename(dir) !== "node_modules") {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}

// Global npm roots to try after the upward walk, cheapest signal first, no `npm root -g` subprocess (100ms+ on a path
// that has to stay fast). The execPath-derived root covers the official installer and nvm layouts. A global package
// installed somewhere neither points at (e.g. Volta, which isolates each global package) is an accepted gap.
function globalNodeModulesDirs(): string[] {
  const nodeDir = dirname(process.execPath);
  const fromExecPath = process.platform === "win32" ? join(nodeDir, "node_modules") : join(dirname(nodeDir), "lib", "node_modules");
  const own = ownNodeModulesDir();
  return own && own !== fromExecPath ? [own, fromExecPath] : [fromExecPath];
}

// Walks up from `startDir` looking for `node_modules/<name>`, stopping at the filesystem root or a `.git` boundary,
// then falls back to the global npm roots as a last resort.
export function findPackageDir(name: string, startDir: string): FoundPackage | undefined {
  const nameParts = name.split("/");
  let dir = startDir;

  while (true) {
    const found = tryLoad(name, nameParts, join(dir, "node_modules"));
    if (found) return found;

    if (existsSync(join(dir, ".git"))) break;

    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  for (const globalDir of globalNodeModulesDirs()) {
    const found = tryLoad(name, nameParts, globalDir);
    if (found) return found;
  }
  return undefined;
}
