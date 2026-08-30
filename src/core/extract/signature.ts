import type ts from "typescript";

// `node.getText(sourceFile)` already excludes leading JSDoc by default
// (Node.getStart()'s includeJsDocComment defaults to false) — verified
// against the real Injectable declaration, which comes back as exactly
// `export declare function Injectable(options?: InjectableOptions): ClassDecorator;`,
// matching ADR-0002's measurement. "Single line where possible" (SPEC.md §3)
// collapses any incidental multi-line formatting (object type literals that
// happened to wrap) into one line; the render layer wraps for display.
export function extractSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const raw = node.getText(sourceFile);
  return raw.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}
