import type { marked as MarkedSingleton, MarkedToken, Token, Tokens } from "marked";
import type { CodeToken, GuideToken, Heading, ImageToken, TableToken } from "../../core/render/types.ts";
import type { Guide } from "../guides/types.ts";

// ---------------------------------------------------------------------------
// Raw-text normalisation, before marked ever sees the markdown.
// ---------------------------------------------------------------------------

// Strip by prefix match, not by enumerating the five known variants (ARCHITECTURE.md §6.3).
// Verified: always a complete, single-line, self-closing `<tag></tag>` pair, and never
// found inside a code fence, so a global string-level strip is safe.
function stripAppBanners(markdown: string): string {
  return markdown.replace(/<app-banner-[\w-]*>\s*<\/app-banner-[\w-]*>/g, "");
}

// The docs site is an Angular app; authors escape literal braces for its `{{ }}`
// interpolation syntax. Not documented anywhere, found by grepping the real corpus
// (80 occurrences across 25 files, e.g. `@Body({{ '{' }} schema {{ '}' }})`).
// A stray HTML-entity form (`&#123;` / `&#125;`) also appears a handful of times.
function decodeBraceEscapes(markdown: string): string {
  return markdown
    .replace(/\{\{\s*'\{'\s*\}\}/g, "{")
    .replace(/\{\{\s*'\}'\s*\}\}/g, "}")
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}");
}

function normalizeSource(markdown: string): string {
  return decodeBraceEscapes(stripAppBanners(markdown));
}

// ---------------------------------------------------------------------------
// <table> and <figure><img> extraction.
//
// These must be pulled out of the RAW markdown text before lexing, not found by
// walking marked's token tree afterward. Verified against the real corpus:
// marked's HTML-block tokenizer stops at the first blank line, so a single
// `<table>` with a blank line between two of its own `<tr>` rows
// (content/techniques/validation.md) gets split across two sibling tokens, and
// conversely two adjacent `<table>` blocks with no blank line between them
// (content/microservices/basics.md, table/<p>/table with zero blank lines)
// get merged into one token. Placeholder substitution on the raw string sidesteps
// both failure modes: marked never sees real table/figure HTML at all.
// ---------------------------------------------------------------------------

type ExtractedBlock = { kind: "table"; token: TableToken } | { kind: "image"; token: ImageToken };

function stripCellTags(html: string): string {
  let s = html.replace(/<code>(.*?)<\/code>/gs, "`$1`");
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gs, "$1");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// <td>/<th> end tags are optional in real HTML (verified: content/microservices/nats.md
// has two rows where the closing </td> is simply missing). A cell ends at the next
// <td>/<th> start tag or the end of the row, not at its own close tag.
function parseHtmlTableRow(rowHtml: string): { tag: "td" | "th"; text: string }[] {
  const cells: { tag: "td" | "th"; text: string }[] = [];
  const tagRe = /<(td|th)\b[^>]*>/gi;
  const starts = [...rowHtml.matchAll(tagRe)];
  for (let i = 0; i < starts.length; i++) {
    const tag = starts[i]![1]!.toLowerCase() as "td" | "th";
    const start = starts[i]!.index + starts[i]![0].length;
    const end = i + 1 < starts.length ? starts[i + 1]!.index : rowHtml.length;
    const content = rowHtml.slice(start, end).replace(/<\/(td|th)>\s*$/i, "");
    cells.push({ tag, text: stripCellTags(content) });
  }
  return cells;
}

function parseHtmlTable(html: string): TableToken {
  const rowMatches = [...html.matchAll(/<tr>(.*?)<\/tr>/gs)];
  let header: string[] = [];
  const rows: string[][] = [];

  for (const [, rowHtml] of rowMatches) {
    const cells = parseHtmlTableRow(rowHtml!);
    if (cells.length > 0 && cells.every((c) => c.tag === "th")) {
      header = cells.map((c) => c.text);
    } else {
      rows.push(cells.map((c) => c.text));
    }
  }

  const columnCount = header.length || (rows[0]?.length ?? 0);
  return { type: "table", header, rows, align: new Array(columnCount).fill(null) };
}

function parseFigureImg(html: string): ImageToken {
  const src = /src="([^"]*)"/.exec(html)?.[1] ?? "";
  const alt = /alt="([^"]*)"/.exec(html)?.[1] ?? "";
  const absoluteSrc = /^https?:\/\//.test(src) ? src : `https://docs.nestjs.com${src}`;
  return { type: "image", alt, src: absoluteSrc };
}

