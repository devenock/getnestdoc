import type { GuideToken, Heading } from "../../core/render/types.ts";

// Mirrors SPEC.md §1. The Nest-specific file-level wrapper around the generic token contract (core/render/types.ts) — lives on the nest/ side of the core/nest boundary.
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
