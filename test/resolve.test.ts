import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { describeUnusablePackage, resolveEntryTypes } from "../src/core/resolve/entry-types.ts";

const FIXTURES_ROOT = fileURLToPath(new URL("./fixtures", import.meta.url));

// Fixtures are real packages via `npm pack` + extract (TESTING.md §Fixtures,
// FIXTURES.md records exact versions and which case each takes).
test("Nest 12 (@nestjs/common@12.0.1): exports map, no types condition -> case 3", () => {
  const found = findPackageDir("@nestjs/common", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/@nestjs/common/index.d.ts"),
    resolutionCase: 3,
  });
});

test("Nest 11 (@nestjs/common@11.2.3): no exports map, no main -> case 3 via implicit default", () => {
  const found = findPackageDir("@nestjs/common-11", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/@nestjs/common-11/index.d.ts"),
    resolutionCase: 3,
  });
});

test("Nest 10 (@nestjs/common@10.4.22): same shape as 11, same result", () => {
  const found = findPackageDir("@nestjs/common-10", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/@nestjs/common-10/index.d.ts"),
    resolutionCase: 3,
  });
});

test("@nestjs/core@12.0.1: exports[\".\"] is a bare string, not an object with conditions -> case 3", () => {
  const found = findPackageDir("@nestjs/core", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/@nestjs/core/index.d.ts"),
    resolutionCase: 3,
  });
});

test("@nestjs/swagger@12.0.1: has both an explicit types field and a conditional exports map -> case 1 wins", () => {
  const found = findPackageDir("@nestjs/swagger", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/@nestjs/swagger/dist/index.d.ts"),
    resolutionCase: 1,
  });
});

test("legacy explicit types field (picocolors@1.0.1) resolves via case 1", () => {
  const found = findPackageDir("typed-legacy", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, {
    found: true,
    entryFile: join(FIXTURES_ROOT, "node_modules/typed-legacy/picocolors.d.ts"),
    resolutionCase: 1,
  });
});

test("untyped package (is-thirteen@2.0.0): no case resolves, message suggests @types/*", () => {
  const found = findPackageDir("untyped", FIXTURES_ROOT);
  assert.ok(found, "fixture not found");
  const result = resolveEntryTypes(found!);
  assert.deepEqual(result, { found: false });

  // SPEC.md §5: exit code 3, "package found but unusable — ships no types."
  const message = describeUnusablePackage(found!.name);
  assert.match(message, /@types\//);
  assert.match(message, /untyped/);
});

test("scoped @types/* fallback flattens the name (@nestjs/common -> nestjs__common)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "getnestdoc-resolve-"));
  try {
    const pkgDir = join(tmp, "node_modules", "@nestjs", "no-types");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "@nestjs/no-types", version: "1.0.0", main: "./index.js" }));
    writeFileSync(join(pkgDir, "index.js"), "module.exports = {};");

    const typesDir = join(tmp, "node_modules", "@types", "nestjs__no-types");
    mkdirSync(typesDir, { recursive: true });
    writeFileSync(join(typesDir, "index.d.ts"), "export {};");

    const found = findPackageDir("@nestjs/no-types", tmp);
    assert.ok(found, "package not found");
    const result = resolveEntryTypes(found!);
    assert.deepEqual(result, {
      found: true,
      entryFile: join(typesDir, "index.d.ts"),
      resolutionCase: 4,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the upward walk stops at a .git boundary and does not search above it", () => {
  const tmp = mkdtempSync(join(tmpdir(), "getnestdoc-resolve-git-"));
  try {
    const projectDir = join(tmp, "project");
    const deepDir = join(projectDir, "sub", "deep");
    mkdirSync(deepDir, { recursive: true });
    mkdirSync(join(projectDir, ".git"), { recursive: true });

    // A package that exists only ABOVE the .git boundary must not be found.
    const outsideDir = join(tmp, "node_modules", "outside-pkg");
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, "package.json"), JSON.stringify({ name: "outside-pkg", version: "1.0.0" }));

    const notFound = findPackageDir("outside-pkg", deepDir);
    assert.equal(notFound, undefined, "resolver walked past the .git boundary");

    // A package inside the boundary is still found by walking up to it.
    const insideDir = join(projectDir, "node_modules", "inside-pkg");
    mkdirSync(insideDir, { recursive: true });
    writeFileSync(join(insideDir, "package.json"), JSON.stringify({ name: "inside-pkg", version: "1.0.0" }));

    const found = findPackageDir("inside-pkg", deepDir);
    assert.equal(found?.packageDir, insideDir);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("common.X shorthand expands to @nestjs/common via the static scope table", async () => {
  const { expandPackageShorthand } = await import("../src/nest/package-scope.ts");
  assert.equal(expandPackageShorthand("common"), "@nestjs/common");
  assert.equal(expandPackageShorthand("swagger"), "@nestjs/swagger");
  assert.equal(expandPackageShorthand("lodash"), "lodash");
});
