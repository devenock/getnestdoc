import type { marked as MarkedSingleton, MarkedToken, Token, Tokens } from "marked";
import type { CodeToken, GuideToken, Heading, ImageToken, TableToken } from "../../core/render/types.ts";
import type { Guide } from "../guides/types.ts";

// Always a complete, self-closing tag, never inside a code fence — a global string strip is safe (ARCHITECTURE.md §6.3).
function stripAppBanners(markdown: string): string {
  return markdown.replace(/<app-banner-[\w-]*>\s*<\/app-banner-[\w-]*>/g, "");
}

// Angular's {{ }} interpolation forces literal braces to be escaped this way in the source markdown; undocumented, found by grepping the corpus.
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

// <table>/<figure> blocks are pulled from the raw text before lexing, not walked from marked's token tree — marked's HTML-block tokenizer both splits a single table across a blank line and merges adjacent tables with none, and a placeholder swap sidesteps both.
type ExtractedBlock = { kind: "table"; token: TableToken } | { kind: "image"; token: ImageToken };

function stripCellTags(html: string): string {
  let s = html.replace(/<code>(.*?)<\/code>/gs, "`$1`");
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gs, "$1");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// <td>/<th> end tags are optional in real HTML; a cell ends at the next start tag or the row's end, not its own close tag.
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
    // A <figure> inside a GFM table cell is left alone — marked tokenizes it as inline html there, which flattenInline() already handles.
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

// A placeholder can be its own paragraph, share one with a sibling placeholder, or get absorbed into a neighbouring HTML block — search for occurrences anywhere in the text rather than requiring a whole-text match.
function splitOnPlaceholders(text: string, placeholders: Map<string, ExtractedBlock>): GuideToken[] {
  if (placeholders.size === 0) {
    return [{ type: "html", raw: text, pre: false, text, block: true }];
  }

  // Sort longest-first: a shorter placeholder key can be a literal substring of a longer one.
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
        // A table cell's <figure><img></figure> splits into three separate inline html tokens; only the <img> renders, as a short placeholder.
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

// Verified against the docs repo's own header-anchor.directive.ts: anchor id is whitespace-only lowercasing, and "###" is the corpus's base heading depth (floored at 1).
function normalizeDepth(rawDepth: number): number {
  return Math.max(1, rawDepth - 2);
}

function slugAnchor(text: string): string {
  return text.replace(/\s/g, "-").toLowerCase();
}

// @@filename(x) is documented as always the fence's first line; one real corpus file breaks that (an upstream authoring slip), so the whole fence is scanned rather than just line 0.
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

// GFM pipe-tables aren't in ARCHITECTURE.md §6.1's count (HTML <table>s only) but 45 more real tables use this form; both are normalised to the same TableToken shape.
function convertNativeTable(token: Tokens.Table): TableToken {
  return {
    type: "table",
    header: token.header.map((cell) => flattenInline(cell.tokens, true)),
    rows: token.rows.map((row) => row.map((cell) => flattenInline(cell.tokens, true))),
    align: token.align,
  };
}

// marked's `raw` field is pure round-trip-to-source info nothing here reads, and was ~2 MB of guides.json's unstripped ~6.5 MB.
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

// `marked` is a parameter, not a static import — this module ships in the runtime `nest-doc update` bundle, and a static import would defeat the lazy-loading typescript-loader.ts establishes.
export function transformMarkdown(marked: typeof MarkedSingleton, rawMarkdown: string, file: string): Pick<Guide, "title" | "headings" | "tokens"> {
  const normalized = normalizeSource(rawMarkdown);
  const { text, placeholders } = extractHtmlBlocks(normalized);
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
