import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/@nestjs/common"),
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/@nestjs/common-11"),
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/@nestjs/common-10"),
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/@nestjs/core"),
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/@nestjs/swagger"),
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
    packageRoot: join(FIXTURES_ROOT, "node_modules/typed-legacy"),
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
      packageRoot: typesDir,
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

// Builds node_modules/<name> in a scratch dir from a package.json object plus extra files, and resolves it.
function resolveScratch(manifest: Record<string, unknown>, files: Record<string, string>) {
  const tmp = mkdtempSync(join(tmpdir(), "getnestdoc-resolve-shapes-"));
  const pkgDir = join(tmp, "node_modules", "shape");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "shape", version: "1.0.0", ...manifest }));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(pkgDir, path, ".."), { recursive: true });
    writeFileSync(join(pkgDir, path), contents);
  }
  const found = findPackageDir("shape", tmp);
  assert.ok(found, "scratch package not found");
  return { tmp, pkgDir, result: resolveEntryTypes(found!) };
}

// Nested condition objects are the common modern shape (tsup/unbuild output); this used to throw
// "jsPath.replace is not a function" because a condition's value was assumed to be a string.
test("nested export conditions ({ import: { types, default } }) resolve to the nested types file", () => {
  const { tmp, pkgDir, result } = resolveScratch(
    {
      exports: {
        ".": {
          import: { types: "./dist/index.d.mts", default: "./dist/index.mjs" },
          require: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        },
      },
    },
    { "dist/index.d.mts": "export {};", "dist/index.d.ts": "export {};" },
  );
  try {
    assert.deepEqual(result, { found: true, entryFile: join(pkgDir, "dist/index.d.mts"), packageRoot: pkgDir, resolutionCase: 2 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("nested conditions without a types key fall back to .mjs -> .d.mts sibling inference", () => {
  const { tmp, pkgDir, result } = resolveScratch(
    { exports: { ".": { import: { default: "./dist/index.mjs" } } } },
    { "dist/index.d.mts": "export {};" },
  );
  try {
    assert.deepEqual(result, { found: true, entryFile: join(pkgDir, "dist/index.d.mts"), packageRoot: pkgDir, resolutionCase: 3 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("conditions sugar (an exports object with no \".\" key) is treated as the root export", () => {
  const { tmp, pkgDir, result } = resolveScratch({ exports: { types: "./types.d.ts", default: "./index.js" } }, { "types.d.ts": "export {};" });
  try {
    assert.deepEqual(result, { found: true, entryFile: join(pkgDir, "types.d.ts"), packageRoot: pkgDir, resolutionCase: 2 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a fallback array in the exports map is tried in order", () => {
  const { tmp, pkgDir, result } = resolveScratch({ exports: { ".": ["./missing.js", "./lib/main.cjs"] } }, { "lib/main.d.cts": "export {};" });
  try {
    assert.deepEqual(result, { found: true, entryFile: join(pkgDir, "lib/main.d.cts"), packageRoot: pkgDir, resolutionCase: 3 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a types field naming a directory is not an entry file (would crash readFileSync with EISDIR)", () => {
  const { tmp, pkgDir, result } = resolveScratch({ types: "./typings", main: "./lib" }, { "typings/placeholder.txt": "", "lib/index.d.ts": "export {};" });
  try {
    assert.deepEqual(result, { found: true, entryFile: join(pkgDir, "lib/index.d.ts"), packageRoot: pkgDir, resolutionCase: 3 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// SECURITY REGRESSION (ADR-0009) — `types`/`typings`/`exports`/`main` are third-party strings. A crafted
// `"types": "../../../secret/x.d.ts"` used to make `nest-doc <pkg>` read and render a declaration file outside the
// package, and because the barrel walk's containment root was dirname(entryFile), it bypassed that check too.
test("no package.json field can resolve the entry file outside the package directory", () => {
  const tmp = mkdtempSync(join(tmpdir(), "getnestdoc-resolve-escape-"));
  try {
    mkdirSync(join(tmp, "secret"), { recursive: true });
    writeFileSync(join(tmp, "secret", "x.d.ts"), "export declare const leaked: string;\n");
    writeFileSync(join(tmp, "secret", "x.js"), "");

    const escapes: Record<string, unknown>[] = [
      { types: "../../secret/x.d.ts" },
      { typings: "../../secret/x.d.ts" },
      { exports: { ".": { types: "../../secret/x.d.ts" } } },
      { exports: "../../secret/x.js" },
      { main: "../../secret/x.js" },
    ];
    for (const fields of escapes) {
      const pkgDir = join(tmp, "node_modules", "escaper");
      rmSync(pkgDir, { recursive: true, force: true });
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "escaper", version: "1.0.0", ...fields }));
      const found = findPackageDir("escaper", tmp);
      assert.ok(found);
      assert.deepEqual(resolveEntryTypes(found!), { found: false }, `escaped via ${JSON.stringify(fields)}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a symlink inside the package pointing outside it is not followed as the entry file", () => {
  const tmp = mkdtempSync(join(tmpdir(), "getnestdoc-resolve-symlink-"));
  try {
    mkdirSync(join(tmp, "secret"), { recursive: true });
    writeFileSync(join(tmp, "secret", "x.d.ts"), "export declare const leaked: string;\n");
    const pkgDir = join(tmp, "node_modules", "linker");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "linker", version: "1.0.0", types: "./index.d.ts" }));
    symlinkSync(join(tmp, "secret", "x.d.ts"), join(pkgDir, "index.d.ts"));
    const found = findPackageDir("linker", tmp);
    assert.deepEqual(resolveEntryTypes(found!), { found: false });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("subpath entry points resolve through the exports map: exact key, then the longest * pattern, contained in the package", async () => {
  const { resolveSubpathTypes, listEntryPoints } = await import("../src/core/resolve/entry-types.ts");
  const { tmp, pkgDir } = resolveScratch(
    {
      exports: {
        ".": "./index.js",
        "./multipart": { types: "./multipart/index.d.ts", default: "./multipart/index.js" },
        "./internal": "./internal/index.js",
        "./deep/*": "./lib/*.js",
        "./*": "./*.js",
        "./escape": { types: "../../outside.d.ts" },
        "./package.json": "./package.json",
      },
    },
    { "index.d.ts": "", "multipart/index.d.ts": "", "internal/index.d.ts": "", "lib/thing.d.ts": "", "top.d.ts": "" },
  );
  try {
    writeFileSync(join(tmp, "outside.d.ts"), "");
    const found = findPackageDir("shape", tmp)!;
    const entry = (sub: string) => {
      const r = resolveSubpathTypes(found, sub);
      return r.found ? r.entryFile.slice(pkgDir.length + 1) : undefined;
    };
    assert.equal(entry("multipart"), "multipart/index.d.ts");
    assert.equal(entry("internal"), "internal/index.d.ts");
    assert.equal(entry("deep/thing"), "lib/thing.d.ts", "longest-prefix pattern wins over ./*");
    assert.equal(entry("top"), "top.d.ts");
    assert.equal(entry("nope"), undefined);
    assert.equal(entry("escape"), undefined, "a subpath target outside the package is never an entry");
    assert.deepEqual(listEntryPoints(found.manifest), ["escape", "internal", "multipart"], "explicit keys only — no patterns, no ./package.json");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("without an exports map, a subpath is the legacy deep path beside the package root", async () => {
  const { resolveSubpathTypes } = await import("../src/core/resolve/entry-types.ts");
  const { tmp, pkgDir } = resolveScratch({ main: "./index.js" }, { "index.d.ts": "", "dist/plugin.d.ts": "", "tools/index.d.ts": "" });
  try {
    const found = findPackageDir("shape", tmp)!;
    const r1 = resolveSubpathTypes(found, "dist/plugin");
    const r2 = resolveSubpathTypes(found, "tools");
    assert.ok(r1.found && r1.entryFile === join(pkgDir, "dist/plugin.d.ts"));
    assert.ok(r2.found && r2.entryFile === join(pkgDir, "tools/index.d.ts"));
    assert.equal(resolveSubpathTypes(found, "../../etc").found, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("shorthand expansion and its inverse carry a subpath", async () => {
  const { expandPackageShorthand, shorthandFor } = await import("../src/nest/package-scope.ts");
  assert.equal(expandPackageShorthand("platform-fastify/multipart"), "@nestjs/platform-fastify/multipart");
  assert.equal(expandPackageShorthand("lodash/fp"), "lodash/fp");
  assert.equal(shorthandFor("@nestjs/platform-fastify/multipart"), "platform-fastify/multipart");
  const { splitModuleSpecifier } = await import("../src/core/resolve/specifier.ts");
  assert.deepEqual(splitModuleSpecifier("@nestjs/common/internal"), { packageName: "@nestjs/common", subpath: "internal" });
  assert.deepEqual(splitModuleSpecifier("lodash/fp/map"), { packageName: "lodash", subpath: "fp/map" });
  assert.deepEqual(splitModuleSpecifier("@nestjs/common"), { packageName: "@nestjs/common" });
});
