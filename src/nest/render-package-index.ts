import { visibleLength } from "../core/render/ansi.ts";
import type { RenderOptions } from "../core/render/ansi.ts";
import type { SymbolKind, SymbolRecord } from "../core/extract/types.ts";
import { shorthandFor } from "./package-scope.ts";
import { plainText } from "./doc-text.ts";

// A "decorator" isn't a SymbolKind — display-only bucket, detected by a `function`/`const` whose signature ends in a *Decorator return type (verified: 420 real exports, zero false positives).
type Bucket = "decorator" | SymbolKind;

function bucketFor(symbol: SymbolRecord): Bucket {
  if ((symbol.kind === "function" || symbol.kind === "const") && /Decorator\b/.test(symbol.signature)) {
    return "decorator";
  }
  return symbol.kind;
}

// Fixed display order, spec-mandated only for decorators-before-interfaces (SPEC.md §4.2's example) — decorators/classes/interfaces are Nest's primary surface.
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

// "First sentence of the doc" (SPEC.md §4.2); falls back to the whole doc when there's no terminal period.
function firstSentence(doc: string): string {
  const plain = plainText(doc);
  const match = /^(.*?[.!?])(\s|$)/.exec(plain);
  return match ? match[1]! : plain;
}

function truncate(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

// SPEC.md §4.2. ADR-0007: a package with zero `@publicApi` tags (verified: @nestjs/swagger) isn't a package with zero public symbols, so `all` is forced on rather than showing an empty index.
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
    const nameColWidth = Math.max(...entries.map((e) => e.name.length)) + 4;

    lines.push(BUCKET_LABELS[bucket]);
    for (const entry of entries) {
      const summary = entry.doc ? truncate(firstSentence(entry.doc), Math.max(1, options.width - 2 - nameColWidth)) : "";
      lines.push(`  ${entry.name.padEnd(nameColWidth)}${summary}`.replace(/\s+$/, ""));
    }
    lines.push("");
  }

  const shorthand = shorthandFor(packageName);
  const allHint = `nest-doc --all ${packageName}`;
  const detailHint = `nest-doc ${shorthand}.<name>`;
  const hintColWidth = Math.max(allHint.length, detailHint.length) + 4;
  lines.push(`  ${allHint.padEnd(hintColWidth)}include non-public exports`);
  lines.push(`  ${detailHint.padEnd(hintColWidth)}detail for one symbol`);

  return lines.join("\n").replace(/\n+$/, "");
}
