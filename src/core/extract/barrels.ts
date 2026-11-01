import { existsSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isContained } from "../contain.ts";
import type { DeclarationEntry, FileExports } from "./parse.ts";
import { getFileExports, parseSourceFile } from "./parse.ts";
import type { JsDocResult } from "./jsdoc.ts";
import { extractJsDoc } from "./jsdoc.ts";
import { extractSignature } from "./signature.ts";
import { sanitizeExtractedText } from "./sanitize.ts";
import { loadTypeScript } from "./typescript-loader.ts";
import type { SymbolRecord } from "./types.ts";
import type TS from "typescript";

// Resolves a barrel's export specifier (written with .js for ESM) to a real .d.ts path, refusing anything outside
// packageRoot. A specifier can also be a bare cross-package import (e.g. "@scope/other-pkg", re-exporting a peer
// dependency's own exports) rather than a relative path within this package — that's out of scope for a single
// package's barrel walk, and correctly falls through the existsSync check below rather than resolving to a bogus,
// nonexistent nested path that would crash the caller.
function resolveModuleSpecifier(fromDir: string, specifier: string, packageRoot: string): string | undefined {
  // .js -> .d.ts, .mjs -> .d.mts, .cjs -> .d.cts; an extensionless specifier gets .d.ts.
  const ext = /\.([mc]?)js$/.exec(specifier);
  const withoutExt = ext ? specifier.slice(0, -ext[0].length) : specifier;
  const direct = join(fromDir, `${withoutExt}.d.${ext?.[1] ?? ""}ts`);
  const resolved = existsSync(direct) ? direct : join(fromDir, withoutExt, "index.d.ts");
  if (!existsSync(resolved) || !statSync(resolved).isFile()) return undefined;
  return isContained(packageRoot, resolved) ? resolved : undefined;
}

// Function overloads become one record (ADR-0011): one signature line per overload, the first documented overload's
// prose, and the union of every overload's tags (@param deduplicated by parameter name) and @see links.
function mergeOverloadDocs(docs: JsDocResult[]): JsDocResult {
  const primary = docs.find((d) => d.doc.length > 0) ?? docs[0]!;
  const tags: JsDocResult["tags"] = [];
  const tagKeys = new Set<string>();
  const see: JsDocResult["see"] = [];
  const seeUrls = new Set<string>();

  for (const result of docs) {
    for (const tag of result.tags) {
      const key = tag.name === "param" ? `param\0${tag.text.split(" ")[0]}` : `${tag.name}\0${tag.text}`;
      if (tagKeys.has(key)) continue;
      tagKeys.add(key);
      tags.push(tag);
    }
    for (const link of result.see) {
      if (seeUrls.has(link.url)) continue;
      seeUrls.add(link.url);
      see.push(link);
    }
  }

  return { doc: primary.doc, tags, see, isPublicApi: docs.some((d) => d.isPublicApi) };
}

function buildSymbolRecord(
  ts: typeof TS,
  name: string,
  entries: DeclarationEntry[],
  sourceFile: TS.SourceFile,
  filePath: string,
  packageRoot: string,
): SymbolRecord {
  // Same-name declarations that aren't all function overloads (declaration merging) keep the last one, as before.
  const isOverloadSet = entries.length > 1 && entries.every((e) => e.kind === "function");
  const used = isOverloadSet ? entries : [entries[entries.length - 1]!];

  const { doc, tags, see, isPublicApi } = isOverloadSet ? mergeOverloadDocs(used.map((e) => extractJsDoc(ts, e.node))) : extractJsDoc(ts, used[0]!.node);
  const signature = used.map((e) => extractSignature(e.node, sourceFile)).join("\n");
  const { line } = sourceFile.getLineAndCharacterOfPosition(used[0]!.node.getStart(sourceFile));

  return {
    name,
    kind: used[0]!.kind,
    signature: sanitizeExtractedText(signature),
    doc: sanitizeExtractedText(doc),
    tags: tags.map((tag) => ({ name: tag.name, text: sanitizeExtractedText(tag.text) })),
    see: see.map((link) => ({ text: sanitizeExtractedText(link.text), url: sanitizeExtractedText(link.url) })),
    isPublicApi,
    file: relative(packageRoot, filePath),
    line: line + 1, // 1-based
  };
}

