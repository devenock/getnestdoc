import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FoundPackage, PackageManifest } from "./types.ts";

// Walks up from `startDir` looking for `node_modules/<name>`, stopping at the filesystem root or a `.git` boundary.
export function findPackageDir(name: string, startDir: string): FoundPackage | undefined {
  const nameParts = name.split("/");
  let dir = startDir;

  while (true) {
    const nodeModulesDir = join(dir, "node_modules");
    const packageDir = join(nodeModulesDir, ...nameParts);
    const manifestPath = join(packageDir, "package.json");

    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
      return { name, packageDir, nodeModulesDir, manifest };
    }

    if (existsSync(join(dir, ".git"))) return undefined;

    const parent = dirname(dir);
    if (parent === dir) return undefined; // filesystem root
    dir = parent;
  }
}
