import type { MarkedToken } from "marked";

// Mirrors SPEC.md §1 exactly. This is the build-time half of the contract;
// nothing here is shipped (scripts/ is build-time only, see ARCHITECTURE.md §3).
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

export type Heading = {
  depth: number;
  text: string;
  anchor: string;
  tokenIndex: number;
};

export type CodeToken = {
  type: "code";
  lang: string;
  filename?: string;
  ts: string;
  js?: string;
};

export type TableToken = {
  type: "table";
  header: string[];
  rows: string[][];
  align: ("left" | "right" | "center" | null)[];
};

export type ImageToken = {
  type: "image";
  alt: string;
  src: string;
};

export type InternalLinkToken = {
  type: "internalLink";
  text: string;
  slug: string;
  anchor?: string;
};

// marked token types pass through unchanged except these four, which replace
// them. Phase 1 does not produce InternalLinkToken yet — that's Phase 2, once
// the alias table exists to resolve `](/slug)` links. It's part of the union
// now so Phase 2 doesn't need to touch this file.
export type GuideToken = MarkedToken | CodeToken | TableToken | ImageToken | InternalLinkToken;
