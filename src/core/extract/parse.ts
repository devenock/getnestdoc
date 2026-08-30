import { readFileSync } from "node:fs";
import type TS from "typescript";
import type { SymbolKind } from "./types.ts";

// setParentNodes: true is required for node.getText()/getStart() to work (ARCHITECTURE.md §5.1).
export function parseSourceFile(ts: typeof TS, filePath: string): TS.SourceFile {
  const text = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

export type DeclarationEntry = {
  name: string;
  kind: SymbolKind;
  node: TS.Node;
};

function isExported(ts: typeof TS, node: TS.Node): boolean {
  return (ts.getCombinedModifierFlags(node as TS.Declaration) & ts.ModifierFlags.Export) !== 0;
}

// Named, exported top-level declarations in one file — the raw material barrels.ts filters down to what a barrel actually re-exports.
export function getExportedDeclarations(ts: typeof TS, sourceFile: TS.SourceFile): Map<string, DeclarationEntry> {
  const declarations = new Map<string, DeclarationEntry>();

  for (const statement of sourceFile.statements) {
    if (!isExported(ts, statement)) continue;

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, { name: statement.name.text, kind: "function", node: statement });
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, { name: statement.name.text, kind: "class", node: statement });
    } else if (ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, { name: statement.name.text, kind: "interface", node: statement });
    } else if (ts.isTypeAliasDeclaration(statement)) {
      declarations.set(statement.name.text, { name: statement.name.text, kind: "type", node: statement });
    } else if (ts.isEnumDeclaration(statement)) {
      declarations.set(statement.name.text, { name: statement.name.text, kind: "enum", node: statement });
    } else if (ts.isVariableStatement(statement)) {
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          declarations.set(decl.name.text, {
            name: decl.name.text,
            kind: isConst ? "const" : "variable",
            node: statement,
          });
        }
      }
    }
  }

  return declarations;
}

// The module graph edges barrels.ts follows (ARCHITECTURE.md §5.1): wildcard and named re-exports. Excludes bare `export {};`, which has no module specifier.
export type ExportStatement =
  | { kind: "wildcard"; specifier: string }
  | { kind: "named"; specifier: string; names: { sourceName: string; exportedName: string }[] };

export function getExportStatements(ts: typeof TS, sourceFile: TS.SourceFile): ExportStatement[] {
  const statements: ExportStatement[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;

    if (!statement.exportClause) {
      statements.push({ kind: "wildcard", specifier });
    } else if (ts.isNamedExports(statement.exportClause)) {
      const names = statement.exportClause.elements.map((el) => ({
        sourceName: (el.propertyName ?? el.name).text,
        exportedName: el.name.text,
      }));
      if (names.length > 0) statements.push({ kind: "named", specifier, names });
    }
  }

  return statements;
}
