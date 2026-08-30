import type { MarkedToken } from "marked";

// The generic token contract SPEC.md §1 defines — what core/render/ actually
// consumes. Guide/GuidesFile (the file-level wrapper: slug, title,
// sourceCommit, etc.) are Nest-specific concerns and live in nest/guides/
// instead; core/ must not import from nest/ (ARCHITECTURE.md §3), so the
// token shapes the renderer needs have to be defined on this side of that
// boundary. scripts/lib/guides-types.ts (build-time) imports these back so
// there's one definition, not two that can drift.
//
// `marked` is only a devDependency (SPEC.md §6) — this is a type-only import,
// erased at bundle time, so it doesn't pull marked into the runtime bundle.
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
