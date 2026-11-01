import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  if (typeof raw.exports === "string" || (raw.exports !== null && typeof raw.exports === "object")) {
    manifest.exports = raw.exports as NonNullable<PackageManifest["exports"]>;
  }
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

// Standard-layout global npm root (nvm, the official installer, Homebrew's Node all follow this) derived from
// process.execPath directly — no `npm root -g` subprocess, which would cost 100ms+ on a path that has to stay fast.
// A custom `npm config set prefix` won't be found this way; that's an accepted gap, not a crash risk (existsSync-gated).
function globalNodeModulesDir(): string {
  const nodeDir = dirname(process.execPath);
  return process.platform === "win32" ? join(nodeDir, "node_modules") : join(dirname(nodeDir), "lib", "node_modules");
}

// Walks up from `startDir` looking for `node_modules/<name>`, stopping at the filesystem root or a `.git` boundary,
// then falls back to the global npm root as a last resort.
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

  return tryLoad(name, nameParts, globalNodeModulesDir());
}
