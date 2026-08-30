import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { DeclarationEntry } from "./parse.ts";
import { getExportedDeclarations, getExportStatements, parseSourceFile } from "./parse.ts";
import { extractJsDoc } from "./jsdoc.ts";
import { extractSignature } from "./signature.ts";
import { loadTypeScript } from "./typescript-loader.ts";
import type { SymbolRecord } from "./types.ts";
import type TS from "typescript";

// Specifiers are written with .js (ESM); rewrite to .d.ts, falling back to <spec>/index.d.ts for directory specifiers (ARCHITECTURE.md §5.1).
function resolveModuleSpecifier(fromDir: string, specifier: string): string {
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
// `allowedNames` propagates unchanged through every wildcard (`export *`) edge and only narrows on a named edge (`export { A, B }`) — resetting to "all" on each wildcard instead would silently over-include names a deeper file exports but the package never promoted to its public surface (verified: this exact trap on the real corpus, see CLAUDE.md).
// Async, and the only place `typescript` actually loads (ADR-0001: guide lookups never pay for it).
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
