import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AliasFile } from "../aliases.ts";
import type { Guide, GuidesFile } from "./types.ts";

export function loadGuides(dataDir: string): GuidesFile {
  const raw = readFileSync(join(dataDir, "guides.json"), "utf8");
  return JSON.parse(raw) as GuidesFile;
}

// Resolution steps 1-2 of SPEC.md §5: exact guide slug, then the alias table
// ("concept" lookups — "providers" — and doc-URL-shaped lookups —
// "fundamentals/injection-scopes" — are the same table, see ARCHITECTURE.md
// §6.2). Steps 3-5 (package/symbol resolution) don't exist until Phase 5+.
export function findGuide(query: string, guidesFile: GuidesFile, aliasFile: AliasFile): Guide | undefined {
  const exact = guidesFile.guides[query];
  if (exact) return exact;

  const aliasedSlug = aliasFile.urlToSlug[query];
  if (aliasedSlug) return guidesFile.guides[aliasedSlug];

  return undefined;
}
