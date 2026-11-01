import { readFileSync } from "node:fs";
import { join } from "node:path";
import { own } from "../../core/own.ts";
import type { AliasFile } from "../aliases.ts";
import type { GuideToken } from "../../core/render/types.ts";
import type { Guide, GuidesFile } from "./types.ts";

export function loadGuides(dataDir: string): GuidesFile {
  const raw = readFileSync(join(dataDir, "guides.json"), "utf8");
  return JSON.parse(raw) as GuidesFile;
}

// The docs site links to "/modules" but never "/module" (the decorator's own name), so the auto-derived alias table has no entry for it — one hand-curated supplement, not a general singular/plural heuristic.
const CONCEPT_ALIASES: Record<string, string> = {
  module: "modules",
};

// Resolves a guide by exact slug, then the alias table, then a case-folded retry as a last resort.
export function findGuide(query: string, guidesFile: GuidesFile, aliasFile: AliasFile): Guide | undefined {
  const exact = own(guidesFile.guides, query);
  if (exact) return exact;

  const aliasedSlug = own(aliasFile.urlToSlug, query) ?? own(CONCEPT_ALIASES, query);
  if (aliasedSlug) return own(guidesFile.guides, aliasedSlug);

  const lower = query.toLowerCase();
  if (lower !== query) return findGuide(lower, guidesFile, aliasFile);

  return undefined;
}

// Compares anchors ignoring punctuation: stored anchors follow the docs site's implicit ids, which keep it ("factory-providers:-usefactory"), while links in the corpus often drop it.
function looseAnchor(anchor: string): string {
  return anchor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type GuideLookup = {
  guide: Guide;
  tokens: GuideToken[];
  // Set when the query named an anchor no heading in the guide matches; `tokens` is then the whole guide.
  missingAnchor?: string;
};

// Resolves "slug" or "slug#anchor"; a matched anchor narrows to that heading's section, up to the next heading of the same or shallower depth.
export function findGuideSection(query: string, guidesFile: GuidesFile, aliasFile: AliasFile): GuideLookup | undefined {
  const hashIndex = query.indexOf("#");
  const guide = findGuide(hashIndex === -1 ? query : query.slice(0, hashIndex), guidesFile, aliasFile);
  if (!guide) return undefined;

  const anchor = hashIndex === -1 ? "" : query.slice(hashIndex + 1);
  if (anchor.length === 0) return { guide, tokens: guide.tokens };

  const heading =
    guide.headings.find((h) => h.anchor === anchor.toLowerCase()) ?? guide.headings.find((h) => looseAnchor(h.anchor) === looseAnchor(anchor));
  if (!heading) return { guide, tokens: guide.tokens, missingAnchor: anchor };

  const next = guide.headings.find((h) => h.tokenIndex > heading.tokenIndex && h.depth <= heading.depth);
  return { guide, tokens: guide.tokens.slice(heading.tokenIndex, next?.tokenIndex) };
}

const DOCS_ORIGIN = "https://docs.nestjs.com/";

// Resolves a SymbolRecord.see[].url into a runnable nest-doc path, for the "See also" block.
export function resolveSeeUrl(url: string, guidesFile: GuidesFile, aliasFile: AliasFile): string | undefined {
  if (!url.startsWith(DOCS_ORIGIN)) return undefined;

  const path = url.slice(DOCS_ORIGIN.length).split("#")[0]!.replace(/\/$/, "");
  if (path.length === 0) return undefined;

  return findGuide(path, guidesFile, aliasFile) ? path : undefined;
}
