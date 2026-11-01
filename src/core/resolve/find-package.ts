import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { FoundPackage, PackageManifest } from "./types.ts";

function stringField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" ? value : undefined;
}

// package.json is third-party input: keep only correctly-typed fields, so `"types": 5` degrades to an absent field instead of a TypeError.
function normaliseManifest(raw: Record<string, unknown>): PackageManifest {
  const manifest: PackageManifest = {};
  for (const key of ["name", "version", "main", "types", "typings"] as const) {
    const value = stringField(raw, key);
    if (value !== undefined) manifest[key] = value;
  }
  if (raw.exports !== undefined && raw.exports !== null) manifest.exports = raw.exports;
  return manifest;
}

// Package names are case-sensitive but macOS and Windows filesystems usually aren't, where node_modules/Cron would open the unrelated `cron` package — so every name segment must exist as exactly that directory entry (not a realpath check, which would reject aliased and symlinked installs).
function hasExactPath(nodeModulesDir: string, nameParts: string[]): boolean {
  let dir = nodeModulesDir;
  for (const part of nameParts) {
    try {
      if (!readdirSync(dir).includes(part)) return false;
    } catch {
      return false;
    }
    dir = join(dir, part);
  }
  return true;
}

function tryLoad(name: string, nameParts: string[], nodeModulesDir: string): FoundPackage | undefined {
  const packageDir = join(nodeModulesDir, ...nameParts);
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath) || !hasExactPath(nodeModulesDir, nameParts)) return undefined;

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

// The node_modules the running script is installed in — for a global install, the global root under any prefix, including Homebrew, whose execPath resolves into its Cellar instead.
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

// Global roots to try after the upward walk, with no `npm root -g` subprocess (100ms+); a layout neither points at, such as Volta's per-package isolation, is an accepted gap.
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
