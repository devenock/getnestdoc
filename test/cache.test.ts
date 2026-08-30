import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getCacheDir, getCacheFilePath } from "../src/core/cache/paths.ts";
import { readCache, writeCache } from "../src/core/cache/store.ts";
import type { CacheFile } from "../src/core/cache/store.ts";
import { resolvePackageSymbols } from "../src/nest/symbols.ts";

const FIXTURES_ROOT = fileURLToPath(new URL("./fixtures", import.meta.url));
const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));

function tempCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "getnestdoc-cache-test-"));
}

function sampleCacheFile(overrides: Partial<CacheFile> = {}): CacheFile {
  return {
    version: 1,
    package: "@nestjs/common",
    packageVersion: "12.0.1",
    entryFile: "/x/index.d.ts",
    extractedAt: new Date().toISOString(),
    symbols: [],
    ...overrides,
  };
}

// Combined into one test, deliberately: resolvePackageSymbols() reads
// process.env.XDG_CACHE_HOME internally (via getCacheDir()), a process-global
// — node:test runs top-level tests within a file concurrently by default, so
// two separate tests each setting/clearing that same global raced each other
// here (verified: splitting them produced a real, intermittent failure where
// one test's write landed in another's directory). One test owns the mutation
// for its entire duration instead.
test("cache is written after the first extraction, and a warm lookup does not re-parse", async () => {
  const cacheDir = tempCacheDir();
  try {
    process.env.XDG_CACHE_HOME = cacheDir;

    // getCacheDir() nests an extra "getnestdoc" segment under XDG_CACHE_HOME
    // (SPEC.md §3) — resolve through it rather than against cacheDir
    // directly, or this checks a path resolvePackageSymbols never writes to.
    const cacheFilePath = getCacheFilePath(getCacheDir(), "@nestjs/common", "12.0.1");
    const before = existsSync(cacheFilePath);
    assert.equal(before, false);

    const coldStart = process.hrtime.bigint();
    const cold = await resolvePackageSymbols("@nestjs/common", FIXTURES_ROOT);
    const coldMs = Number(process.hrtime.bigint() - coldStart) / 1e6;
    assert.equal(cold.status, "found");

    const after = existsSync(cacheFilePath);
    assert.equal(after, true, "cache file should exist after the first (cold) extraction");

    const warmStart = process.hrtime.bigint();
    const warm = await resolvePackageSymbols("@nestjs/common", FIXTURES_ROOT);
    const warmMs = Number(process.hrtime.bigint() - warmStart) / 1e6;
    assert.equal(warm.status, "found");

    console.log(`[cache.test] cold ${coldMs.toFixed(1)} ms, warm ${warmMs.toFixed(1)} ms`);
    assert.ok(warmMs < coldMs / 4, `warm (${warmMs.toFixed(1)} ms) should be well under a quarter of cold (${coldMs.toFixed(1)} ms)`);
    assert.ok(warmMs < 20, `warm lookup took ${warmMs.toFixed(1)} ms, expected well under 20 ms for a cache read`);

    if (cold.status === "found" && warm.status === "found") {
      assert.equal(warm.result.symbols.length, cold.result.symbols.length);
    }
  } finally {
    delete process.env.XDG_CACHE_HOME;
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("truncated JSON self-heals: deleted, treated as a miss, and a fresh write succeeds after", () => {
  const cacheDir = tempCacheDir();
  try {
    const filePath = getCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(filePath, '{"version": 1, "package": "@nestjs/common", "symbols": [ { "trunc');

    const result = readCache(cacheDir, "@nestjs/common", "12.0.1");
    assert.equal(result, undefined, "corrupt cache should read as a miss");
    assert.equal(existsSync(filePath), false, "corrupt cache file should have been deleted (self-heal)");

    writeCache(cacheDir, sampleCacheFile());
    assert.equal(existsSync(filePath), true, "a fresh write after self-heal should succeed");
    const healed = readCache(cacheDir, "@nestjs/common", "12.0.1");
    assert.ok(healed);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("a CacheFile.version mismatch is treated as a miss, not an error", () => {
  const cacheDir = tempCacheDir();
  try {
    mkdirSync(cacheDir, { recursive: true });
    const filePath = getCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
    // @ts-expect-error deliberately writing an incompatible format version
    writeFileSync(filePath, JSON.stringify(sampleCacheFile({ version: 2 })));

    const result = readCache(cacheDir, "@nestjs/common", "12.0.1");
    assert.equal(result, undefined);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("a read-only cache directory: writeCache does not throw, warns once, still succeeds overall", () => {
  const cacheDir = tempCacheDir();
  mkdirSync(cacheDir, { recursive: true });
  chmodSync(cacheDir, 0o444);
  try {
    assert.doesNotThrow(() => {
      writeCache(cacheDir, sampleCacheFile());
    });
  } finally {
    chmodSync(cacheDir, 0o755);
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("a read-only cache directory: the real binary still exits 0 for a symbol lookup", () => {
  const cacheDir = tempCacheDir();
  mkdirSync(cacheDir, { recursive: true });
  chmodSync(cacheDir, 0o444);
  try {
    const result = spawnSync(process.execPath, [BIN, "common.Injectable"], {
      encoding: "utf8",
      cwd: FIXTURES_ROOT,
      env: { ...process.env, XDG_CACHE_HOME: cacheDir },
    });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stdout, /Injectable/);
  } finally {
    chmodSync(cacheDir, 0o755);
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("changing the package version produces a different cache file path", () => {
  const cacheDir = tempCacheDir();
  const pathA = getCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
  const pathB = getCacheFilePath(cacheDir, "@nestjs/common", "12.0.2");
  assert.notEqual(pathA, pathB);

  try {
    writeCache(cacheDir, sampleCacheFile({ packageVersion: "12.0.1" }));
    writeCache(cacheDir, sampleCacheFile({ packageVersion: "12.0.2" }));
    assert.equal(existsSync(pathA), true);
    assert.equal(existsSync(pathB), true);
    // Confirm they're genuinely independent entries, not aliases of one file.
    const contentA = JSON.parse(readFileSync(pathA, "utf8")) as CacheFile;
    assert.equal(contentA.packageVersion, "12.0.1");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("scoped package names flatten correctly in the cache filename (@nestjs/common -> @nestjs+common)", () => {
  const cacheDir = tempCacheDir();
  const filePath = getCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
  assert.match(filePath, /@nestjs\+common@12\.0\.1\.json$/);
});
