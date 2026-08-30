import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { DeclarationEntry } from "./parse.ts";
import { getExportedDeclarations, getExportStatements, parseSourceFile } from "./parse.ts";
import { extractJsDoc } from "./jsdoc.ts";
import { extractSignature } from "./signature.ts";
import { loadTypeScript } from "./typescript-loader.ts";
import type { SymbolRecord } from "./types.ts";
import type TS from "typescript";

// Specifiers are written with .js (ESM); rewrite to .d.ts, falling back to
// <spec>/index.d.ts for directory specifiers (ARCHITECTURE.md §5.1).
export function resolveModuleSpecifier(fromDir: string, specifier: string): string {
  const withoutExt = specifier.replace(/\.js$/, "");
  const direct = join(fromDir, `${withoutExt}.d.ts`);
  if (existsSync(direct)) return direct;
  return join(fromDir, withoutExt, "index.d.ts");
}

function buildSymbolRecord(
  ts: typeof TS,
  entry: DeclarationEntry,
  sourceFile: TS.SourceFile,
  filePath: string,
  packageRoot: string,
): SymbolRecord {
  const { doc, tags, see, isPublicApi } = extractJsDoc(ts, entry.node);
  const signature = extractSignature(entry.node, sourceFile);
  const { line } = sourceFile.getLineAndCharacterOfPosition(entry.node.getStart(sourceFile));

  return {
    name: entry.name,
    kind: entry.kind,
    signature,
    doc,
    tags,
    see,
    isPublicApi,
    file: relative(packageRoot, filePath),
    line: line + 1, // SPEC.md §3: 1-based
  };
}

// Walks the barrel graph from a package's entry .d.ts (ARCHITECTURE.md §5.1).
// `allowedNames` is "all" at the entry point and through every wildcard
// (`export *`) edge — a wildcard adds no curation, so the filter a file was
// reached under propagates to it unchanged. A named edge (`export { A, B }`)
// is its own explicit curation layered on top: only names that satisfy both
// the statement's own list AND the inherited filter get followed, and only
// with THAT narrower set for the recursive visit.
//
// This distinction is the one specific trap (PROMPTS.md Phase 6): the naive
// version — resetting to "all" on every wildcard regardless of the current
// filter — silently over-includes. Verified against the real corpus: root
// index.d.ts named-exports exactly 56 interface names from interfaces/
// index.js, which itself wildcards into features/arguments-host.interface.js
// among many others. That one file alone declares three exports —
// `ContextType`, `ArgumentsHost`, `HttpArgumentsHost` — only the first two of
// which are in the root's named list. Propagating "all" instead of the
// inherited 56-name filter through that wildcard would wrongly pull in
// `HttpArgumentsHost` (and everything else those files export that was never
// promoted to the package's public surface).
//
// Async, and the only place `typescript` actually loads (typescript-loader.ts)
// — ADR-0001: guide lookups never pay for it.
export async function extractPackage(entryFile: string): Promise<SymbolRecord[]> {
  const ts = await loadTypeScript();
  const packageRoot = dirname(entryFile);
  const visited = new Set<string>();
  const results: SymbolRecord[] = [];

  function visit(filePath: string, allowedNames: Set<string> | "all"): void {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const sourceFile = parseSourceFile(ts, filePath);
    const declarations = getExportedDeclarations(ts, sourceFile);

    for (const [name, entry] of declarations) {
      if (allowedNames !== "all" && !allowedNames.has(name)) continue;
      results.push(buildSymbolRecord(ts, entry, sourceFile, filePath, packageRoot));
    }

    const fileDir = dirname(filePath);
    for (const exportStatement of getExportStatements(ts, sourceFile)) {
      const targetFile = resolveModuleSpecifier(fileDir, exportStatement.specifier);

      if (exportStatement.kind === "wildcard") {
        visit(targetFile, allowedNames);
        continue;
      }

      const relevantSourceNames = exportStatement.names
        .filter((n) => allowedNames === "all" || allowedNames.has(n.exportedName))
        .map((n) => n.sourceName);

      if (relevantSourceNames.length > 0) {
        visit(targetFile, new Set(relevantSourceNames));
      }
    }
  }

  visit(entryFile, "all");
  return results;
}
