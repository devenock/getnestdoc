import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
