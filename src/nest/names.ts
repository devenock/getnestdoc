import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SymbolRecord } from "../core/extract/types.ts";
import { own } from "../core/own.ts";
import { findPackageDir } from "../core/resolve/find-package.ts";
import { loadBundledPackages } from "./bundled-packages.ts";
import { resolvePackageSymbols, resolvePackageSymbolsOrBundled } from "./symbols.ts";

// The shape of the built bare-symbol-name index: symbol name mapped to the package(s) that export it.
export type NameIndex = {
  version: 1;
  generatedAt: string;
  names: Record<string, string[]>;
};

export function loadNameIndex(dataDir: string): NameIndex {
  const raw = readFileSync(join(dataDir, "names.json"), "utf8");
  return JSON.parse(raw) as NameIndex;
}

export type BareSymbolResolution =
  | { status: "found"; packageName: string; packageVersion: string; symbol: SymbolRecord; bundled?: true }
  | { status: "not-installed"; packageName: string; name: string }
  | { status: "ambiguous"; packageNames: string[] }
  | { status: "not-found" };

// Fallback for names outside the shipped index — scans node_modules/@nestjs/* directly, walking up the same way findPackageDir does.
function listInstalledNestPackages(startDir: string): string[] {
  let dir = startDir;
  while (true) {
    const scopeDir = join(dir, "node_modules", "@nestjs");
    if (existsSync(scopeDir)) {
      return readdirSync(scopeDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `@nestjs/${entry.name}`);
    }
    if (existsSync(join(dir, ".git"))) return [];
    const parent = dirname(dir);
    if (parent === dir) return [];
    dir = parent;
  }
}

// Every bare-word miss reaches this scan, so a typo used to cold-extract every installed @nestjs/* package (~460 ms
// for five, against a 150 ms budget). An install at exactly the bundled version is skipped: names.json was built
// from that version, so it already says the name isn't there. Only versions the index wasn't built from can add names.
async function scanInstalledPackagesForName(name: string, startDir: string, dataDir: string): Promise<BareSymbolResolution> {
  const candidates = listInstalledNestPackages(startDir);
  const bundled = loadBundledPackages(dataDir).packages;
  const matches: { packageName: string; packageVersion: string; symbol: SymbolRecord }[] = [];

  for (const packageName of candidates) {
    const installedVersion = findPackageDir(packageName, startDir)?.manifest.version;
    if (installedVersion !== undefined && own(bundled, packageName)?.packageVersion === installedVersion) continue;

    const resolved = await resolvePackageSymbols(packageName, startDir);
    if (resolved.status !== "found") continue;
    const symbol = resolved.result.symbols.find((s) => s.name === name);
    if (symbol) matches.push({ packageName, packageVersion: resolved.result.packageVersion, symbol });
  }

  if (matches.length === 0) return { status: "not-found" };
  if (matches.length > 1) return { status: "ambiguous", packageNames: matches.map((m) => m.packageName) };
  return { status: "found", ...matches[0]! };
}

// Resolves a bare symbol name to its package; `name` has already had a leading "@" stripped by the caller.
export async function resolveBareSymbol(name: string, dataDir: string, startDir: string): Promise<BareSymbolResolution> {
  const nameIndex = loadNameIndex(dataDir);
  const owners = own(nameIndex.names, name);

  if (!owners) return scanInstalledPackagesForName(name, startDir, dataDir);
  if (owners.length > 1) return { status: "ambiguous", packageNames: owners };

  const packageName = owners[0]!;
  const resolved = await resolvePackageSymbolsOrBundled(packageName, startDir, dataDir);
  if (resolved.status !== "found") return { status: "not-installed", packageName, name };

  const symbol = resolved.result.symbols.find((s) => s.name === name);
  if (!symbol) return { status: "not-installed", packageName, name };

  return { status: "found", packageName, packageVersion: resolved.result.packageVersion, symbol, ...(resolved.result.bundled ? { bundled: true } : {}) };
}