function extractHtmlBlocks(markdown: string): { text: string; placeholders: Map<string, ExtractedBlock> } {
  const nonce = `GNDBLOCK${Math.random().toString(36).slice(2)}`;
  const placeholders = new Map<string, ExtractedBlock>();
  let i = 0;

  const text = markdown.replace(/<table>.*?<\/table>|<figure>.*?<\/figure>/gs, (match, offset: number, full: string) => {
    // A <figure> can appear inside a GFM pipe-table cell (verified:
    // content/recipes/terminus.md, an error-log-style table with a screenshot per
    // row). Leave those alone — marked will tokenize them as inline html within the
    // cell, and flattenInline() renders bare <img> there directly. Extracting them
    // here would swap in a placeholder that ends up concatenated into a larger cell
    // string with no way to resolve it back out.
    const lineStart = full.lastIndexOf("\n", offset - 1) + 1;
    if (full.slice(lineStart, offset).includes("|")) return match;

    const placeholder = `${nonce}${i}`;
    i++;
    placeholders.set(
      placeholder,
      match.startsWith("<table")
        ? { kind: "table", token: parseHtmlTable(match) }
        : { kind: "image", token: parseFigureImg(match) },
    );
    return placeholder;
  });

  return { text, placeholders };
}

function placeholderToken(entry: ExtractedBlock): TableToken | ImageToken {
  return entry.token;
}

// A placeholder can land as the sole content of its own paragraph (the common case),
// share a paragraph with a sibling placeholder and nothing else — two <figure>s on
// adjacent lines with no blank line between them (content/recipes/documentation.md);
// marked treats consecutive non-blank lines as one paragraph with an internal break —
// or get absorbed into a neighbouring HTML block that has no blank line separating it
// from the placeholder (the table/<p>/table case). Handle all three uniformly by
// searching for placeholder occurrences anywhere in the block's text, not requiring
// a whole-text match.
function splitOnPlaceholders(text: string, placeholders: Map<string, ExtractedBlock>): GuideToken[] {
  if (placeholders.size === 0) {
    return [{ type: "html", raw: text, pre: false, text, block: true }];
  }

  // Sort longest-first: placeholder N is a numeric suffix of the nonce, and a
  // shorter key (e.g. index 1) can be a literal substring of a longer one
  // (index 10) — alternation must try the longer match first.
  const pattern = [...placeholders.keys()].sort((a, b) => b.length - a.length).join("|");
  const re = new RegExp(pattern, "g");
  const out: GuideToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let found = false;

  while ((match = re.exec(text))) {
    found = true;
    if (match.index > cursor) {
      const between = text.slice(cursor, match.index).trim();
      if (between) out.push({ type: "html", raw: between, pre: false, text: between, block: true });
    }
    out.push(placeholderToken(placeholders.get(match[0])!));
    cursor = re.lastIndex;
  }

  if (!found) {
    return [{ type: "html", raw: text, pre: false, text, block: true }];
  }

  const tail = text.slice(cursor).trim();
  if (tail) out.push({ type: "html", raw: tail, pre: false, text: tail, block: true });
  return out;
}

// ---------------------------------------------------------------------------
// Inline token flattening — used for heading anchors/text and GFM table cells.
// ---------------------------------------------------------------------------

