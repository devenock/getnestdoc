// Produces data/packages.json (full symbol data, so a not-installed official package still renders real docs)
// and data/names.json (bare-symbol-name -> owning package, derived from the same extraction pass).
//
//   node scripts/build-packages.ts          latest published version of every package (release refresh)
//   node scripts/build-packages.ts --pin    the versions already in data/packages.json — re-extracts after an
//                                           extractor change without also pulling in upstream changes
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { listEntryPoints, resolveEntryTypes, resolveSubpathTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { installPackage } from "./lib/install-npm-package.ts";
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

// Root packages only: subpath entries are re-derived from each package's own exports map.
function pinnedVersions(): Map<string, string> {
  const existing = JSON.parse(readFileSync("data/packages.json", "utf8")) as PackagesFile;
  return new Map(Object.entries(existing.packages).map(([name, entry]) => [name, entry.packageVersion]));
}

async function main(): Promise<void> {
  const pins = process.argv.includes("--pin") ? pinnedVersions() : undefined;
  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-packages-"));
  const packages: Record<string, PackageEntry> = {};
  const names = new Map<string, string[]>();
  const skipped: string[] = [];
  const subpathEntries: { specifier: string; symbols: SymbolRecord[] }[] = [];

  try {
    for (const short of PACKAGE_NAMES) {
      const packageName = `@nestjs/${short}`;
      const pinned = pins?.get(packageName);
      if (pins && !pinned) throw new Error(`--pin: ${packageName} has no version in data/packages.json`);
      const version = pinned ?? (await resolveLatestVersion(packageName));
      console.log(`Installing ${packageName}@${version}...`);
      const installDir = join(tmpDir, short);
      installPackage(packageName, version, installDir);

      const found = findPackageDir(packageName, installDir);
      if (!found) {
        skipped.push(`${packageName}: extracted but findPackageDir couldn't locate it`);
        continue;
      }

      if (found.manifestError) {
        skipped.push(`${packageName}: ${found.manifestError}`);
        continue;
      }

      const entry = resolveEntryTypes(found);
      if (!entry.found) {
        skipped.push(`${packageName}: no usable type declarations found`);
        continue;
      }

      const symbols = await extractPackage(entry.entryFile, entry.packageRoot);
      packages[packageName] = { packageVersion: version, symbols };
      const addOwner = (name: string, owner: string) => {
        const owners = names.get(name) ?? [];
        if (!owners.includes(owner)) owners.push(owner);
        names.set(name, owners);
      };
      for (const symbol of symbols) addOwner(symbol.name, packageName);
      console.log(`  ${symbols.length} exports`);

      // Each named subpath entry point (./multipart, ./internal, ./plugin) is bundled under its full specifier; its bare-name ownership is settled after every root is known.
      for (const subpath of listEntryPoints(found.manifest)) {
        const specifier = `${packageName}/${subpath}`;
        const subEntry = resolveSubpathTypes(found, subpath);
        if (!subEntry.found) {
          skipped.push(`${specifier}: no usable type declarations found`);
          continue;
        }
        const subSymbols = await extractPackage(subEntry.entryFile, subEntry.packageRoot);
        packages[specifier] = { packageVersion: version, symbols: subSymbols };
        subpathEntries.push({ specifier, symbols: subSymbols });
        console.log(`  ${specifier}: ${subSymbols.length} exports`);
      }
    }

    // Bare names prefer public roots: a subpath entry owns a name only when no package root exports it, so an internal entry point (`@nestjs/core/internal`'s Module class) can't make `nest-doc @Module` ambiguous. It stays reachable as core/internal.Module.
    const rootNames = new Set(names.keys());
    for (const { specifier, symbols: subSymbols } of subpathEntries) {
      for (const symbol of subSymbols) {
        if (rootNames.has(symbol.name)) continue;
        const owners = names.get(symbol.name) ?? [];
        if (!owners.includes(specifier)) owners.push(specifier);
        names.set(symbol.name, owners);
      }
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
