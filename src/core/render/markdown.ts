import type { Tokens } from "marked";
import { bold, dim, cyan, headingColor, italic, strikethrough, underline, visibleLength, wrapText, type RenderOptions } from "./ansi.ts";
import { renderCodeLines } from "./code.ts";
import { renderTable } from "./table.ts";
import type { CodeToken, GuideToken, ImageToken, InternalLinkToken, TableToken } from "./types.ts";

// `js: true` renders CodeToken.js when present (falls back to .ts otherwise) —
// the --js flag Phase 4 wires up. Everything else here is exactly RenderOptions.
export type MarkdownRenderOptions = RenderOptions & { js?: boolean };

const CODE_INDENT = 4;
const LIST_INDENT = 2;
const QUOTE_PREFIX = "│ "; // "│ "

function isCodeToken(token: GuideToken): token is CodeToken {
  return token.type === "code" && "ts" in token;
}

function isImageToken(token: GuideToken): token is ImageToken {
  return token.type === "image" && "src" in token && !("href" in token);
}

function isInternalLinkToken(token: GuideToken): token is InternalLinkToken {
  return token.type === "internalLink";
}

// marked declares nested inline arrays as `Token[]` (its own wide type,
// which includes an unused Tokens.Generic escape hatch for custom tokenizer
// extensions we never register). Real data never contains Generic, so this
// cast is the same one guides-transform.ts makes at the lexer boundary in
// Phase 1 — it keeps every function below working with one clean union
// instead of fighting Generic's non-literal `type` field at every level.
function asGuideTokens(tokens: unknown): GuideToken[] {
  return (tokens ?? []) as GuideToken[];
}

// ---------------------------------------------------------------------------
// Inline rendering — strong/em/del/codespan/link/internalLink/text, walked
// within a heading, paragraph, or list item to produce one styled string
// (not yet wrapped; the caller wraps once it has the full inline text).
// ---------------------------------------------------------------------------

function renderInline(tokens: unknown, options: MarkdownRenderOptions): string {
  let out = "";
  for (const token of asGuideTokens(tokens)) out += renderInlineToken(token, options);
  return out;
}

