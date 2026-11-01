import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { getDataHome } from "../core/cache/paths.ts";
import { loadTypeScript } from "../core/extract/typescript-loader.ts";
import type { Guide, GuidesFile } from "./guides/types.ts";
import type { AliasFile } from "./aliases.ts";
import { fetchAndExtractRepo, fetchSourceCommit } from "./update/fetch-docs-repo.ts";
import { transformMarkdown } from "./update/guides-transform.ts";
import { buildUrlToSlug } from "./update/aliases-transform.ts";
import { rewriteInternalLinks } from "./update/rewrite-links.ts";
import { loadMarked } from "./update/marked-loader.ts";

export type UpdateResult = {
  guideCount: number;
  aliasCount: number;
  sourceCommit: string;
  dataDir: string;
};

// Where `nest-doc update` writes, and where guide lookups look first (ADR-0013): a per-user directory scoped to this
// tool version. Never the package's own install directory — that's root-owned for a system-wide global install
// (EACCES, verified), and every reinstall or upgrade overwrites it anyway.
export function userGuideDataDir(toolVersion: string): string {
  return join(getDataHome(), toolVersion);
}

// The directory guides.json/aliases.json load from: the user's updated corpus for this tool version when both files
// exist, else the release's own. Version-scoping means an upgrade's newer bundled corpus is never shadowed by a stale
// update made under an older version. Two existsSync calls — negligible on the hot path.
export function activeGuideDataDir(packagedDataDir: string, toolVersion: string): string {
  const userDir = userGuideDataDir(toolVersion);
  return existsSync(join(userDir, "guides.json")) && existsSync(join(userDir, "aliases.json")) ? userDir : packagedDataDir;
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

// Writes via temp-file-then-rename; not atomic across the pair of files, but each individually is never observed half-written.
function writeAtomic(path: string, contents: string): void {
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, contents);
  renameSync(tempPath, path);
}

// `nest-doc update` is the only networked command, reusing the same fetch/transform pipeline the build scripts run at release time; `ts`/`marked` load through their lazy loaders so other commands never pay to load them.
// Writes into userGuideDataDir(toolVersion), then removes corpora left behind by other tool versions.
export async function runUpdate(toolVersion: string): Promise<UpdateResult> {
  const dataDir = userGuideDataDir(toolVersion);
  const [ts, marked] = await Promise.all([loadTypeScript(), loadMarked()]);
  const tmpDir = mkdtempSync(join(tmpdir(), "getnestdoc-update-"));

  try {
    const sourceCommit = await fetchSourceCommit();
    const repoRoot = await fetchAndExtractRepo(tmpDir);

    const contentDir = join(repoRoot, "content");
    const files = walkMarkdownFiles(contentDir);
    if (files.length === 0) {
      throw new Error(`No markdown files found under ${contentDir} — upstream repo layout may have changed. Not overwriting existing data.`);
    }

    const guides: Record<string, Guide> = {};
    for (const filePath of files) {
      const file = relative(contentDir, filePath);
      const slug = file.replace(/\.md$/, "");
      const raw = readFileSync(filePath, "utf8");
      const { title, headings, tokens } = transformMarkdown(marked, raw, file);
      guides[slug] = { slug, title, file, headings, tokens };
    }

    const guideSlugs = new Set(Object.keys(guides));
    const appRoutesPath = join(repoRoot, "src", "app", "app.routes.ts");
    const pagesRoot = join(repoRoot, "src", "app", "homepage", "pages");
    const urlToSlug = Object.fromEntries(buildUrlToSlug(ts, appRoutesPath, pagesRoot, guideSlugs));

    for (const guide of Object.values(guides)) {
      guide.tokens = rewriteInternalLinks(guide.tokens, urlToSlug, guideSlugs) as typeof guide.tokens;
    }

    const generatedAt = new Date().toISOString();
    const guidesFile: GuidesFile = { version: 1, generatedAt, sourceCommit, guides };
    const aliasFile: AliasFile = { version: 1, generatedAt, sourceCommit, urlToSlug };

    mkdirSync(dataDir, { recursive: true });
    writeAtomic(join(dataDir, "guides.json"), JSON.stringify(guidesFile));
    writeAtomic(join(dataDir, "aliases.json"), JSON.stringify(aliasFile));

    for (const entry of readdirSync(getDataHome())) {
      if (entry !== toolVersion) rmSync(join(getDataHome(), entry), { recursive: true, force: true });
    }

    return { guideCount: files.length, aliasCount: Object.keys(urlToSlug).length, sourceCommit, dataDir };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
