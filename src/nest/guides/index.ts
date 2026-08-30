import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AliasFile } from "../aliases.ts";
import type { Guide, GuidesFile } from "./types.ts";

export function loadGuides(dataDir: string): GuidesFile {
  const raw = readFileSync(join(dataDir, "guides.json"), "utf8");
  return JSON.parse(raw) as GuidesFile;
}

// The docs site links to "/modules" but never "/module" (the decorator's own name), so the auto-derived alias table has no entry for it — one hand-curated supplement, not a general singular/plural heuristic.
const CONCEPT_ALIASES: Record<string, string> = {
  module: "modules",
};

// Resolution steps 1-2 of SPEC.md §5: exact slug, then the alias table (ARCHITECTURE.md §6.2). Case-folded as a fallback only — guide slugs are already all-lowercase, so this never shadows a real entry, and symbol resolution elsewhere stays case-sensitive.
export function findGuide(query: string, guidesFile: GuidesFile, aliasFile: AliasFile): Guide | undefined {
  const exact = guidesFile.guides[query];
  if (exact) return exact;

  const aliasedSlug = aliasFile.urlToSlug[query] ?? CONCEPT_ALIASES[query];
  if (aliasedSlug) return guidesFile.guides[aliasedSlug];

  const lower = query.toLowerCase();
  if (lower !== query) return findGuide(lower, guidesFile, aliasFile);

  return undefined;
}

const DOCS_ORIGIN = "https://docs.nestjs.com/";

// The "See also" block: resolves a SymbolRecord.see[].url into a runnable command by reusing findGuide unchanged — returns the *path*, not the resolved slug, matching SPEC.md §4.1's worked example (both are runnable, since findGuide resolves either).
export function resolveSeeUrl(url: string, guidesFile: GuidesFile, aliasFile: AliasFile): string | undefined {
  if (!url.startsWith(DOCS_ORIGIN)) return undefined;

  const path = url.slice(DOCS_ORIGIN.length).split("#")[0]!.replace(/\/$/, "");
  if (path.length === 0) return undefined;

  return findGuide(path, guidesFile, aliasFile) ? path : undefined;
}
