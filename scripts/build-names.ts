// Produces data/names.json, build-time only, scoped to the 9 nestjs/nest monorepo packages plus @nestjs/swagger; names outside this index fall back to scanning the user's installed @nestjs/*.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { resolveEntryTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { fetchAndExtractPackage } from "./lib/fetch-npm-package.ts";

// All 10 release in lockstep at the same version — verified against the npm registry, not assumed.
const VERSION = "12.0.1";
const PACKAGES = [
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/microservices",
  "@nestjs/platform-express",
  "@nestjs/platform-fastify",
  "@nestjs/platform-socket.io",
  "@nestjs/platform-ws",
  "@nestjs/testing",
  "@nestjs/websockets",
  "@nestjs/swagger",
];

type NameIndex = {
  version: 1;
  generatedAt: string;
  names: Record<string, string[]>;
};

async function main(): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-names-"));
  const names = new Map<string, string[]>();

  try {
    for (const packageName of PACKAGES) {
      console.log(`Fetching ${packageName}@${VERSION}...`);
      await fetchAndExtractPackage(packageName, VERSION, tmpDir);

      const found = findPackageDir(packageName, tmpDir);
      if (!found) throw new Error(`${packageName}: extracted but findPackageDir couldn't locate it`);

      const entry = resolveEntryTypes(found);
      if (!entry.found) throw new Error(`${packageName}: no usable type declarations found`);

      const symbols = await extractPackage(entry.entryFile);
      for (const symbol of symbols) {
        const owners = names.get(symbol.name) ?? [];
        if (!owners.includes(packageName)) owners.push(packageName);
        names.set(symbol.name, owners);
      }
      console.log(`  ${symbols.length} exports`);
    }

    const collisions = [...names.entries()].filter(([, owners]) => owners.length > 1);
    if (collisions.length > 0) {
      console.log(`${collisions.length} colliding names (kept, resolved to a disambiguation list at lookup time):`);
      for (const [name, owners] of collisions) console.log(`  ${name}: ${owners.join(", ")}`);
    }

    const sortedNames = Object.fromEntries([...names.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const nameIndex: NameIndex = {
      version: 1,
      generatedAt: new Date().toISOString(),
      names: sortedNames,
    };

    mkdirSync("data", { recursive: true });
    writeFileSync("data/names.json", JSON.stringify(nameIndex));
    console.log(`Wrote data/names.json: ${names.size} names across ${PACKAGES.length} packages, ${collisions.length} collisions.`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
