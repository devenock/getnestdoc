// Produces data/aliases.json and rewrites data/guides.json's internal links using it. Build-time only, run alongside the guides build.
import ts from "typescript";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchAndExtractRepo, fetchSourceCommit } from "../src/nest/update/fetch-docs-repo.ts";
import { buildUrlToSlug } from "../src/nest/update/aliases-transform.ts";
import type { AliasFile } from "./lib/aliases-types.ts";
import type { GuidesFile } from "./lib/guides-types.ts";
import { rewriteInternalLinks } from "../src/nest/update/rewrite-links.ts";

function countInternalLinks(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum: number, v) => sum + countInternalLinks(v), 0);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const own = obj.type === "internalLink" ? 1 : 0;
    return own + Object.values(obj).reduce((sum: number, v) => sum + countInternalLinks(v), 0);
  }
  return 0;
}

async function main(): Promise<void> {
  const guidesFile = JSON.parse(readFileSync("data/guides.json", "utf8")) as GuidesFile;
  const guideSlugs = new Set(Object.keys(guidesFile.guides));

  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-aliases-"));

  try {
    console.log("Fetching source commit sha for nestjs/docs.nestjs.com#master...");
    const sourceCommit = await fetchSourceCommit();

    console.log("Fetching and extracting docs tarball...");
    const repoRoot = await fetchAndExtractRepo(tmpDir);

    const appRoutesPath = join(repoRoot, "src", "app", "app.routes.ts");
    const pagesRoot = join(repoRoot, "src", "app", "homepage", "pages");

    const urlToSlug = buildUrlToSlug(ts, appRoutesPath, pagesRoot, guideSlugs);

    const aliasFile: AliasFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceCommit,
      urlToSlug: Object.fromEntries(urlToSlug),
    };

    mkdirSync("data", { recursive: true });
    writeFileSync("data/aliases.json", JSON.stringify(aliasFile, null, 2));
    console.log(`Wrote data/aliases.json: ${urlToSlug.size} URL mappings, source commit ${sourceCommit}.`);

    for (const guide of Object.values(guidesFile.guides)) {
      guide.tokens = rewriteInternalLinks(guide.tokens, aliasFile.urlToSlug, guideSlugs) as typeof guide.tokens;
    }
    guidesFile.generatedAt = new Date().toISOString();

    const internalLinkCount = countInternalLinks(Object.values(guidesFile.guides).map((g) => g.tokens));
    writeFileSync("data/guides.json", JSON.stringify(guidesFile));
    console.log(`Rewrote data/guides.json: ${internalLinkCount} internal links resolved.`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