function renderInlineToken(token: GuideToken, options: MarkdownRenderOptions): string {
  if (isInternalLinkToken(token)) {
    const target = `nest-doc ${token.slug}${token.anchor ? `#${token.anchor}` : ""}`;
    return `${underline(token.text, options)} ${dim(`(${target})`, options)}`;
  }
  if (isImageToken(token)) {
    const label = token.alt ? `[image: ${token.alt}]` : "[image]";
    return `${dim(label, options)} ${dim(token.src, options)}`;
  }

  switch (token.type) {
    case "text":
    case "escape":
      return token.text;
    case "codespan":
      return cyan(token.text, options);
    case "strong":
      return bold(renderInline(token.tokens, options), options);
    case "em":
      return italic(renderInline(token.tokens, options), options);
    case "del":
      return strikethrough(renderInline(token.tokens, options), options);
    case "link": {
      const text = renderInline(token.tokens, options) || token.text;
      return `${underline(text, options)} ${dim(`(${token.href})`, options)}`;
    }
    case "br":
      return " ";
    case "html": {
      if (/^<br\s*\/?>/i.test(token.text)) return " ";
      const imgMatch = /^<img\b[^>]*>/i.exec(token.text);
      if (imgMatch) {
        const alt = /alt="([^"]*)"/.exec(imgMatch[0])?.[1];
        return dim(alt ? `[image: ${alt}]` : "[image]", options);
      }
      return "";
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Raw HTML pass-through blocks (guides-transform.ts leaves whatever isn't a
// <table>/<figure> as-is — file-tree <div> diagrams, stray <a>/<sup> tags,
// <blockquote class="external">, marketing page layouts). Strip tags, keep
// rough line structure, render as dim wrapped text — lossy, but safe and
// simple for what is fundamentally decorative leftover markup.
// ---------------------------------------------------------------------------

function stripHtmlToLines(html: string): string[] {
  const withBreaks = html.replace(/<\/(div|p|li|h[1-6]|tr|blockquote)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const text = withBreaks.replace(/<[^>]+>/g, "");
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Block rendering.
// ---------------------------------------------------------------------------

function renderCodeBlock(token: CodeToken, options: MarkdownRenderOptions): string {
  const content = options.js && token.js !== undefined ? token.js : token.ts;
  const indent = " ".repeat(CODE_INDENT);
  const codeWidth = Math.max(1, options.width - CODE_INDENT);
  const lines = renderCodeLines(content, { ...options, width: codeWidth });

  const out: string[] = [];
  if (token.filename) out.push(indent + dim(token.filename, options));
  for (const line of lines) out.push(indent + line);
  return out.join("\n");
}

function listItemInline(child: Tokens.Text | Tokens.Paragraph, options: MarkdownRenderOptions): string {
  const rendered = renderInline(child.tokens, options);
  return rendered || child.text;
}

function renderList(token: Tokens.List, options: MarkdownRenderOptions, depth: number): string {
  const indent = " ".repeat(depth * LIST_INDENT);
  const lines: string[] = [];
  const start = token.start === "" ? 1 : token.start;

  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${start + index}. ` : "• "; // "• "
    const markerWidth = visibleLength(marker);
    const hangingIndent = indent + " ".repeat(markerWidth);

    const inlineParts: string[] = [];
    const nestedLists: string[] = [];

    for (const child of asGuideTokens(item.tokens)) {
      if (child.type === "list") {
        nestedLists.push(renderList(child, options, depth + 1));
      } else if (child.type === "text" || child.type === "paragraph") {
        inlineParts.push(listItemInline(child, options));
      }
    }

    const wrapWidth = Math.max(1, options.width - indent.length - markerWidth);
    const wrapped = wrapText(inlineParts.join(" "), wrapWidth);
    wrapped.forEach((line, i) => {
      lines.push((i === 0 ? indent + marker : hangingIndent) + line);
    });

    for (const nested of nestedLists) lines.push(nested);
  });

  return lines.join("\n");
}

function renderBlockquote(token: Tokens.Blockquote, options: MarkdownRenderOptions): string {
  const innerWidth = Math.max(1, options.width - visibleLength(QUOTE_PREFIX));
  const inner = renderTokens(token.tokens, { ...options, width: innerWidth });
  return inner
    .split("\n")
    .map((line) => dim(QUOTE_PREFIX, options) + line)
    .join("\n");
}

function renderBlock(token: GuideToken, options: MarkdownRenderOptions): string | null {
  if (isCodeToken(token)) return renderCodeBlock(token, options);
  if (isImageToken(token) || isInternalLinkToken(token)) {
    return wrapText(renderInlineToken(token, options), options.width).join("\n");
  }

  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const text = renderInline(token.tokens, options);
      return wrapText(headingColor(token.depth, text, options), options.width).join("\n");
    }
    case "paragraph": {
      const text = renderInline(token.tokens, options);
      return wrapText(text, options.width).join("\n");
    }
    case "list":
      return renderList(token, options, 0);
    case "table":
      // Real data always carries our TableToken shape here (guides-transform.ts
      // replaces every "table" token, HTML- or GFM-sourced, before this ever
      // runs) — marked's own native Tokens.Table never reaches the renderer.
      return renderTable(token as TableToken, options).join("\n");
    case "blockquote":
      return renderBlockquote(token, options);
    case "hr":
      return dim("-".repeat(options.width), options);
    case "html": {
      const lines = stripHtmlToLines(token.text);
      if (lines.length === 0) return null;
      return lines.map((line) => wrapText(dim(line, options), options.width).join("\n")).join("\n");
    }
    default:
      return null;
  }
}

// Top-level entry point: a guide's (or a symbol's) full token array to a
// ready-to-print ANSI string. Pure — no filesystem, no process.stdout/env
// access (that's resolveRenderOptions in ansi.ts, called by the CLI layer).
export function renderTokens(tokens: unknown, options: MarkdownRenderOptions): string {
  const blocks: string[] = [];
  for (const token of asGuideTokens(tokens)) {
    const rendered = renderBlock(token, options);
    if (rendered !== null) blocks.push(rendered);
  }
  return blocks.join("\n\n");
}
