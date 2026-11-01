import { visibleLength } from "../core/render/ansi.ts";
import type { RenderOptions } from "../core/render/ansi.ts";
import type { SymbolKind, SymbolRecord } from "../core/extract/types.ts";
import { shorthandFor } from "./package-scope.ts";
import { firstSentence } from "./doc-text.ts";

// A "decorator" isn't a SymbolKind — display-only bucket, detected by a `function`/`const` whose signature ends in a *Decorator return type (verified: 420 real exports, zero false positives).
type Bucket = "decorator" | SymbolKind;

function bucketFor(symbol: SymbolRecord): Bucket {
  if ((symbol.kind === "function" || symbol.kind === "const") && /Decorator\b/.test(symbol.signature)) {
    return "decorator";
  }
  return symbol.kind;
}

// Fixed display order — decorators, classes, and interfaces are Nest's primary surface, so they lead.
const BUCKET_ORDER: Bucket[] = ["decorator", "class", "interface", "function", "type", "enum", "const", "variable"];

const BUCKET_LABELS: Record<Bucket, string> = {
  decorator: "DECORATORS",
  class: "CLASSES",
  interface: "INTERFACES",
  function: "FUNCTIONS",
  type: "TYPES",
  enum: "ENUMS",
  const: "CONSTANTS",
  variable: "VARIABLES",
};

function truncate(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

// Narrowest the right-hand column may get before the left column is capped instead.
const MIN_RIGHT_COLUMN = 16;

// Two aligned columns with the left column capped so the right keeps MIN_RIGHT_COLUMN; a wider entry puts its right text on the next line, so only an unbreakable token can overflow.
function columnRows(rows: { left: string; right: string }[], width: number): string[] {
  const natural = Math.max(...rows.map((r) => r.left.length)) + 4;
  const colWidth = Math.min(natural, Math.max(8, width - 2 - MIN_RIGHT_COLUMN));
  const rightWidth = Math.max(1, width - 2 - colWidth);

  return rows.flatMap(({ left, right }) => {
    const summary = right ? truncate(right, rightWidth) : "";
    if (left.length + 2 <= colWidth) return [`  ${left.padEnd(colWidth)}${summary}`.replace(/\s+$/, "")];
    return summary ? [`  ${left}`, `  ${" ".repeat(colWidth)}${summary}`] : [`  ${left}`];
  });
}

// A package with zero `@publicApi` tags isn't a package with zero public symbols, so `all` is forced on rather than showing an empty index.
export function renderPackageIndex(packageName: string, packageVersion: string, symbols: SymbolRecord[], all: boolean, options: RenderOptions): string {
  const publicCount = symbols.filter((s) => s.isPublicApi).length;
  const effectiveAll = all || publicCount === 0;
  const visible = effectiveAll ? symbols : symbols.filter((s) => s.isPublicApi);

  const buckets = new Map<Bucket, SymbolRecord[]>();
  for (const symbol of visible) {
    const bucket = bucketFor(symbol);
    const list = buckets.get(bucket) ?? [];
    list.push(symbol);
    buckets.set(bucket, list);
  }

  const lines: string[] = [`${packageName}@${packageVersion}`, `${symbols.length} exports, ${publicCount} public`, ""];

  for (const bucket of BUCKET_ORDER) {
    const entries = buckets.get(bucket);
    if (!entries || entries.length === 0) continue;

    entries.sort((a, b) => a.name.localeCompare(b.name));
    lines.push(BUCKET_LABELS[bucket]);
    lines.push(...columnRows(entries.map((e) => ({ left: e.name, right: e.doc ? firstSentence(e.doc) : "" })), options.width));
    lines.push("");
  }

  const shorthand = shorthandFor(packageName);
  lines.push(
    ...columnRows(
      [
        { left: `nest-doc --all ${packageName}`, right: "include non-public exports" },
        { left: `nest-doc ${shorthand}.<name>`, right: "detail for one symbol" },
      ],
      options.width,
    ),
  );

  return lines.join("\n").replace(/\n+$/, "");
}
