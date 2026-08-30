import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SymbolRecord } from "../core/extract/types.ts";
import { resolvePackageSymbols } from "./symbols.ts";

// Mirrors SPEC.md §2b. Defined here (not scripts/) for the same reason as
// AliasFile/GuidesFile — this is the runtime consumer.
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
  | { status: "found"; packageName: string; packageVersion: string; symbol: SymbolRecord }
  | { status: "not-installed"; packageName: string; name: string }
  | { status: "ambiguous"; packageNames: string[] }
  | { status: "not-found" };

// Everything under node_modules/@nestjs/* that findPackageDir can resolve —
// ADR-0007's fallback for names outside the shipped index ("third-party Nest
// packages fall back to scanning, which is slower and requires
// installation"). Walks up the same way findPackageDir does, since a scoped
// directory's siblings live at the same node_modules level.
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

async function scanInstalledPackagesForName(name: string, startDir: string): Promise<BareSymbolResolution> {
  const candidates = listInstalledNestPackages(startDir);
  const matches: { packageName: string; packageVersion: string; symbol: SymbolRecord }[] = [];

  for (const packageName of candidates) {
    const resolved = await resolvePackageSymbols(packageName, startDir);
    if (resolved.status !== "found") continue;
    const symbol = resolved.result.symbols.find((s) => s.name === name);
    if (symbol) matches.push({ packageName, packageVersion: resolved.result.packageVersion, symbol });
  }

  if (matches.length === 0) return { status: "not-found" };
  if (matches.length > 1) return { status: "ambiguous", packageNames: matches.map((m) => m.packageName) };
  return { status: "found", ...matches[0]! };
}

// SPEC.md §5 resolution step 5, ADR-0007. `name` has already had a leading
// "@" stripped by the caller (the disambiguation table lives in
// doc.command.ts, since it also has to decide "@nestjs/common" is a package
// before this is ever reached).
export async function resolveBareSymbol(name: string, dataDir: string, startDir: string): Promise<BareSymbolResolution> {
  const nameIndex = loadNameIndex(dataDir);
  const owners = nameIndex.names[name];

  if (!owners) return scanInstalledPackagesForName(name, startDir);
  if (owners.length > 1) return { status: "ambiguous", packageNames: owners };

  const packageName = owners[0]!;
  const resolved = await resolvePackageSymbols(packageName, startDir);
  if (resolved.status !== "found") return { status: "not-installed", packageName, name };

  const symbol = resolved.result.symbols.find((s) => s.name === name);
  if (!symbol) return { status: "not-installed", packageName, name };

  return { status: "found", packageName, packageVersion: resolved.result.packageVersion, symbol };
}
