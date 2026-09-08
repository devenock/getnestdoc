import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FoundPackage, PackageManifest } from "./types.ts";

function tryLoad(name: string, nameParts: string[], nodeModulesDir: string): FoundPackage | undefined {
  const packageDir = join(nodeModulesDir, ...nameParts);
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  return { name, packageDir, nodeModulesDir, manifest };
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
