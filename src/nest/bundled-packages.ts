import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SymbolRecord } from "../core/extract/types.ts";

export type BundledPackageEntry = {
  packageVersion: string;
  symbols: SymbolRecord[];
};

export type PackagesFile = {
  version: 1;
  generatedAt: string;
  packages: Record<string, BundledPackageEntry>;
};

// Loaded lazily, only when a live node_modules lookup has already missed — the common case
// (package actually installed) never pays to parse this.
export function loadBundledPackages(dataDir: string): PackagesFile {
  const raw = readFileSync(join(dataDir, "packages.json"), "utf8");
  return JSON.parse(raw) as PackagesFile;
}
