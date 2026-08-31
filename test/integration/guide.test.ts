import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../../dist/nest-doc.mjs", import.meta.url));

function run(args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
}

test("nest-doc interceptors: exact slug resolves, exits 0, stderr empty", () => {
  const result = run(["interceptors"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Interceptors/);
  assert.equal(result.stderr, "");
});

test("nest-doc providers: resolves via the alias table to components.md, exits 0", () => {
  const result = run(["providers"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Providers/);
  assert.equal(result.stderr, "");
});

test("nest-doc guards | cat: piped stdout contains zero escape codes", () => {
  const result = run(["guards"]);
  assert.equal(result.status, 0);
  assert.ok(!result.stdout.includes("\x1b"), "escape code found in piped (non-TTY) output");
});

test("a long guide spawned non-interactively prints in full, never pages", () => {
  const result = run(["custom-decorators"]);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.split("\n").length > 100, "expected a long guide to sanity-check the no-paging path");
  assert.match(result.stdout, /Custom route decorators/);
  assert.match(result.stdout, /Param decorator/i);
});

test("nest-doc intercepters: miss suggests on stderr, stdout empty, exits 1", () => {
  const result = run(["intercepters"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /No guide or symbol matches "intercepters"/);
  assert.match(result.stderr, /Did you mean\?/);
  assert.match(result.stderr, /nest-doc interceptors/);
});

test("nest-doc (no query): usage error on stderr, exits 2", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /missing required argument/);
});

test("nest-doc interceptors --bogus: unknown option, exits 2", () => {
  const result = run(["interceptors", "--bogus"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option/);
});

test("--js selects the JavaScript code variant over TypeScript", () => {
  const ts = run(["microservices/basics"]);
  const js = run(["microservices/basics", "--js"]);
  assert.equal(ts.status, 0);
  assert.equal(js.status, 0);
  // The guide has several @@switch blocks; pin to one specific, unique line
  // rather than scanning the whole page — not every block necessarily has a
  // distinct js variant, so a page-wide "must never contain X" check is
  // fragile against blocks that correctly fall back to the ts content.
  assert.match(ts.stdout, /import \{ Transport, MicroserviceOptions \} from '@nestjs\/microservices';/);
  assert.match(js.stdout, /import \{ Transport \} from '@nestjs\/microservices';/);
  assert.ok(
    !js.stdout.includes("import { Transport, MicroserviceOptions }"),
    "--js output still shows the TS-only type import",
  );
});