// What a visit asks a file for: everything it exports, or specific names — keyed by the name *this file* exports,
// mapped to the name(s) the record should finally carry (`export { Foo as Bar }` asks for Foo, records Bar).
type ExportRequest = "all" | Map<string, string[]>;

// Walks a package's barrel graph from its entry .d.ts, collecting every exported symbol; the only place `typescript` actually loads.
// `packageRoot` is the package directory (EntryResolution.packageRoot): no file outside it is ever read, and each
// record's `file` is relative to it.
export async function extractPackage(entryFile: string, packageRoot: string): Promise<SymbolRecord[]> {
  const ts = await loadTypeScript();
  if (!isContained(packageRoot, entryFile)) return [];

  const parsed = new Map<string, { sourceFile: TS.SourceFile; exports: FileExports }>();
  const records = new Map<string, SymbolRecord>();
  // Termination: an "all" visit happens once per file; a named visit once per (file, name, final name) — tracking
  // the file alone dropped names when the same file was reached twice with different name filters.
  const visitedAll = new Set<string>();
  const visitedNames = new Set<string>();

  function load(filePath: string) {
    let entry = parsed.get(filePath);
    if (!entry) {
      const sourceFile = parseSourceFile(ts, filePath);
      entry = { sourceFile, exports: getFileExports(ts, sourceFile) };
      parsed.set(filePath, entry);
    }
    return entry;
  }

  function pending(filePath: string, request: ExportRequest): ExportRequest | undefined {
    if (request === "all") {
      if (visitedAll.has(filePath)) return undefined;
      visitedAll.add(filePath);
      return "all";
    }
    const remaining = new Map<string, string[]>();
    for (const [name, finals] of request) {
      for (const finalName of finals) {
        // An earlier "all" visit already produced every name under its own name; only aliases are still owed.
        if (finalName === name && visitedAll.has(filePath)) continue;
        const key = `${filePath}\0${name}\0${finalName}`;
        if (visitedNames.has(key)) continue;
        visitedNames.add(key);
        const list = remaining.get(name) ?? [];
        list.push(finalName);
        remaining.set(name, list);
      }
    }
    return remaining.size > 0 ? remaining : undefined;
  }

  function visit(filePath: string, rawRequest: ExportRequest): void {
    const request = pending(filePath, rawRequest);
    if (!request) return;

    const { sourceFile, exports } = load(filePath);

    for (const [name, entries] of exports.declarations) {
      const finals = request === "all" ? [name] : (request.get(name) ?? []);
      for (const finalName of finals) {
        // First occurrence wins, so a name reachable through several barrels is recorded once.
        if (!records.has(finalName)) records.set(finalName, buildSymbolRecord(ts, finalName, entries, sourceFile, filePath, packageRoot));
      }
    }

    const fileDir = dirname(filePath);
    for (const forward of exports.forwards) {
      const targetFile = resolveModuleSpecifier(fileDir, forward.specifier, packageRoot);
      if (!targetFile) continue;

      if (forward.kind === "wildcard") {
        visit(targetFile, request);
        continue;
      }

      const subRequest = new Map<string, string[]>();
      for (const { sourceName, exportedName } of forward.names) {
        const finals = request === "all" ? [exportedName] : (request.get(exportedName) ?? []);
        if (finals.length > 0) subRequest.set(sourceName, [sourceName]);
      }
      if (subRequest.size > 0) visit(targetFile, subRequest);
    }
  }

  visit(entryFile, "all");
  return [...records.values()];
}
