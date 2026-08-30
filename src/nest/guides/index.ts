import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AliasFile } from "../aliases.ts";
import type { Guide, GuidesFile } from "./types.ts";

export function loadGuides(dataDir: string): GuidesFile {
  const raw = readFileSync(join(dataDir, "guides.json"), "utf8");
  return JSON.parse(raw) as GuidesFile;
}

// build-aliases.ts derives every key from a real route's own `path:` string
// (ARCHITECTURE.md §6.2) — reliable, but only as complete as the docs site's
// own routing. Verified: the site links to "/modules" but never "/module",
// so the singular form Nest's own decorator is named after (@Module()) has
// no route to derive from. This is the one confirmed gap (PROMPTS.md Phase
// 8's own worked example — "nest-doc Module" must resolve to the guide by
// default) — a small hand-curated supplement, same category of fix as
// package-scope.ts's OFFICIAL_SCOPE_NAMES table, not a general singular/
// plural heuristic.
const CONCEPT_ALIASES: Record<string, string> = {
  module: "modules",
};

// Resolution steps 1-2 of SPEC.md §5: exact guide slug, then the alias table
// ("concept" lookups — "providers" — and doc-URL-shaped lookups —
// "fundamentals/injection-scopes" — are the same table, see ARCHITECTURE.md
// §6.2). Steps 3-5 (package/symbol resolution) don't exist until Phase 5+.
// Case-folded as a fallback only (guide slugs and alias keys are already
// all-lowercase — verified — so this never shadows a real distinct entry):
// symbol names are legitimately case-sensitive ("Injectable" != "injectable")
// and that comparison happens later, in bare-symbol resolution, unaffected
// by this.
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

// Phase 8's "See also" block: a SymbolRecord.see[].url is a full docs URL
// (e.g. "https://docs.nestjs.com/fundamentals/custom-providers"), verified
// against the real @nestjs/common@12.0.1 corpus (STATUS.md, Phase 2's 47/47
// finding). Resolving it into a runnable command reuses findGuide's exact +
// alias lookup unchanged — deliberately returns the *path*, not the resolved
// slug, so the emitted command matches SPEC.md §4.1's worked example exactly
// ("nest-doc fundamentals/custom-providers", not the alias's own target) and
// stays runnable either way, since findGuide resolves both.
export function resolveSeeUrl(url: string, guidesFile: GuidesFile, aliasFile: AliasFile): string | undefined {
  if (!url.startsWith(DOCS_ORIGIN)) return undefined;

  const path = url.slice(DOCS_ORIGIN.length).split("#")[0]!.replace(/\/$/, "");
  if (path.length === 0) return undefined;

  return findGuide(path, guidesFile, aliasFile) ? path : undefined;
}
