// Produces data/guides.json. Build-time only — never at install time or runtime.
import { marked } from "marked";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fetchAndExtractRepo, fetchSourceCommit } from "../src/nest/update/fetch-docs-repo.ts";
import { transformMarkdown } from "../src/nest/update/guides-transform.ts";
import type { CodeToken, Guide, GuidesFile } from "./lib/guides-types.ts";

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

function isCodeToken(token: Guide["tokens"][number]): token is CodeToken {
  return token.type === "code" && "ts" in token;
}

async function main(): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-guides-"));

  try {
    console.log("Fetching source commit sha for nestjs/docs.nestjs.com#master...");
    const sourceCommit = await fetchSourceCommit();

    console.log("Fetching and extracting docs tarball...");
    const repoRoot = await fetchAndExtractRepo(tmpDir);

    const contentDir = join(repoRoot, "content");
    const files = walkMarkdownFiles(contentDir);

    console.log(`Found ${files.length} markdown files under content/.`);
    if (files.length !== EXPECTED_GUIDE_COUNT) {
      const delta = files.length - EXPECTED_GUIDE_COUNT;
      console.error(
        `Expected exactly ${EXPECTED_GUIDE_COUNT} guides, found ${files.length} (${delta > 0 ? "+" : ""}${delta}). ` +
          "Upstream docs.nestjs.com has restructured — review the transform before bumping this number, do not silently pass.",
      );
      process.exit(1);
    }

    const guides: Record<string, Guide> = {};
    for (const filePath of files) {
      const file = relative(contentDir, filePath);
      const slug = file.replace(/\.md$/, "");
      const raw = readFileSync(filePath, "utf8");
      const { title, headings, tokens } = transformMarkdown(marked, raw, file);
      guides[slug] = { slug, title, file, headings, tokens };
    }

    const guidesFile: GuidesFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceCommit,
      guides,
    };

    const serialized = JSON.stringify(guidesFile);
    mkdirSync("data", { recursive: true });
    writeFileSync("data/guides.json", serialized);

    const allTokens = Object.values(guides).flatMap((g) => g.tokens);
    const jsVariantCount = allTokens.filter((t) => isCodeToken(t) && t.js !== undefined).length;
    const sizeKb = (Buffer.byteLength(serialized) / 1024).toFixed(0);

    console.log(
      `Wrote data/guides.json: ${Object.keys(guides).length} guides, ${sizeKb} KB, ` +
        `${jsVariantCount} code tokens with a js variant, source commit ${sourceCommit}.`,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
