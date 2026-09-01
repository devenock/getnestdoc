import type { MarkedToken } from "marked";

// The generic rendering token contract; Nest-specific wrappers like Guide/GuidesFile live on the nest/ side instead.
// Type-only import, erased at bundle time — doesn't pull marked into the runtime bundle.
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

// marked token types pass through unchanged except these four, which replace them.
export type GuideToken = MarkedToken | CodeToken | TableToken | ImageToken | InternalLinkToken;
