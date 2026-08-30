// Produces data/guides.json. Build-time only, run on a schedule and before each
// release (ARCHITECTURE.md §6.1) — never at install time, never at runtime.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { transformMarkdown } from "./lib/guides-transform.ts";
import type { CodeToken, Guide, GuidesFile } from "./lib/guides-types.ts";

const REPO = "nestjs/docs.nestjs.com";
const BRANCH = "master";
const EXPECTED_GUIDE_COUNT = 143;

async function fetchSourceCommit(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API request for commit sha failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function fetchAndExtractRepo(destDir: string): Promise<string> {
  const res = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${BRANCH}`);
  if (!res.ok) {
    throw new Error(`Tarball fetch failed: ${res.status} ${res.statusText}`);
  }

  const tarPath = join(destDir, "docs.tar.gz");
  writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));

  const result = spawnSync("tar", ["xzf", tarPath, "-C", destDir]);
  if (result.error) {
    throw new Error(`Failed to run tar: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar exited ${result.status}: ${result.stderr.toString()}`);
  }

  const root = readdirSync(destDir).find(
    (entry) => entry.startsWith("docs.nestjs.com-") && statSync(join(destDir, entry)).isDirectory(),
  );
  if (!root) {
    throw new Error(`Could not find extracted repo root under ${destDir}`);
  }
  return join(destDir, root);
}

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
    console.log(`Fetching source commit sha for ${REPO}#${BRANCH}...`);
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
      const { title, headings, tokens } = transformMarkdown(raw, file);
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
