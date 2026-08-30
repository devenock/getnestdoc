import type { GuideToken, Heading } from "../../core/render/types.ts";

// Mirrors SPEC.md §1. Guide/GuidesFile are the file-level wrapper around the
// generic token contract (core/render/types.ts) — Nest-specific (they know
// about slugs, source commits, the guides.json shape), so they live on the
// nest/ side of the core/nest boundary, unlike the tokens themselves.
// scripts/lib/guides-types.ts imports these back so build and runtime share
// one definition.
export type GuidesFile = {
  version: 1;
  generatedAt: string;
  sourceCommit: string;
  guides: Record<string, Guide>;
};

export type Guide = {
  slug: string;
  title: string;
  file: string;
  headings: Heading[];
  tokens: GuideToken[];
};
