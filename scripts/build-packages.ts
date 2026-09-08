// Produces data/packages.json (full symbol data, so a not-installed official package still renders real docs)
// and data/names.json (bare-symbol-name -> owning package, derived from the same extraction pass).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { resolveEntryTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { fetchAndExtractPackage } from "./lib/fetch-npm-package.ts";
import type { SymbolRecord } from "../src/core/extract/types.ts";

// Every name in src/nest/package-scope.ts's OFFICIAL_SCOPE_NAMES except cli and mau, which ship
// only a `bin` entry (no main/types/exports at all) — pure CLI executables, nothing to document.
const PACKAGE_NAMES = [
  "common",
  "core",
  "microservices",
  "platform-express",
  "platform-fastify",
  "platform-socket.io",
  "platform-ws",
  "testing",
  "websockets",
  "apollo",
  "axios",
  "azure-database",
  "azure-func-http",
  "azure-storage",
  "bull",
  "bullmq",
  "cache-manager",
  "config",
  "cqrs",
  "devtools-integration",
  "elasticsearch",
  "event-emitter",
  "graphql",
  "jwt",
  "mapped-types",
  "mercurius",
  "mongoose",
  "observe",
  "passport",
  "schedule",
  "schematics",
  "sequelize",
  "serve-static",
  "swagger",
  "terminus",
  "throttler",
  "typeorm",
];

type PackageEntry = { packageVersion: string; symbols: SymbolRecord[] };
type PackagesFile = { version: 1; generatedAt: string; packages: Record<string, PackageEntry> };
type NameIndex = { version: 1; generatedAt: string; names: Record<string, string[]> };

async function resolveLatestVersion(name: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
  if (!res.ok) throw new Error(`Latest-version lookup for ${name} failed: ${res.status} ${res.statusText}`);
  const meta = (await res.json()) as { version: string };
  return meta.version;
}

async function main(): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-packages-"));
  const packages: Record<string, PackageEntry> = {};
  const names = new Map<string, string[]>();
  const skipped: string[] = [];

  try {
    for (const short of PACKAGE_NAMES) {
      const packageName = `@nestjs/${short}`;
      const version = await resolveLatestVersion(packageName);
      console.log(`Fetching ${packageName}@${version}...`);
      await fetchAndExtractPackage(packageName, version, tmpDir);

      const found = findPackageDir(packageName, tmpDir);
      if (!found) {
        skipped.push(`${packageName}: extracted but findPackageDir couldn't locate it`);
        continue;
      }

      const entry = resolveEntryTypes(found);
      if (!entry.found) {
        skipped.push(`${packageName}: no usable type declarations found`);
        continue;
      }

      const symbols = await extractPackage(entry.entryFile);
      packages[packageName] = { packageVersion: version, symbols };

      for (const symbol of symbols) {
        const owners = names.get(symbol.name) ?? [];
        if (!owners.includes(packageName)) owners.push(packageName);
        names.set(symbol.name, owners);
      }

      console.log(`  ${symbols.length} exports`);
    }

    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} package(s):`);
      for (const s of skipped) console.log(`  ${s}`);
    }

    const collisions = [...names.entries()].filter(([, owners]) => owners.length > 1);
    if (collisions.length > 0) {
      console.log(`${collisions.length} colliding names (kept, resolved to a disambiguation list at lookup time).`);
    }

    const generatedAt = new Date().toISOString();

    const packagesFile: PackagesFile = { version: 1, generatedAt, packages };
    const sortedNames = Object.fromEntries([...names.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const nameIndex: NameIndex = { version: 1, generatedAt, names: sortedNames };

    mkdirSync("data", { recursive: true });
    writeFileSync("data/packages.json", JSON.stringify(packagesFile));
    writeFileSync("data/names.json", JSON.stringify(nameIndex));

    console.log(
      `Wrote data/packages.json: ${Object.keys(packages).length} packages. ` +
        `Wrote data/names.json: ${names.size} names, ${collisions.length} collisions.`,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
