import type ts from "typescript";

// `node.getText(sourceFile)` already excludes the node's own *leading* JSDoc
// by default (Node.getStart()'s includeJsDocComment defaults to false) —
// verified against Injectable, which comes back as exactly
// `export declare function Injectable(options?: InjectableOptions): ClassDecorator;`.
// It does NOT exclude JSDoc nested *inside* the node's own span — a class or
// interface's body is part of its text, and so are its members' individual
// doc comments. Verified against real data: BadGatewayException's raw text
// (member JSDoc included) was 1301 chars; SPEC.md §3 calls for "JSDoc lines
// stripped" without qualifying "leading only", and 1301 chars of mostly
// documentation is not what a "signature" field is for. Stripping `/** */`
// blocks throughout (not just `/* */`, which real .d.ts output never uses
// for anything else) brings it to 139. "Single line where possible" then
// collapses any remaining incidental multi-line formatting; the render layer
// wraps for display, since a legitimately large member list (HttpStatus's 58
// enum members) still won't fit unwrapped regardless.
export function extractSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const raw = node.getText(sourceFile).replace(/\/\*\*[\s\S]*?\*\//g, "");
  return raw.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}
