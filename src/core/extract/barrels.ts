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

// Resolves a barrel's export specifier (written with .js for ESM) to a real .d.ts path, refusing anything outside packageRoot.
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
    line: line + 1, // 1-based
  };
}

// Walks a package's barrel graph from its entry .d.ts, collecting every exported symbol; the only place `typescript` actually loads.
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
