import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { transformMarkdown } from "../scripts/lib/guides-transform.ts";
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
    const { tokens } = transformMarkdown(raw, file);
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
