import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../../dist/nest-doc.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function run(args: string[], cwd = REPO_ROOT) {
  const cacheDir = mkdtempSync(join(tmpdir(), "getnestdoc-queries-cache-"));
  try {
    return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { ...process.env, XDG_CACHE_HOME: cacheDir } });
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

// A throwaway project with a .git boundary, so the upward node_modules walk never leaves it.
// `files` maps project-relative paths to contents.
function withScratchProject(files: Record<string, string>, body: (projectDir: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "getnestdoc-queries-project-"));
  try {
    mkdirSync(join(root, ".git"));
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Every data file is a JSON-loaded plain object, so `record[query]` used to resolve Object.prototype members:
// "constructor" rendered an empty guide and exited 0, "toString --api" crashed with exit 4.
test("Object.prototype member names are ordinary misses, never a blank render or a crash", () => {
  for (const args of [["constructor"], ["__proto__"], ["toString", "--api"], ["hasOwnProperty", "--api"], ["valueOf", "--guide"]]) {
    const result = run(args);
    assert.equal(result.status, 1, `nest-doc ${args.join(" ")}: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
    assert.equal(result.stdout, "", `nest-doc ${args.join(" ")}: expected empty stdout`);
    assert.match(result.stderr, /No guide or symbol matches/);
  }
});

// package.json is third-party input (ADR-0009). A malformed one used to escape as an uncaught SyntaxError (exit 4,
// stack trace); a wrongly-typed field (`"types": 5`) as a TypeError from path.join.
test("an installed package with a malformed package.json is reported as unusable (exit 3), not a crash", () => {
  withScratchProject({ "node_modules/broken-json/package.json": '{"name": "broken-json",' }, (projectDir) => {
    const result = run(["broken-json"], projectDir);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stderr, /"broken-json" is installed but its package\.json is not valid JSON/);
    assert.doesNotMatch(result.stderr, /SyntaxError|\n\s+at /);
  });
});

test("wrongly-typed package.json fields are ignored rather than crashing resolution", () => {
  withScratchProject(
    {
      "node_modules/odd-types/package.json": JSON.stringify({ name: "odd-types", version: { major: 1 }, types: 5, main: ["x"] }),
      "node_modules/odd-types/index.d.ts": "export declare function stillFound(): void;\n",
    },
    (projectDir) => {
      const result = run(["odd-types"], projectDir);
      assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
      assert.match(result.stdout, /^odd-types@0\.0\.0$/m);
      assert.match(result.stdout, /stillFound/);
    },
  );
});

// Rendered guides print internal links as `nest-doc <slug>#<anchor>` (121 of them in the shipped corpus), but the
// lookup had no `#` handling, so every one of those printed commands was a miss.
test("nest-doc <slug>#<anchor> prints just that section, up to the next heading of the same depth", () => {
  const result = run(["interceptors#binding-interceptors"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Binding interceptors\n/);
  assert.match(result.stdout, /UseInterceptors/);
  assert.doesNotMatch(result.stdout, /^Basics$/m, "content before the section leaked in");
  assert.doesNotMatch(result.stdout, /^Response mapping$/m, "the next same-depth section leaked in");
});

test("an anchor written without the heading's punctuation still finds the section", () => {
  const result = run(["fundamentals/dependency-injection#factory-providers-usefactory"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /^Factory providers: useFactory\n/);
});

test("an anchor no heading matches prints the whole guide with a note on stderr, never a miss", () => {
  const result = run(["techniques/configuration#service"]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /No section "#service" in techniques\/configuration; showing the whole guide\./);
  assert.match(result.stdout, /^Configuration\n/);
});

// Together they skipped every resolution step, so any query — even an exact guide slug — was reported as a miss
// (exit 1) with a "did you mean" pointing at the very slug typed.
test("--guide and --api together are a usage error (exit 2), not a false miss", () => {
  const result = run(["interceptors", "--guide", "--api"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /cannot be used with/);
});

// exitOverride() was applied after the `update` subcommand was created, and commander only copies it into
// subcommands at creation — so `update`'s usage errors exited 1 ("not found") instead of 2.
test("usage errors on the update subcommand exit 2, like the root command's", () => {
  for (const args of [["update", "--bogus"], ["update", "extra-arg"]]) {
    const result = run(args);
    assert.equal(result.status, 2, `nest-doc ${args.join(" ")}: expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /Fetching/, "must fail before any network access");
  }
});

const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures", import.meta.url));

// A typo in an existing package's export used to fall through every step: `common.Injectible` ended in a generic miss
// suggesting only guide slugs, and `@nestjs/common.Injectible` claimed the package wasn't installed and exited 0.
test("a missing export in an installed package is a miss with near matches from that package's exports", () => {
  for (const query of ["common.Injectible", "@nestjs/common.Injectible"]) {
    const result = run([query], FIXTURES_ROOT);
    assert.equal(result.status, 1, `${query}: expected exit 1, got ${result.status}. stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^No export "Injectible" in @nestjs\/common@12\.0\.1\./);
    assert.match(result.stderr, /Did you mean\?\n {2}nest-doc common\.Injectable\n/);
  }
});

test("a missing export in a bundled (not installed) package gets the same treatment", () => {
  const result = run(["throttler.Throtle"], FIXTURES_ROOT);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^No export "Throtle" in @nestjs\/throttler@/);
  assert.match(result.stderr, /nest-doc throttler\.Throttle/);
});

test("a bare-symbol typo suggests symbol names from the index, not only guide slugs", () => {
  const result = run(["Injectible"], FIXTURES_ROOT);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No guide or symbol matches "Injectible"/);
  assert.match(result.stderr, /nest-doc Injectable\n/);
});

test("a dotted query that is itself an installed package name still resolves as that package", () => {
  withScratchProject(
    {
      "node_modules/socket/package.json": JSON.stringify({ name: "socket", version: "1.0.0", types: "index.d.ts" }),
      "node_modules/socket/index.d.ts": "export declare const plain: 1;\n",
      "node_modules/socket.io/package.json": JSON.stringify({ name: "socket.io", version: "2.0.0", types: "index.d.ts" }),
      "node_modules/socket.io/index.d.ts": "export declare class Server {}\n",
    },
    (projectDir) => {
      const result = run(["socket.io"], projectDir);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^socket\.io@2\.0\.0$/m);
      assert.match(result.stdout, /Server/);
    },
  );
});

// Runs the binary with a cache directory the test can inspect afterwards — a written cache entry is proof that a
// package was extracted.
function runKeepingCache(args: string[], cwd: string): { status: number | null; stderr: string; cached: string[] } {
  const cacheHome = mkdtempSync(join(tmpdir(), "getnestdoc-queries-cache-"));
  try {
    const result = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { ...process.env, XDG_CACHE_HOME: cacheHome } });
    const cacheDir = join(cacheHome, "getnestdoc");
    return { status: result.status, stderr: result.stderr, cached: existsSync(cacheDir) ? readdirSync(cacheDir).sort() : [] };
  } finally {
    rmSync(cacheHome, { recursive: true, force: true });
  }
}

// Every bare-word miss runs the installed-package scan, and it used to cold-extract every installed @nestjs/* package
// (measured ~460 ms for the five fixtures — a typo blew the 150 ms budget three times over).
test("a bare-word miss skips installed packages already covered by the bundled index at the same version", () => {
  const result = runKeepingCache(["Xyzzy"], FIXTURES_ROOT);
  assert.equal(result.status, 1);
  // common@12.0.1, core@12.0.1, swagger@12.0.1 match data/packages.json exactly; common-10/common-11 aren't bundled.
  assert.deepEqual(result.cached, ["@nestjs+common-10@10.4.22.json", "@nestjs+common-11@11.2.3.json"]);
});

test("a name only an installed newer version exports is still found by the scan", () => {
  withScratchProject(
    {
      "node_modules/@nestjs/common/package.json": JSON.stringify({ name: "@nestjs/common", version: "99.0.0", types: "index.d.ts" }),
      "node_modules/@nestjs/common/index.d.ts": "/** Added in 99. @publicApi */\nexport declare function BrandNewDecorator(): ClassDecorator;\n",
    },
    (projectDir) => {
      const result = run(["BrandNewDecorator"], projectDir);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^@nestjs\/common@99\.0\.0$/m);
      assert.match(result.stdout, /function BrandNewDecorator\(\): ClassDecorator/);
    },
  );
});

// pnpm (and workspaces, `npm link`) install node_modules/@nestjs/<pkg> as a symlink; the scan filtered on
// Dirent.isDirectory(), which is false for a symlink, so a name only the installed version exports was never found.
test("the fallback scan also covers symlinked packages (pnpm layout)", () => {
  withScratchProject(
    {
      "store/common/package.json": JSON.stringify({ name: "@nestjs/common", version: "99.0.0", types: "index.d.ts" }),
      "store/common/index.d.ts": "export declare function LinkedOnly(): ClassDecorator;\n",
    },
    (projectDir) => {
      mkdirSync(join(projectDir, "node_modules", "@nestjs"), { recursive: true });
      symlinkSync(join(projectDir, "store", "common"), join(projectDir, "node_modules", "@nestjs", "common"));
      const result = run(["LinkedOnly"], projectDir);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /function LinkedOnly\(\): ClassDecorator/);
    },
  );
});
