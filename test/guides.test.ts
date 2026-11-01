import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { transformMarkdown } from "../src/nest/update/guides-transform.ts";
import type { CodeToken, GuideToken } from "../scripts/lib/guides-types.ts";

const FIXTURES_ROOT = fileURLToPath(new URL("./fixtures/docs-snapshot/content", import.meta.url));
const EXPECTED_GUIDE_COUNT = 143;

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walkMarkdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out.sort();
}

function isCodeToken(token: GuideToken): token is CodeToken {
  return token.type === "code" && "ts" in token;
}

const files = walkMarkdownFiles(FIXTURES_ROOT);

type Transformed = { file: string; raw: string; tokens: GuideToken[] };
let guides: Transformed[] = [];

before(() => {
  guides = files.map((filePath) => {
    const file = relative(FIXTURES_ROOT, filePath);
    const raw = readFileSync(filePath, "utf8");
    const { tokens } = transformMarkdown(marked, raw, file);
    return { file, raw, tokens };
  });
});

test("fixture snapshot has exactly 143 guides", () => {
  assert.equal(
    files.length,
    EXPECTED_GUIDE_COUNT,
    `expected ${EXPECTED_GUIDE_COUNT} guide files, found ${files.length} (delta ${files.length - EXPECTED_GUIDE_COUNT}) — ` +
      "upstream docs.nestjs.com may have restructured; this needs review, not a silent count bump",
  );
});

test("no token anywhere contains the literal @@filename, @@switch, or <app-banner", () => {
  for (const guide of guides) {
    const serialized = JSON.stringify(guide.tokens);
    for (const marker of ["@@filename", "@@switch", "<app-banner"]) {
      assert.ok(!serialized.includes(marker), `${guide.file}: found literal "${marker}" in output tokens`);
    }
  }
});

test("every CodeToken.ts is a non-empty string", () => {
  for (const guide of guides) {
    for (const token of guide.tokens) {
      if (!isCodeToken(token)) continue;
      assert.equal(typeof token.ts, "string", `${guide.file}: CodeToken.ts is not a string`);
      assert.ok(token.ts.length > 0, `${guide.file}: CodeToken.ts is empty`);
    }
  }
});

test("@@switch count in the source equals the number of code tokens with a js variant", () => {
  let sourceSwitchCount = 0;
  let jsVariantCount = 0;

  for (const guide of guides) {
    sourceSwitchCount += (guide.raw.match(/@@switch/g) ?? []).length;
    for (const token of guide.tokens) {
      if (isCodeToken(token) && token.js !== undefined) jsVariantCount++;
    }
  }

  assert.equal(jsVariantCount, sourceSwitchCount);
});

test("every table token has one row length per row, matching its header when present", () => {
  for (const guide of guides) {
    for (const token of guide.tokens) {
      if (token.type !== "table") continue;
      for (const row of token.rows) {
        if (token.header.length > 0) {
          assert.equal(row.length, token.header.length, `${guide.file}: table row/header column mismatch`);
        }
      }
    }
  }
});

test("every `nest-doc slug#anchor` hint printed by the shipped corpus resolves to a guide, almost all to a section", async () => {
  const { findGuideSection, loadGuides } = await import("../src/nest/guides/index.ts");
  const { loadAliases } = await import("../src/nest/aliases.ts");
  const dataDir = fileURLToPath(new URL("../data", import.meta.url));
  const shipped = loadGuides(dataDir);
  const aliases = loadAliases(dataDir);

  const hints: string[] = [];
  JSON.stringify(shipped.guides, (_key, value: { type?: string; slug?: string; anchor?: string }) => {
    if (value && value.type === "internalLink" && value.anchor) hints.push(`${value.slug}#${value.anchor}`);
    return value;
  });
  assert.ok(hints.length > 100, `expected the corpus's anchor hints, found ${hints.length}`);

  const missing = hints.filter((hint) => {
    const lookup = findGuideSection(hint, shipped, aliases);
    assert.ok(lookup, `nest-doc ${hint} does not resolve to any guide`);
    return lookup!.missingAnchor !== undefined;
  });
  // Measured against the shipped corpus: 121 hints, 115 resolve to a section (exactly or ignoring punctuation). The
  // remaining 6 link to headings that don't exist in this docs revision — they print the whole guide with a note.
  // A change here means either upstream fixed/broke links or the anchor rule drifted from the site's.
  assert.equal(hints.length, 121);
  assert.deepEqual(missing, [
    "migration#nodejs-requirements",
    "recipes/crud-generator#crud-generator",
    "devtools/overview#investigating-the-cannot-resolve-dependency-error",
    "techniques/configuration#service",
    "techniques/caching#different-stores",
    "techniques/caching#customize-caching",
  ]);
});
