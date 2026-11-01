import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import pkg from "../package.json" with { type: "json" };
import { assertCompilerApi } from "../src/core/extract/typescript-loader.ts";
import { isolatedEnv } from "./helpers/env.ts";

const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// ADR-0001's promised CI assertion: a transitive or careless bump to typescript 7 (the Go port, no JS Compiler API)
// fails the build here instead of failing a user's first symbol lookup.
test("the installed typescript is exactly the pinned 6.0.3 and exposes the Compiler API", () => {
  assert.equal(pkg.dependencies.typescript, "6.0.3", "package.json must pin typescript exactly, no range (ADR-0001)");
  assert.equal(ts.version, "6.0.3");
  assert.equal(typeof ts.createSourceFile, "function");
});

test("a typescript 7-shaped module is rejected with a message naming the required version", () => {
  assert.throws(() => assertCompilerApi({ version: "7.0.2", versionMajorMinor: "7.0" } as never), /typescript 7\.0\.2 has no JavaScript Compiler API.*requires typescript 6\.0\.3/);
  assert.doesNotThrow(() => assertCompilerApi(ts));
});

// ARCHITECTURE.md §10: if typescript can't load, guide lookups keep working and symbol lookups error clearly.
test("without typescript installed, guides still work and a symbol lookup fails with a clear message", () => {
  const scratch = mkdtempSync(join(tmpdir(), "getnestdoc-no-typescript-"));
  try {
    mkdirSync(join(scratch, "dist"));
    cpSync(BIN, join(scratch, "dist", "nest-doc.mjs"));
    cpSync(join(REPO_ROOT, "data"), join(scratch, "data"), { recursive: true });
    cpSync(join(REPO_ROOT, "package.json"), join(scratch, "package.json"));
    const project = join(scratch, "project");
    mkdirSync(join(project, ".git"), { recursive: true });
    mkdirSync(join(project, "node_modules", "typed"), { recursive: true });
    writeFileSync(join(project, "node_modules", "typed", "package.json"), JSON.stringify({ name: "typed", version: "1.0.0", types: "index.d.ts" }));
    writeFileSync(join(project, "node_modules", "typed", "index.d.ts"), "export declare const x: 1;\n");

    const run = (query: string) =>
      spawnSync(process.execPath, [join(scratch, "dist", "nest-doc.mjs"), query], { encoding: "utf8", cwd: project, env: isolatedEnv({ XDG_CACHE_HOME: join(scratch, "cache") }) });

    assert.equal(run("interceptors").status, 0, "a guide lookup must not need typescript");
    const symbol = run("typed");
    assert.equal(symbol.status, 4);
    assert.match(symbol.stderr, /symbol lookups need typescript 6\.0\.3, which failed to load .*Reinstall getnestdoc\./);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
