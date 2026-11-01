import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
