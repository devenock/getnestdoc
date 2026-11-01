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

// Everything one file exports: its own declarations keyed by exported name (several entries means overloads or declaration merging), and re-exports to follow.
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

// Builds a file's export table, covering `export { A as B } from`, local export lists (`declare class A {}; export { A as B }`, how bundled declaration files export), and `import { A } from; export { A }`.
export function getFileExports(ts: typeof TS, sourceFile: TS.SourceFile): FileExports {
  const local = new Map<string, DeclarationEntry[]>();
  const declarations = new Map<string, DeclarationEntry[]>();
  const imports = new Map<string, { specifier: string; importedName: string }>();
  const forwards: ExportForward[] = [];

  for (const statement of sourceFile.statements) {
    for (const entry of declarationsIn(ts, statement)) {
      addTo(local, entry.name, entry);
      if (isExported(ts, statement)) addTo(declarations, entry.name, entry);
    }

    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, { specifier: statement.moduleSpecifier.text, importedName: (element.propertyName ?? element.name).text });
        }
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : undefined;

    if (!statement.exportClause) {
      if (specifier !== undefined) forwards.push({ kind: "wildcard", specifier });
      continue;
    }
    // `export * as ns from` exports a namespace object, not individual symbols — not followed.
    if (!ts.isNamedExports(statement.exportClause)) continue;

    const names = statement.exportClause.elements.map((el) => ({ sourceName: (el.propertyName ?? el.name).text, exportedName: el.name.text }));
    if (specifier !== undefined) {
      if (names.length > 0) forwards.push({ kind: "named", specifier, names });
      continue;
    }

    // A local export list: each name is either a declaration in this file or an imported binding to follow.
    for (const { sourceName, exportedName } of names) {
      const entries = local.get(sourceName);
      if (entries) {
        for (const entry of entries) addTo(declarations, exportedName, entry);
        continue;
      }
      const imported = imports.get(sourceName);
      if (imported) forwards.push({ kind: "named", specifier: imported.specifier, names: [{ sourceName: imported.importedName, exportedName }] });
    }
  }

  return { declarations, forwards };
}
