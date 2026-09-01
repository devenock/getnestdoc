import type { GuideToken, Heading } from "../../core/render/types.ts";

// The built guide corpus: every guide keyed by slug, with its tokens and headings.
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
