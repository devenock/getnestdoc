// The token shapes (Heading, CodeToken, TableToken, ImageToken,
// InternalLinkToken, GuideToken) are defined once, canonically, in
// src/core/render/types.ts — the renderer that actually consumes them — and
// re-exported here so scripts/build-guides.ts produces data conforming to
// exactly the same contract. Guide/GuidesFile are build-output-specific and
// stay here.
export type { CodeToken, GuideToken, Heading, ImageToken, InternalLinkToken, TableToken } from "../../src/core/render/types.ts";
import type { GuideToken, Heading } from "../../src/core/render/types.ts";

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
