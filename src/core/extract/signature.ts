import type ts from "typescript";

// `getText()` excludes a node's own leading JSDoc but not JSDoc nested inside its span (a class's members carry theirs along) — verified: BadGatewayException's raw text was 1301 chars, 139 after stripping `/** */` blocks throughout.
export function extractSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const raw = node.getText(sourceFile).replace(/\/\*\*[\s\S]*?\*\//g, "");
  return raw.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}
