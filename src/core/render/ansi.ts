// Colour primitives and width handling — hand-written, not chalk (ADR-0003): a dozen SGR constants don't need a dependency.

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

// Headings colour by depth (ARCHITECTURE.md §7); depth 1 is bold-only (SPEC.md §4.3, a guide's title), depth 2+ cycle through a small palette.
const HEADING_COLOR_CODES = [36, 33, 32, 35] as const; // cyan, yellow, green, magenta

export function headingColor(depth: number, text: string, options: RenderOptions): string {
  if (depth <= 1) return bold(text, options);
  const code = HEADING_COLOR_CODES[(depth - 2) % HEADING_COLOR_CODES.length]!;
  return sgr([1, code], text, options);
}

// Word-wraps to `width`, measuring visible length so ANSI codes never distort wrapping; an oversized single word is hard-broken (losing colour) so the width cap is never violated.
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

// Chops a line into `width`-sized chunks ignoring word boundaries — for code, where word-wrapping would collapse meaningful indentation. Strips colour rather than risk splitting inside an escape sequence.
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

// The one impure function in this module — everything else takes RenderOptions explicitly and stays testable without mocking process.env/stdout.
export function resolveRenderOptions(): RenderOptions {
  const isTTY = process.stdout.isTTY === true;
  const noColor = process.env.NO_COLOR !== undefined;
  const forceColor = process.env.FORCE_COLOR !== undefined;

  const color = forceColor ? true : noColor ? false : isTTY;
  const width = isTTY ? Math.max(40, Math.min(process.stdout.columns || 100, 100)) : 80;

  return { width, color };
}
