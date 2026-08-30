// Colour primitives and width handling. See ADR-0003: hand-written, not
// chalk — a dozen SGR constants don't need a dependency.

export type RenderOptions = {
  width: number;
  color: boolean;
};

// eslint-disable-next-line no-control-regex -- matching the ESC byte is the point
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function sgr(codes: number[], text: string, options: RenderOptions): string {
  if (!options.color || text.length === 0) return text;
  return `\x1b[${codes.join(";")}m${text}\x1b[0m`;
}

export function bold(text: string, options: RenderOptions): string {
  return sgr([1], text, options);
}

export function dim(text: string, options: RenderOptions): string {
  return sgr([2], text, options);
}

export function italic(text: string, options: RenderOptions): string {
  return sgr([3], text, options);
}

export function underline(text: string, options: RenderOptions): string {
  return sgr([4], text, options);
}

export function strikethrough(text: string, options: RenderOptions): string {
  return sgr([9], text, options);
}

export function cyan(text: string, options: RenderOptions): string {
  return sgr([36], text, options);
}

export function green(text: string, options: RenderOptions): string {
  return sgr([32], text, options);
}

export function magenta(text: string, options: RenderOptions): string {
  return sgr([35], text, options);
}

export function blue(text: string, options: RenderOptions): string {
  return sgr([34], text, options);
}

// Headings colour by depth (ARCHITECTURE.md §7). Depth 1 is a guide's title —
// bold only, per SPEC.md §4.3 ("Title bold") — then depth 2+ cycle through a
// small palette so nesting is visually distinguishable without needing more
// than the standard 16-colour codes.
const HEADING_COLOR_CODES = [36, 33, 32, 35] as const; // cyan, yellow, green, magenta

export function headingColor(depth: number, text: string, options: RenderOptions): string {
  if (depth <= 1) return bold(text, options);
  const code = HEADING_COLOR_CODES[(depth - 2) % HEADING_COLOR_CODES.length]!;
  return sgr([1, code], text, options);
}

// Word-wraps (possibly already ANSI-coloured) text to `width`, measuring each
// word by its visible length so colour codes never distort wrapping
// decisions. A single word wider than `width` (a long URL with no spaces,
// say) is hard-broken — losing its colouring in that one fallback path — so
// the width cap is never violated regardless of content.
export function wrapText(text: string, width: number): string[] {
  const limit = Math.max(1, width);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  let currentLen = 0;

  for (const word of words) {
    const wordLen = visibleLength(word);

    if (wordLen > limit) {
      if (current) {
        lines.push(current);
        current = "";
        currentLen = 0;
      }
      const plain = stripAnsi(word);
      for (let i = 0; i < plain.length; i += limit) {
        lines.push(plain.slice(i, i + limit));
      }
      continue;
    }

    const sepLen = current ? 1 : 0;
    if (currentLen + sepLen + wordLen > limit) {
      lines.push(current);
      current = word;
      currentLen = wordLen;
    } else {
      current = current ? `${current} ${word}` : word;
      currentLen += sepLen + wordLen;
    }
  }

  if (current) lines.push(current);
  return lines;
}

// Chops a (possibly ANSI-coloured) line into `width`-sized chunks without
// regard for word boundaries — for code lines, where word-wrapping would
// collapse meaningful indentation/alignment whitespace. Like wrapText's
// oversized-word fallback, this strips colour for the fallback chunks rather
// than risk splitting inside an escape sequence; only reached by the ~1% of
// real code lines wider than the render width in the first place.
export function hardWrapVisible(text: string, width: number): string[] {
  const limit = Math.max(1, width);
  if (visibleLength(text) <= limit) return [text];
  const plain = stripAnsi(text);
  const lines: string[] = [];
  for (let i = 0; i < plain.length; i += limit) {
    lines.push(plain.slice(i, i + limit));
  }
  return lines;
}

// Environment detection — the one impure function in this module. Everything
// else here and in code.ts/table.ts/markdown.ts takes RenderOptions
// explicitly and touches neither process.env nor process.stdout, so it stays
// testable without mocking either (Phase 3: "pure functions, no filesystem").
export function resolveRenderOptions(): RenderOptions {
  const isTTY = process.stdout.isTTY === true;
  const noColor = process.env.NO_COLOR !== undefined;
  const forceColor = process.env.FORCE_COLOR !== undefined;

  const color = forceColor ? true : noColor ? false : isTTY;
  const width = isTTY ? Math.max(40, Math.min(process.stdout.columns || 100, 100)) : 80;

  return { width, color };
}
