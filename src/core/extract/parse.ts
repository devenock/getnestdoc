import { readFileSync } from "node:fs";
import type TS from "typescript";
import type { SymbolKind } from "./types.ts";

// setParentNodes: true is required for node.getText()/getStart() to work.
export function parseSourceFile(ts: typeof TS, filePath: string): TS.SourceFile {
  const text = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

export type DeclarationEntry = {
  name: string;
  kind: SymbolKind;
  node: TS.Node;
};

// A re-export the barrel walker follows. `names` maps the name in the target module to the name this file exports it as.
export type ExportForward =
  | { kind: "wildcard"; specifier: string }
  | { kind: "named"; specifier: string; names: { sourceName: string; exportedName: string }[] };

// Everything one file exports: declarations it owns (keyed by exported name — several entries means overloads or
// declaration merging), and re-exports to follow.
export type FileExports = {
  declarations: Map<string, DeclarationEntry[]>;
  forwards: ExportForward[];
};

function isExported(ts: typeof TS, node: TS.Node): boolean {
  return (ts.getCombinedModifierFlags(node as TS.Declaration) & ts.ModifierFlags.Export) !== 0;
}

// Named top-level declarations in one statement (a variable statement can declare several).
function declarationsIn(ts: typeof TS, statement: TS.Statement): DeclarationEntry[] {
  if (ts.isFunctionDeclaration(statement) && statement.name) return [{ name: statement.name.text, kind: "function", node: statement }];
  if (ts.isClassDeclaration(statement) && statement.name) return [{ name: statement.name.text, kind: "class", node: statement }];
  if (ts.isInterfaceDeclaration(statement)) return [{ name: statement.name.text, kind: "interface", node: statement }];
  if (ts.isTypeAliasDeclaration(statement)) return [{ name: statement.name.text, kind: "type", node: statement }];
  if (ts.isEnumDeclaration(statement)) return [{ name: statement.name.text, kind: "enum", node: statement }];
  if (ts.isVariableStatement(statement)) {
    const kind = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 ? "const" : "variable";
    return statement.declarationList.declarations
      .filter((decl) => ts.isIdentifier(decl.name))
      .map((decl) => ({ name: (decl.name as TS.Identifier).text, kind, node: statement }));
  }
  return [];
}

// Appends unless already present — `export declare class A {}` followed by a redundant `export { A }` is one declaration.
function addTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

// Builds a file's export table: declarations it owns, plus `export * from` / `export { A } from` re-exports.
export function getFileExports(ts: typeof TS, sourceFile: TS.SourceFile): FileExports {
  const declarations = new Map<string, DeclarationEntry[]>();
  const forwards: ExportForward[] = [];

  for (const statement of sourceFile.statements) {
    if (isExported(ts, statement)) {
      for (const entry of declarationsIn(ts, statement)) addTo(declarations, entry.name, entry);
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;

    if (!statement.exportClause) {
      forwards.push({ kind: "wildcard", specifier });
    } else if (ts.isNamedExports(statement.exportClause)) {
      const names = statement.exportClause.elements.map((el) => ({ sourceName: (el.propertyName ?? el.name).text, exportedName: el.name.text }));
      if (names.length > 0) forwards.push({ kind: "named", specifier, names });
    }
  }

  return { declarations, forwards };
}
