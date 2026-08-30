import { wrapText } from "../core/render/ansi.ts";
import type { RenderOptions } from "../core/render/ansi.ts";
import type { SymbolRecord } from "../core/extract/types.ts";
import type { AliasFile } from "./aliases.ts";
import { resolveSeeUrl } from "./guides/index.ts";
import type { GuidesFile } from "./guides/types.ts";
import { plainText } from "./doc-text.ts";

const NO_DOC_LINE = "No documentation available in this package.";

// @param tag text is "<name> <description>" (jsdoc.ts joins them with a
// single space); split back apart to column-align, the same shape SPEC.md
// §4.1's worked example shows ("options    options specifying...").
function splitParamTag(text: string): { name: string; description: string } {
  const spaceIndex = text.indexOf(" ");
  if (spaceIndex === -1) return { name: text, description: "" };
  return { name: text.slice(0, spaceIndex), description: text.slice(spaceIndex + 1) };
}

// Real @param descriptions run long and carry embedded newlines from how the
// source .d.ts happened to be wrapped (verified against Controller's options
// param in @nestjs/common@12.0.1) — wrapText collapses those via its \s+
// split, so this re-flows to the terminal width instead of reproducing the
// source's arbitrary line breaks.
function renderParameters(tags: { name: string; text: string }[], width: number): string[] {
  const params = tags.filter((t) => t.name === "param").map((t) => splitParamTag(t.text));
  if (params.length === 0) return [];

  const nameColWidth = Math.max(...params.map((p) => p.name.length)) + 4;
  const descWidth = Math.max(1, width - 4 - nameColWidth);
  const continuationIndent = " ".repeat(4 + nameColWidth);

  const lines: string[] = ["  Parameters"];
  for (const param of params) {
    const wrapped = param.description ? wrapText(plainText(param.description), descWidth) : [""];
    lines.push(`    ${param.name.padEnd(nameColWidth)}${wrapped[0]}`);
    for (const cont of wrapped.slice(1)) lines.push(`${continuationIndent}${cont}`);
  }
  return lines;
}

// SPEC.md §4.1: @see URLs resolved through the alias table into runnable
// commands. Only resolvable entries are shown — an external GitHub link
// (verified: 3 of 118 real @see URLs in @nestjs/common@12.0.1, e.g.
// ValidationError's link to typestack/class-validator) has no `nest-doc`
// equivalent and is silently dropped rather than shown as dead.
function renderSeeAlso(see: { url: string }[], guidesFile: GuidesFile, aliasFile: AliasFile): string[] {
  const paths = see.map((link) => resolveSeeUrl(link.url, guidesFile, aliasFile)).filter((p): p is string => p !== undefined);
  if (paths.length === 0) return [];

  const lines = ["  See also"];
  for (const path of paths) lines.push(`    nest-doc ${path}`);
  return lines;
}

// SPEC.md §4.1's exact acceptance format. ADR-0007's documentation-coverage
// finding (a package can ship zero JSDoc — @nestjs/swagger@12.0.1 does,
// across all 160 exports) requires an explicit fallback line instead of a
// blank section, so the output never looks broken for those packages.
export function renderSymbol(
  packageName: string,
  packageVersion: string,
  symbol: SymbolRecord,
  guidesFile: GuidesFile,
  aliasFile: AliasFile,
  options: RenderOptions,
): string {
  const lines: string[] = [`${packageName}@${packageVersion}`, ""];

  const displaySignature = symbol.signature.replace(/^export\s+/, "").replace(/^declare\s+/, "").replace(/;$/, "");
  // "Unindented" (SPEC.md §4.1) sets the left margin, not a promise it fits
  // on one line — a class or interface's member list, or a large enum
  // (HttpStatus's 58 members), routinely doesn't. wrapText's word-boundary
  // wrapping is imperfect for code (it can split inside a type expression at
  // a space), but it's the same tool the doc body already uses and it never
  // violates the width budget, which plain non-wrapping would.
  lines.push(...wrapText(displaySignature, Math.max(1, options.width)), "");

  if (symbol.doc) {
    for (const wrapped of wrapText(plainText(symbol.doc), Math.max(1, options.width - 4))) {
      lines.push(`    ${wrapped}`);
    }
  } else {
    lines.push(`    ${NO_DOC_LINE}`);
  }
  lines.push("");

  const paramLines = renderParameters(symbol.tags, options.width);
  if (paramLines.length > 0) lines.push(...paramLines, "");

  const seeAlsoLines = renderSeeAlso(symbol.see, guidesFile, aliasFile);
  if (seeAlsoLines.length > 0) lines.push(...seeAlsoLines, "");

  return lines.join("\n").replace(/\n+$/, "");
}
