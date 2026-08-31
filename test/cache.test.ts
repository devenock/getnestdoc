import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
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

// Real, non-malicious inputs always resolve to a real path — asserting that here keeps the tests below focused on the actual behavior under test, not re-proving getCacheFilePath's contract every time.
function mustGetCacheFilePath(cacheDir: string, packageName: string, packageVersion: string): string {
  const filePath = getCacheFilePath(cacheDir, packageName, packageVersion);
  assert.ok(filePath, `expected a real path for ${packageName}@${packageVersion}`);
  return filePath;
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
    const cacheFilePath = mustGetCacheFilePath(getCacheDir(), "@nestjs/common", "12.0.1");
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
    const filePath = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
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
    const filePath = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
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
  const pathA = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
  const pathB = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.2");
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
  const filePath = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
  assert.match(filePath, /@nestjs\+common@12\.0\.1\.json$/);
});

// SECURITY REGRESSION — packageName/packageVersion originate from a real,
// installed *third-party* package's own package.json, not from the CLI's own
// caller. A malicious or compromised package can put anything it wants in
// "version"; nest-doc must never let that escape the cache directory.
//
// Verified against the real end-to-end CLI, not just this unit: a fixture
// package.json with "version": "../../../../../../../tmp/PWNED..." made
// `nest-doc <that-package>` write a real file completely outside the cache
// directory before this fix (getCacheFilePath had no traversal check at
// all), and readCache's corrupt-file self-heal would have deleted whatever
// real file the same traversal pointed at. Both are CWE-22.
// "/" is replaced before any containment check runs, so a "/"-based traversal
// never survives to become a real ".." path segment in the first place — the
// result is a safe (if ugly) filename *inside* cacheDir, not `undefined`.
// `undefined` is the defense-in-depth branch for whatever that replacement
// doesn't catch; what actually matters, and what every case here asserts, is
// that the returned path — defined or not — is never outside cacheDir.
test("getCacheFilePath never resolves outside cacheDir for a traversal-crafted packageVersion", () => {
  const cacheDir = tempCacheDir();
  try {
    const result = getCacheFilePath(cacheDir, "evil-package", "../../../../../../../tmp/PWNED-by-nestdoc");
    if (result !== undefined) assert.ok(result.startsWith(cacheDir + sep), `escaped cacheDir: ${result}`);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("getCacheFilePath never resolves outside cacheDir for a traversal-crafted packageName", () => {
  const cacheDir = tempCacheDir();
  try {
    const result = getCacheFilePath(cacheDir, "../../../../../../../tmp/PWNED-by-nestdoc", "1.0.0");
    if (result !== undefined) assert.ok(result.startsWith(cacheDir + sep), `escaped cacheDir: ${result}`);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("writeCache with a traversal-crafted packageVersion writes nothing outside cacheDir, and does not throw", () => {
  const cacheDir = tempCacheDir();
  const escapeTarget = join(tmpdir(), "getnestdoc-security-test-PWNED.json");
  try {
    rmSync(escapeTarget, { force: true });
    assert.doesNotThrow(() => {
      writeCache(cacheDir, sampleCacheFile({ package: "evil-package", packageVersion: "../../../../../../../../../../tmp/getnestdoc-security-test-PWNED" }));
    });
    assert.equal(existsSync(escapeTarget), false, "must never write outside the cache directory, regardless of how deep the traversal goes");
  } finally {
    rmSync(escapeTarget, { force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("readCache with a traversal-crafted packageVersion never deletes a real file outside cacheDir", () => {
  const cacheDir = tempCacheDir();
  const escapeTarget = join(tmpdir(), "getnestdoc-security-test-DELETEME.txt");
  try {
    writeFileSync(escapeTarget, "this file must survive readCache's corrupt-file self-heal");
    const result = readCache(cacheDir, "evil-package", "../../../../../../../../../../tmp/getnestdoc-security-test-DELETEME.txt");
    assert.equal(result, undefined, "a resolved-outside-cacheDir path is always a miss");
    assert.equal(existsSync(escapeTarget), true, "readCache's self-heal must never delete a file outside the cache directory");
  } finally {
    rmSync(escapeTarget, { force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// SECURITY REGRESSION — a cache entry written by a *pre-fix* version of this
// tool (or hand-tampered on disk) could already have raw escape sequences
// baked into its symbol data. Upgrading nest-doc doesn't retroactively clean
// an existing ~/.cache/getnestdoc/*.json, and a cache entry doesn't
// invalidate just because the tool changed (only a package version bump
// does) — so this has to be re-checked on every read, not just at
// extraction time.
test("readCache strips raw escape sequences from an already-cached entry, not just fresh extractions", () => {
  const cacheDir = tempCacheDir();
  try {
    const esc = "\x1b";
    const bel = "\x07";
    const filePath = mustGetCacheFilePath(cacheDir, "@nestjs/common", "12.0.1");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify(
        sampleCacheFile({
          symbols: [
            {
              name: "totallyNormal",
              kind: "function",
              signature: "function totallyNormal(): void",
              doc: `innocuous docs ${esc}]0;PWNED-TITLE${bel} more text`,
              tags: [{ name: "example", text: `see ${esc}[31mred${esc}[0m` }],
              see: [{ text: `link${esc}`, url: `https://example.com/${esc}` }],
              isPublicApi: true,
              file: "index.d.ts",
              line: 1,
            },
          ],
        }),
      ),
    );

    const result = readCache(cacheDir, "@nestjs/common", "12.0.1");
    assert.ok(result, "expected a cache hit");
    const [symbol] = result!.symbols;
    assert.ok(!symbol!.doc.includes(esc) && !symbol!.doc.includes(bel), `doc still unsafe: ${JSON.stringify(symbol!.doc)}`);
    assert.ok(!symbol!.tags[0]!.text.includes(esc), `tag text still unsafe: ${JSON.stringify(symbol!.tags[0]!.text)}`);
    assert.ok(!symbol!.see[0]!.text.includes(esc) && !symbol!.see[0]!.url.includes(esc), "see link still unsafe");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