function flattenInline(tokens: Token[] | undefined, preserveCode: boolean): string {
  if (!tokens) return "";
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
      case "escape":
        out += t.text;
        break;
      case "codespan":
        out += preserveCode ? `\`${t.text}\`` : t.text;
        break;
      case "strong":
      case "em":
      case "del":
      case "link":
        out += flattenInline(t.tokens, preserveCode);
        break;
      case "br":
        out += " ";
        break;
      case "html": {
        // Table cells can carry a <br> line break, or a <figure><img></figure> that
        // marked splits into three separate inline html tokens (verified:
        // content/recipes/terminus.md) — <figure>/</figure> contribute nothing here,
        // the <img> itself renders as a short placeholder.
        if (/^<br\s*\/?>/i.test(t.text)) {
          out += " ";
          break;
        }
        const imgMatch = /^<img\b[^>]*>/i.exec(t.text);
        if (imgMatch) {
          const alt = /alt="([^"]*)"/.exec(imgMatch[0])?.[1];
          out += `[image${alt ? `: ${alt}` : ""}]`;
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Headings. Verified against src/app/shared/directives/header-anchor.directive.ts
// in the docs repo: the real site's anchor id is `innerText.replace(/\s/g, '-').toLowerCase()`
// — whitespace-only, no punctuation stripping. Depth: Nest's top-level `###` is 1;
// verified via header-anchor.directive.ts's caller structure and the corpus itself
// (142/143 files start at ###, one at ##) that "H3 is the base unit" (depth - 2,
// floored at 1) is the intended normalisation, not "first heading becomes 1".
// ---------------------------------------------------------------------------

function normalizeDepth(rawDepth: number): number {
  return Math.max(1, rawDepth - 2);
}

function slugAnchor(text: string): string {
  return text.replace(/\s/g, "-").toLowerCase();
}

// ---------------------------------------------------------------------------
// Code fences.
// ---------------------------------------------------------------------------

// @@filename(x) is documented as always the first line of a fence. Verified against
// the real corpus: true for 452 of 453 occurrences. The one exception
// (content/websockets/gateways.md) has it mid-fence with no @@switch present — an
// upstream authoring slip, not a second directive form. Scanning the whole fence
// (not just line 0) handles it and satisfies the "no literal @@filename" invariant
// either way.
function transformCodeToken(token: Tokens.Code, context: string): CodeToken {
  const lines = token.text.split("\n");
  const contentLines: string[] = [];
  let filename: string | undefined;
  let filenameSeen = false;

  for (const line of lines) {
    const match = /^@@filename\((.*)\)$/.exec(line);
    if (match) {
      if (filenameSeen) {
        throw new Error(`${context}: more than one @@filename directive in a single fence`);
      }
      filenameSeen = true;
      filename = match[1] ? match[1] : undefined;
      continue;
    }
    contentLines.push(line);
  }

  const switchIndex = contentLines.indexOf("@@switch");
  const tsLines = switchIndex === -1 ? contentLines : contentLines.slice(0, switchIndex);
  const jsLines = switchIndex === -1 ? undefined : contentLines.slice(switchIndex + 1);

  const ts = tsLines.join("\n").trim();
  const js = jsLines ? jsLines.join("\n").trim() : undefined;

  if (ts.length === 0) {
    throw new Error(`${context}: code token has empty TypeScript content after transform`);
  }

  return {
    type: "code",
    lang: token.lang ?? "",
    ...(filename ? { filename } : {}),
    ts,
    ...(js ? { js } : {}),
  };
}

// ---------------------------------------------------------------------------
// GFM pipe-tables (`| a | b |`). Not mentioned in ARCHITECTURE.md §6.1, which
// documents only the 35 HTML <table> blocks — but 45 more tables in the real
// corpus use plain GFM syntax instead, which marked already parses natively into
// its own Tokens.Table shape. SPEC.md's TableToken isn't scoped to HTML-sourced
// tables, so both forms are normalised to the same shape here.
// ---------------------------------------------------------------------------

function convertNativeTable(token: Tokens.Table): TableToken {
  return {
    type: "table",
    header: token.header.map((cell) => flattenInline(cell.tokens, true)),
    rows: token.rows.map((row) => row.map((cell) => flattenInline(cell.tokens, true))),
    align: token.align,
  };
}

// marked's `raw` field (the exact source slice a token was parsed from) is pure
// round-trip-to-markdown information that nothing here ever needs — rendering
// walks `tokens`/`text`, never reconstructs source. It's also the single biggest
// contributor to guides.json's size: ~2 MB of the ~6.5 MB unstripped output measured
// against the real corpus, well over ARCHITECTURE.md §1's ~2 MB budget for the whole
// file. Stripped recursively, size-neutral to anything the renderer reads.
function stripRaw(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRaw);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === "raw") continue;
      out[key] = stripRaw(val);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Top-level pipeline for one guide file.
// ---------------------------------------------------------------------------

// `marked` is threaded through as a parameter, not imported statically — this
// module is reached from the runtime `nest-doc update` path (src/nest/update.ts),
// not just build-time scripts, and a static `import { marked } from "marked"`
// gets hoisted into the bundle and eagerly evaluated on every CLI invocation
// regardless of dynamic-import wrapping elsewhere (verified — the same ESM
// hoisting behavior documented at core/extract/typescript-loader.ts).
export function transformMarkdown(marked: typeof MarkedSingleton, rawMarkdown: string, file: string): Pick<Guide, "title" | "headings" | "tokens"> {
  const normalized = normalizeSource(rawMarkdown);
  const { text, placeholders } = extractHtmlBlocks(normalized);
  // marked.lexer() returns Token[] (MarkedToken | Tokens.Generic); without custom
  // tokenizer extensions registered, Generic never actually occurs.
  const parsed = marked.lexer(text) as MarkedToken[];

  const tokens: GuideToken[] = [];
  const headings: Heading[] = [];
  let title: string | undefined;

  for (const token of parsed) {
    if (token.type === "code") {
      tokens.push(transformCodeToken(token, file));
      continue;
    }

    if (token.type === "table") {
      tokens.push(convertNativeTable(token));
      continue;
    }

    if (token.type === "paragraph" && placeholders.size > 0 && [...placeholders.keys()].some((p) => token.text.includes(p))) {
      tokens.push(...splitOnPlaceholders(token.text, placeholders));
      continue;
    }

    if (token.type === "html" && token.block) {
      tokens.push(...splitOnPlaceholders(token.text, placeholders));
      continue;
    }

    if (token.type === "heading") {
      const depth = normalizeDepth(token.depth);
      const text = flattenInline(token.tokens, false);
      const anchor = slugAnchor(text);
      headings.push({ depth, text, anchor, tokenIndex: tokens.length });
      if (title === undefined) title = text;
      tokens.push({ ...token, depth });
      continue;
    }

    tokens.push(token);
  }

  if (title === undefined) {
    throw new Error(`${file}: no heading found to use as title`);
  }

  return { title, headings, tokens: stripRaw(tokens) as GuideToken[] };
}
