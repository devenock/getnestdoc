import { extractPackage } from "../core/extract/barrels.ts";
import type { SymbolRecord } from "../core/extract/types.ts";
import { own } from "../core/own.ts";
import { getCacheDir } from "../core/cache/paths.ts";
import { CACHE_FORMAT_VERSION, readCache, writeCache } from "../core/cache/store.ts";
import { describeInvalidManifest, describeUnusablePackage, listEntryPoints, resolveEntryTypes, resolveSubpathTypes } from "../core/resolve/entry-types.ts";
import { findPackageDir } from "../core/resolve/find-package.ts";
import { splitModuleSpecifier } from "../core/resolve/specifier.ts";
import { expandPackageShorthand } from "./package-scope.ts";
import { loadBundledPackages } from "./bundled-packages.ts";

// `packageName` is the full module specifier, subpath included; `entryPoints` are the subpaths a root entry's package names explicitly.
type PackageSymbols = {
  packageName: string;
  packageVersion: string;
  symbols: SymbolRecord[];
  entryPoints: string[];
  bundled?: true;
};

// "not-installed" keeps the expanded query in `packageName` and the installable package in `installName`; "no-entry-point" means the package is there but doesn't export that subpath.
export type ResolvePackageSymbolsResult =
  | { status: "found"; result: PackageSymbols }
  | { status: "not-installed"; packageName: string; installName: string }
  | { status: "unusable"; message: string }
  | { status: "no-entry-point"; packageName: string; packageVersion: string; subpath: string; entryPoints: string[] };

// Ties resolve, cache, and extract together; a cache hit never reaches extractPackage(), so a warm lookup pays none of the typescript load cost.
export async function resolvePackageSymbols(rawName: string, startDir: string): Promise<ResolvePackageSymbolsResult> {
  const packageName = expandPackageShorthand(rawName);
  const { packageName: installName, subpath } = splitModuleSpecifier(packageName);
  const found = findPackageDir(installName, startDir);
  if (!found) return { status: "not-installed", packageName, installName };
  if (found.manifestError) return { status: "unusable", message: describeInvalidManifest(installName, found.manifestError) };

  const packageVersion = found.manifest.version ?? "0.0.0";
  const entryPoints = subpath === undefined ? listEntryPoints(found.manifest) : [];
  const entryResolution = subpath === undefined ? resolveEntryTypes(found) : resolveSubpathTypes(found, subpath);
  if (!entryResolution.found) {
    if (subpath !== undefined) return { status: "no-entry-point", packageName: installName, packageVersion, subpath, entryPoints: listEntryPoints(found.manifest) };
    return { status: "unusable", message: describeUnusablePackage(packageName) };
  }

  const cacheDir = getCacheDir();

  const cached = readCache(cacheDir, packageName, packageVersion);
  if (cached) {
    return { status: "found", result: { packageName, packageVersion, symbols: cached.symbols, entryPoints } };
  }

  const symbols = await extractPackage(entryResolution.entryFile, entryResolution.packageRoot);
  writeCache(cacheDir, {
    version: CACHE_FORMAT_VERSION,
    package: packageName,
    packageVersion,
    entryFile: entryResolution.entryFile,
    extractedAt: new Date().toISOString(),
    symbols,
  });

  return { status: "found", result: { packageName, packageVersion, symbols, entryPoints } };
}

// Falls back to bundled reference data (data/packages.json, covering the official @nestjs/* scope) only when the
// package genuinely isn't installed — a live install always wins, so the "matches what you have installed"
// guarantee holds whenever it can. "unusable" (installed but ships no types) is a real local problem and is never
// overridden by bundled data.
export async function resolvePackageSymbolsOrBundled(rawName: string, startDir: string, dataDir: string): Promise<ResolvePackageSymbolsResult> {
  const live = await resolvePackageSymbols(rawName, startDir);
  if (live.status !== "not-installed") return live;

  const packages = loadBundledPackages(dataDir).packages;
  // Bundled subpath entry points are keyed by their full specifier, alongside their package's root entry.
  const bundledEntryPoints = (name: string) =>
    Object.keys(packages).filter((key) => key.startsWith(`${name}/`)).map((key) => key.slice(name.length + 1)).sort();

  const bundled = own(packages, live.packageName);
  if (!bundled) {
    const root = own(packages, live.installName);
    const { subpath } = splitModuleSpecifier(live.packageName);
    if (root && subpath !== undefined) {
      return { status: "no-entry-point", packageName: live.installName, packageVersion: root.packageVersion, subpath, entryPoints: bundledEntryPoints(live.installName) };
    }
    return live;
  }

  const isRoot = live.packageName === live.installName;
  return {
    status: "found",
    result: { packageName: live.packageName, packageVersion: bundled.packageVersion, symbols: bundled.symbols, entryPoints: isRoot ? bundledEntryPoints(live.packageName) : [], bundled: true },
  };
}
