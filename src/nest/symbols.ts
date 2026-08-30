import { extractPackage } from "../core/extract/barrels.ts";
import type { SymbolRecord } from "../core/extract/types.ts";
import { getCacheDir } from "../core/cache/paths.ts";
import { readCache, writeCache } from "../core/cache/store.ts";
import { describeUnusablePackage, resolveEntryTypes } from "../core/resolve/entry-types.ts";
import { findPackageDir } from "../core/resolve/find-package.ts";
import { expandPackageShorthand } from "./package-scope.ts";

type PackageSymbols = {
  packageName: string;
  packageVersion: string;
  symbols: SymbolRecord[];
};

export type ResolvePackageSymbolsResult =
  | { status: "found"; result: PackageSymbols }
  | { status: "not-installed"; packageName: string }
  | { status: "unusable"; message: string };

// Ties resolve + cache + extract together (ARCHITECTURE.md §2). A cache hit never reaches extractPackage(), so a warm lookup pays none of the ~200ms typescript load cost.
export async function resolvePackageSymbols(rawName: string, startDir: string): Promise<ResolvePackageSymbolsResult> {
  const packageName = expandPackageShorthand(rawName);
  const found = findPackageDir(packageName, startDir);
  if (!found) return { status: "not-installed", packageName };

  const entryResolution = resolveEntryTypes(found);
  if (!entryResolution.found) {
    return { status: "unusable", message: describeUnusablePackage(packageName) };
  }

  const packageVersion = found.manifest.version ?? "0.0.0";
  const cacheDir = getCacheDir();

  const cached = readCache(cacheDir, packageName, packageVersion);
  if (cached) {
    return { status: "found", result: { packageName, packageVersion, symbols: cached.symbols } };
  }

  const symbols = await extractPackage(entryResolution.entryFile);
  writeCache(cacheDir, {
    version: 1,
    package: packageName,
    packageVersion,
    entryFile: entryResolution.entryFile,
    extractedAt: new Date().toISOString(),
    symbols,
  });

  return { status: "found", result: { packageName, packageVersion, symbols } };
}
