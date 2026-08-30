// Column-aligned table rendering (ARCHITECTURE.md §7's "table → column-aligned
// box"). Plain aligned columns with a dashed header rule, not a full
// box-drawing border — simpler, and every real CLI table (kubectl, docker ps,
// go doc) reads fine this way.
import { bold, cyan, visibleLength, wrapText, type RenderOptions } from "./ansi.ts";
import type { TableToken } from "./types.ts";

const COLUMN_GAP = 2;

// Table cells preserve inline code spans as backtick-wrapped text (see
// guides-transform.ts's stripCellTags) — style them here the same as
// codespan elsewhere: cyan, backticks stripped.
function styleCellText(text: string, options: RenderOptions): string {
  return text.replace(/`([^`]+)`/g, (_match, inner: string) => cyan(inner, options));
}

function padCell(text: string, width: number, align: "left" | "right" | "center" | null): string {
  const pad = Math.max(0, width - visibleLength(text));
  if (align === "right") return " ".repeat(pad) + text;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + text + " ".repeat(pad - left);
  }
  return text + " ".repeat(pad);
}

export function renderTable(token: TableToken, options: RenderOptions): string[] {
  const numCols = token.header.length > 0 ? token.header.length : (token.rows[0]?.length ?? 0);
  if (numCols === 0) return [];

  const align = (i: number): "left" | "right" | "center" | null => token.align[i] ?? null;

  const styledHeader = token.header.map((cell) => styleCellText(cell, options));
  const styledRows = token.rows.map((row) => row.map((cell) => styleCellText(cell, options)));

  const naturalWidth: number[] = [];
  for (let i = 0; i < numCols; i++) {
    let max = visibleLength(styledHeader[i] ?? "");
    for (const row of styledRows) max = Math.max(max, visibleLength(row[i] ?? ""));
    naturalWidth.push(Math.max(max, 1));
  }

  const overhead = COLUMN_GAP * (numCols - 1);
  const naturalTotal = naturalWidth.reduce((a, b) => a + b, 0);
  // Guaranteed >= numCols given the width floor of 40 (SPEC.md's environment
  // rules) and the real corpus's max of 4 columns — see table.test cases.
  const available = Math.max(numCols, options.width - overhead);

  let colWidths: number[];
  if (naturalTotal <= available) {
    colWidths = naturalWidth;
  } else {
    // Columns narrower than their fair share (e.g. a short "Type" column)
    // keep their natural width; the leftover space gets redistributed to
    // whichever column(s) actually need more (typically "Description") —
    // proportional scaling of every column equally would squeeze short
    // columns just as hard as the long one, breaking single unbroken words
    // like camelCase option names for no reason.
    const fairShare = available / numCols;
    colWidths = new Array(numCols).fill(0) as number[];
    let leftover = 0;
    const needsMore: number[] = [];
    for (let i = 0; i < numCols; i++) {
      if (naturalWidth[i]! <= fairShare) {
        colWidths[i] = naturalWidth[i]!;
        leftover += fairShare - naturalWidth[i]!;
      } else {
        needsMore.push(i);
      }
    }
    if (needsMore.length > 0) {
      const extraPerCol = leftover / needsMore.length;
      for (const i of needsMore) {
        colWidths[i] = Math.max(1, Math.floor(fairShare + extraPerCol));
      }
    }
    let total = colWidths.reduce((a, b) => a + b, 0);
    while (total > available) {
      const maxIdx = colWidths.indexOf(Math.max(...colWidths));
      colWidths[maxIdx] = (colWidths[maxIdx] ?? 1) - 1;
      total -= 1;
    }
  }

  function renderRow(cells: string[], isHeader: boolean): string[] {
    const wrappedCells = cells.map((cell, i) => wrapText(cell, colWidths[i]!));
    const height = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const outLines: string[] = [];
    for (let line = 0; line < height; line++) {
      const parts = colWidths.map((width, i) => {
        const cellLines = wrappedCells[i] ?? [];
        const text = cellLines[line] ?? "";
        const padded = padCell(text, width, align(i));
        return isHeader ? bold(padded, options) : padded;
      });
      outLines.push(parts.join(" ".repeat(COLUMN_GAP)));
    }
    return outLines;
  }

  const lines: string[] = [];
  if (token.header.length > 0) {
    lines.push(...renderRow(styledHeader, true));
    lines.push(colWidths.map((w) => "-".repeat(w)).join(" ".repeat(COLUMN_GAP)));
  }
  for (const row of styledRows) {
    lines.push(...renderRow(row, false));
  }

  return lines;
}
