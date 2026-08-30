import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { resolveEntryTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { renderSymbol } from "../src/nest/render-symbol.ts";
import { renderPackageIndex } from "../src/nest/render-package-index.ts";
import { findGuide, loadGuides, resolveSeeUrl } from "../src/nest/guides/index.ts";
import { loadAliases } from "../src/nest/aliases.ts";
import { visibleLength } from "../src/core/render/ansi.ts";
import type { SymbolRecord } from "../src/core/extract/types.ts";

const FIXTURES_ROOT = fileURLToPath(new URL("./fixtures", import.meta.url));
const REPO_DATA = fileURLToPath(new URL("../data", import.meta.url));

async function extract(name: string): Promise<{ symbols: SymbolRecord[]; version: string }> {
  const found = findPackageDir(name, FIXTURES_ROOT);
  assert.ok(found, `${name} fixture not found`);
  const entry = resolveEntryTypes(found);
  assert.ok(entry.found, `${name}: no entry resolved`);
  return { symbols: await extractPackage(entry.entryFile), version: found.manifest.version ?? "0.0.0" };
}

const guidesFile = loadGuides(REPO_DATA);
const aliasFile = loadAliases(REPO_DATA);

// Real bug caught here during Phase 8 (not a hypothetical): SymbolRecord.signature
// for classes/interfaces with documented members carried the members' own JSDoc
// verbatim (node.getText() includes a node's *entire* span, not just its own
// leading comment) — BadGatewayException's signature was 1301 chars before the
// fix, ~140 after. No rendered line, at any real width, should ever exceed it —
// this is the same invariant test/render.test.ts already enforces for guides.
test("no rendered line (symbol detail or package index) exceeds the configured width, across common/core/swagger", async () => {
  const { symbols: common, version: commonV } = await extract("@nestjs/common");
  const { symbols: core, version: coreV } = await extract("@nestjs/core");
  const { symbols: swagger, version: swaggerV } = await extract("@nestjs/swagger");

  for (const width of [80, 100, 120]) {
    const options = { width, color: false };

    for (const [packageName, packageVersion, symbols] of [
      ["@nestjs/common", commonV, common],
      ["@nestjs/core", coreV, core],
      ["@nestjs/swagger", swaggerV, swagger],
    ] as const) {
      const indexOutput = renderPackageIndex(packageName, packageVersion, symbols, false, options);
      for (const line of indexOutput.split("\n")) {
        assert.ok(visibleLength(line) <= width, `package index for ${packageName} at width ${width}: line exceeds budget: ${line}`);
      }

      for (const symbol of symbols) {
        const detail = renderSymbol(packageName, packageVersion, symbol, guidesFile, aliasFile, options);
        for (const line of detail.split("\n")) {
          assert.ok(visibleLength(line) <= width, `${packageName}.${symbol.name} at width ${width}: line exceeds budget: ${line}`);
        }
      }
    }
  }
});

test("resolveSeeUrl resolves real docs.nestjs.com URLs through the alias table, ignores external links", () => {
  assert.equal(resolveSeeUrl("https://docs.nestjs.com/providers", guidesFile, aliasFile), "providers");
  assert.equal(resolveSeeUrl("https://docs.nestjs.com/controllers#routing", guidesFile, aliasFile), "controllers");
  assert.equal(resolveSeeUrl("https://docs.nestjs.com/fundamentals/custom-providers", guidesFile, aliasFile), "fundamentals/custom-providers");
  assert.equal(resolveSeeUrl("https://github.com/typestack/class-validator", guidesFile, aliasFile), undefined);
});

test('findGuide resolves "Module" to the modules guide by default (curated singular alias + case fold)', () => {
  const guide = findGuide("Module", guidesFile, aliasFile);
  assert.ok(guide);
  assert.equal(guide.slug, "modules");
});

test("the DECORATORS bucket heuristic sorts real decorators and non-decorators correctly", async () => {
  const { symbols, version } = await extract("@nestjs/common");
  const output = renderPackageIndex("@nestjs/common", version, symbols, true, { width: 100, color: false });

  const decoratorsSection = output.slice(output.indexOf("DECORATORS"), output.indexOf("CLASSES"));
  assert.match(decoratorsSection, /^ {2}Injectable\b/m, "Injectable (function returning ClassDecorator) should be in DECORATORS");
  assert.match(decoratorsSection, /^ {2}SetMetadata\b/m, "SetMetadata (const returning CustomDecorator) should be in DECORATORS");

  const interfacesSection = output.slice(output.indexOf("INTERFACES"));
  assert.match(interfacesSection, /^ {2}CanActivate\b/m, "CanActivate (interface, not a decorator) should be in INTERFACES");
});

test("an undocumented symbol's detail view shows the fallback line, never a blank doc section", async () => {
  const { symbols, version } = await extract("@nestjs/swagger");
  const apiProperty = symbols.find((s) => s.name === "ApiProperty");
  assert.ok(apiProperty);
  assert.equal(apiProperty.doc, "");

  const output = renderSymbol("@nestjs/swagger", version, apiProperty, guidesFile, aliasFile, { width: 100, color: false });
  assert.match(output, /No documentation available/);
});
