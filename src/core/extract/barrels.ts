import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { DeclarationEntry } from "./parse.ts";
import { getExportedDeclarations, getExportStatements, parseSourceFile } from "./parse.ts";
import { extractJsDoc } from "./jsdoc.ts";
import { extractSignature } from "./signature.ts";
import { sanitizeExtractedText } from "./sanitize.ts";
import { loadTypeScript } from "./typescript-loader.ts";
import type { SymbolRecord } from "./types.ts";
import type TS from "typescript";

// Specifiers are written with .js (ESM); rewrite to .d.ts, falling back to <spec>/index.d.ts for directory specifiers (ARCHITECTURE.md §5.1).
//
// A specifier is text inside a *third-party* .d.ts file — untrusted,
// attacker-controlled data, same trust boundary as core/cache/paths.ts's
// packageVersion. Verified as a real issue: `export * from
// "../../secret-location/leaked.js"` in a package's own index.d.ts made
// extractPackage() read and display symbols from a .d.ts file completely
// outside that package's own directory — a real barrel legitimately never
// needs to leave its own package root. `packageRoot` constrains it there;
// undefined means "don't follow this one", the same shape as an unresolvable
// specifier already had.
function resolveModuleSpecifier(fromDir: string, specifier: string, packageRoot: string): string | undefined {
  const withoutExt = specifier.replace(/\.js$/, "");
  const direct = join(fromDir, `${withoutExt}.d.ts`);
  const resolved = existsSync(direct) ? direct : join(fromDir, withoutExt, "index.d.ts");

  const resolvedRoot = resolve(packageRoot) + sep;
  return resolve(resolved).startsWith(resolvedRoot) ? resolved : undefined;
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
    signature: sanitizeExtractedText(signature),
    doc: sanitizeExtractedText(doc),
    tags: tags.map((tag) => ({ name: tag.name, text: sanitizeExtractedText(tag.text) })),
    see: see.map((link) => ({ text: sanitizeExtractedText(link.text), url: sanitizeExtractedText(link.url) })),
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
      const targetFile = resolveModuleSpecifier(fileDir, exportStatement.specifier, packageRoot);
      if (!targetFile) continue;

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
