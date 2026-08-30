import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUrlToSlug } from "../scripts/lib/aliases-transform.ts";
import { transformMarkdown } from "../scripts/lib/guides-transform.ts";
import { rewriteInternalLinks } from "../scripts/lib/rewrite-links.ts";
import type { GuideToken } from "../scripts/lib/guides-types.ts";

const CONTENT_ROOT = fileURLToPath(new URL("./fixtures/docs-snapshot/content", import.meta.url));
const ROUTES_ROOT = fileURLToPath(new URL("./fixtures/docs-snapshot/routes/src/app", import.meta.url));
const APP_ROUTES_PATH = join(ROUTES_ROOT, "app.routes.ts");
const PAGES_ROOT = join(ROUTES_ROOT, "homepage", "pages");

function walkFiles(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walkFiles(path, extension));
    else if (entry.endsWith(extension)) out.push(path);
  }
  return out.sort();
}

function isInternalLinkToken(token: GuideToken): token is Extract<GuideToken, { type: "internalLink" }> {
  return token.type === "internalLink" && "slug" in token;
}

function collectInternalLinks(value: unknown, out: Extract<GuideToken, { type: "internalLink" }>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectInternalLinks(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as GuideToken;
    if (isInternalLinkToken(obj)) out.push(obj);
    for (const v of Object.values(value as Record<string, unknown>)) collectInternalLinks(v, out);
  }
}

let guideSlugs: Set<string>;
let guideTokensBySlug: Map<string, GuideToken[]>;
let urlToSlug: Map<string, string>;

before(() => {
  guideSlugs = new Set();
  guideTokensBySlug = new Map();
  for (const filePath of walkFiles(CONTENT_ROOT, ".md")) {
    const file = relative(CONTENT_ROOT, filePath);
    const slug = file.replace(/\.md$/, "");
    const raw = readFileSync(filePath, "utf8");
    const { tokens } = transformMarkdown(raw, file);
    guideSlugs.add(slug);
    guideTokensBySlug.set(slug, tokens);
  }

  urlToSlug = buildUrlToSlug(APP_ROUTES_PATH, PAGES_ROOT, guideSlugs);
});

test("the four known naive-mapping-defeating entries resolve", () => {
  // Per SPEC.md §2. The fourth was corrected in Phase 2 from a documented
  // identity mapping to the verified real value — see SPEC.md's note there.
  assert.equal(urlToSlug.get("providers"), "components");
  assert.equal(urlToSlug.get("middleware"), "middlewares");
  assert.equal(urlToSlug.get("fundamentals/injection-scopes"), "fundamentals/provider-scopes");
  assert.equal(urlToSlug.get("fundamentals/custom-providers"), "fundamentals/dependency-injection");
});

test("every urlToSlug value is a key in the guide corpus", () => {
  for (const [url, slug] of urlToSlug) {
    assert.ok(guideSlugs.has(slug), `"${url}" -> "${slug}", but "${slug}" is not a real guide`);
  }
});

test("every InternalLinkToken.slug across the corpus resolves to a real guide", () => {
  const urlToSlugRecord = Object.fromEntries(urlToSlug);
  let checked = 0;

  for (const [slug, tokens] of guideTokensBySlug) {
    const rewritten = rewriteInternalLinks(tokens, urlToSlugRecord, guideSlugs) as GuideToken[];
    const links: Extract<GuideToken, { type: "internalLink" }>[] = [];
    collectInternalLinks(rewritten, links);
    for (const link of links) {
      assert.ok(guideSlugs.has(link.slug), `${slug}: internal link resolves to "${link.slug}", which is not a real guide`);
      checked++;
    }
  }

  assert.ok(checked > 0, "expected at least one internal link to be found and checked across the fixture corpus");
});
