import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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
};

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walkMarkdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out.sort();
}

// Same temp-file-then-rename discipline as core/cache/store.ts, applied to
// both output files — not perfectly atomic across the pair (two renames
// can't be one syscall), but each file individually is never observed
// half-written, and the window between the two renames is microseconds.
function writeAtomic(path: string, contents: string): void {
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, contents);
  renameSync(tempPath, path);
}

// SPEC.md §5: `nest-doc update` is the only networked command — everything
// else in this codebase reads from data/*.json, shipped in the package.
// Reuses the exact same fetch/transform pipeline scripts/build-guides.ts and
// scripts/build-aliases.ts run at release time (src/nest/update/*), because
// it *is* the same job — refresh the two generated files — just triggered by
// a user at runtime instead of CI on a schedule. `ts` and `marked` are both
// loaded through their lazy loaders (core/extract/typescript-loader.ts,
// update/marked-loader.ts): this whole module is only ever reached by
// actually running the `update` subcommand, but per the verified ESM
// hoisting behaviour, a *static* import here would still eagerly load both
// on every CLI invocation regardless — the dynamic imports below are load-
// bearing, not decorative.
export async function runUpdate(dataDir: string): Promise<UpdateResult> {
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

    return { guideCount: files.length, aliasCount: Object.keys(urlToSlug).length, sourceCommit };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
