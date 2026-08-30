import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { resolveEntryTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { resolveSeeUrl } from "../src/nest/guides/index.ts";
import { loadGuides } from "../src/nest/guides/index.ts";
import { loadAliases } from "../src/nest/aliases.ts";

const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));
const FIXTURES_ROOT = fileURLToPath(new URL("./fixtures", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function run(args: string[], cwd = REPO_ROOT) {
  const cacheDir = mkdtempSync(join(tmpdir(), "getnestdoc-phase8-cache-"));
  try {
    return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { ...process.env, XDG_CACHE_HOME: cacheDir } });
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

test("nest-doc @Get and nest-doc Get both resolve to @nestjs/common's Get, with its routing @see link", () => {
  for (const query of ["@Get", "Get"]) {
    const result = run([query], FIXTURES_ROOT);
    assert.equal(result.status, 0, `${query}: expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stdout, /@nestjs\/common@/);
    assert.match(result.stdout, /const Get:|function Get\(/);
    assert.match(result.stdout, /nest-doc controllers/, `${query}: expected the routing @see link to resolve into a See also entry`);
  }
});

test("nest-doc @nestjs/common still resolves as a package, not a decorator", () => {
  const result = run(["@nestjs/common"], FIXTURES_ROOT);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^@nestjs\/common@\d+\.\d+\.\d+$/m);
  assert.match(result.stdout, /exports, \d+ public/);
});

test("nest-doc @foo exits 2 (lowercase word after @ has no defined meaning)", () => {
  const result = run(["@foo"], FIXTURES_ROOT);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a valid package.*or decorator/);
});

test("nest-doc Module resolves to the guide; nest-doc Module --api resolves to the symbol", () => {
  const guideResult = run(["Module"], FIXTURES_ROOT);
  assert.equal(guideResult.status, 0);
  assert.match(guideResult.stdout, /^Modules$/m);

  const apiResult = run(["Module", "--api"], FIXTURES_ROOT);
  assert.equal(apiResult.status, 0);
  assert.match(apiResult.stdout, /@nestjs\/common@/);
  assert.match(apiResult.stdout, /function Module\(/);
});

test("@nestjs/swagger (zero @publicApi tags) falls back to listing all exports, not an empty index", () => {
  const result = run(["@nestjs/swagger"], FIXTURES_ROOT);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^160 exports, 0 public$/m);
  assert.match(result.stdout, /ApiProperty/, "expected the full export list despite 0 public-tagged symbols");
  assert.match(result.stdout, /DECORATORS/);
});

test("an undocumented symbol (swagger's ApiProperty) renders signature + an explicit no-documentation line, never a blank section", () => {
  const result = run(["@nestjs/swagger.ApiProperty"], FIXTURES_ROOT);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /function ApiProperty\(/);
  assert.match(result.stdout, /No documentation available/);
});

test("the common package index shows 177 public exports, 206 with --all", () => {
  const publicResult = run(["@nestjs/common"], FIXTURES_ROOT);
  assert.equal(publicResult.status, 0);
  assert.match(publicResult.stdout, /^206 exports, 177 public$/m);

  const allResult = run(["--all", "@nestjs/common"], FIXTURES_ROOT);
  assert.equal(allResult.status, 0);
  assert.match(allResult.stdout, /^206 exports, 177 public$/m);
  // `flatten` is a real, verified non-public export (isPublicApi: false,
  // 29 of 206) — only visible with --all, proving the flag actually changes
  // the listed set rather than just the header line.
  assert.doesNotMatch(publicResult.stdout, /^ {2}flatten\b/m);
  assert.match(allResult.stdout, /^ {2}flatten\b/m);
});

test("every resolvable See also entry across @nestjs/common, when run as a command, exits 0", async () => {
  const found = findPackageDir("@nestjs/common", FIXTURES_ROOT);
  assert.ok(found);
  const entry = resolveEntryTypes(found);
  assert.ok(entry.found);
  const symbols = await extractPackage(entry.entryFile);

  const guidesFile = loadGuides(join(REPO_ROOT, "data"));
  const aliasFile = loadAliases(join(REPO_ROOT, "data"));

  const paths = new Set<string>();
  for (const symbol of symbols) {
    for (const link of symbol.see) {
      const resolved = resolveSeeUrl(link.url, guidesFile, aliasFile);
      if (resolved) paths.add(resolved);
    }
  }

  assert.ok(paths.size > 0, "expected at least one resolvable See also entry to actually test");

  for (const path of paths) {
    const result = run([path]);
    assert.equal(result.status, 0, `nest-doc ${path} exited ${result.status}, expected 0. stderr: ${result.stderr}`);
  }
});

test("a bare name mapping to multiple packages is ambiguous: exits 1, lists every option", () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "getnestdoc-phase8-ambiguous-"));
  try {
    mkdirSync(join(scratchRoot, "dist"), { recursive: true });
    cpSync(BIN, join(scratchRoot, "dist", "nest-doc.mjs"));
    symlinkSync(join(REPO_ROOT, "node_modules"), join(scratchRoot, "node_modules"));
    cpSync(join(REPO_ROOT, "data"), join(scratchRoot, "data"), { recursive: true });

    const names = JSON.parse(readFileSync(join(scratchRoot, "data", "names.json"), "utf8")) as { names: Record<string, string[]> };
    names.names.FakeCollide = ["@nestjs/common", "@nestjs/swagger"];
    writeFileSync(join(scratchRoot, "data", "names.json"), JSON.stringify(names));

    const cacheDir = mkdtempSync(join(tmpdir(), "getnestdoc-phase8-cache-"));
    try {
      const result = spawnSync(process.execPath, [join(scratchRoot, "dist", "nest-doc.mjs"), "FakeCollide"], {
        encoding: "utf8",
        cwd: FIXTURES_ROOT,
        env: { ...process.env, XDG_CACHE_HOME: cacheDir },
      });
      assert.equal(result.status, 1, `expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
      assert.match(result.stdout, /ambiguous/i);
      assert.match(result.stdout, /nest-doc @nestjs\/common\.FakeCollide/);
      assert.match(result.stdout, /nest-doc @nestjs\/swagger\.FakeCollide/);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("nest-doc update is the only code path making a network call", () => {
  const bundle = readFileSync(BIN, "utf8");
  const fetchCallSites = [...bundle.matchAll(/\bfetch\(/g)];
  assert.equal(fetchCallSites.length, 2, `expected exactly 2 fetch() call sites (both in fetch-docs-repo.ts, reachable only from the update command), found ${fetchCallSites.length}`);

  // Both call sites' surrounding context should reference GitHub (either
  // api.github.com, for the commit sha, or codeload.github.com, for the
  // tarball itself) — a loose but real guard against a stray fetch() being
  // introduced anywhere else in the bundle.
  for (const match of fetchCallSites) {
    const context = bundle.slice(match.index, match.index + 200);
    assert.match(context, /github\.com/, "unexpected fetch() target outside the docs-repo fetch path");
  }
});
