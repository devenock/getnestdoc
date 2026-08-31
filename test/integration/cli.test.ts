import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json" with { type: "json" };

const BIN = fileURLToPath(new URL("../../dist/nest-doc.mjs", import.meta.url));

test("dist/nest-doc.mjs exists (run `npm run build` first)", () => {
  assert.ok(existsSync(BIN), `${BIN} does not exist`);
});

test("nest-doc --version prints the package version and exits 0", () => {
  const result = spawnSync(process.execPath, [BIN, "--version"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});

test("nest-doc --help prints usage and exits 0", () => {
  const result = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: nest-doc/);
});

test("nest-doc -v is a shorthand for --version", () => {
  const result = spawnSync(process.execPath, [BIN, "-v"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});

test("nest-doc --version resolves from an unrelated working directory", () => {
  const result = spawnSync(process.execPath, [BIN, "--version"], {
    encoding: "utf8",
    cwd: "/tmp",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});
