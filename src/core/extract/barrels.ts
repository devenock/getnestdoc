import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isContained } from "../contain.ts";
import { resolveEntryTypes } from "../resolve/entry-types.ts";
import { findPackageDir } from "../resolve/find-package.ts";
import type { DeclarationEntry, FileExports } from "./parse.ts";
import { getFileExports, parseSourceFile } from "./parse.ts";
import type { JsDocResult } from "./jsdoc.ts";
import { extractJsDoc } from "./jsdoc.ts";
import { extractSignature } from "./signature.ts";
import { sanitizeSymbolRecord } from "./sanitize.ts";
import { loadTypeScript } from "./typescript-loader.ts";
import type { SymbolRecord } from "./types.ts";
import type TS from "typescript";

// Resolves a relative export specifier (written with .js for ESM) to a real .d.ts path, refusing anything outside packageRoot.
function resolveRelativeSpecifier(fromDir: string, specifier: string, packageRoot: string): string | undefined {
  // .js -> .d.ts, .mjs -> .d.mts, .cjs -> .d.cts; an extensionless specifier gets .d.ts.
  const ext = /\.([mc]?)js$/.exec(specifier);
  const withoutExt = ext ? specifier.slice(0, -ext[0].length) : specifier;
  const direct = join(fromDir, `${withoutExt}.d.${ext?.[1] ?? ""}ts`);
  const resolved = existsSync(direct) ? direct : join(fromDir, withoutExt, "index.d.ts");
  if (!existsSync(resolved) || !statSync(resolved).isFile()) return undefined;
  return isContained(packageRoot, resolved) ? resolved : undefined;
}

// A bare package name exactly as npm allows one — no subpath, no "."/".." segment, no "node:" prefix — so a bare specifier can only ever name a package directory.
const PACKAGE_NAME_RE = /^(?:@[a-zA-Z0-9~-][\w.~-]*\/)?[a-zA-Z0-9~-][\w.~-]*$/;

// The package a file belongs to: every file read is contained by `root`; `label` names a dependency reached through a bare re-export.
type Scope = { root: string; label?: string };

// Follows a bare re-export (`export { getQueueToken } from "@nestjs/bull-shared"`) into the installed dependency, found Node-style from the re-exporting file's real path (so pnpm's store layout resolves too).
function resolveBareSpecifier(fromDir: string, specifier: string): { entryFile: string; scope: Scope } | undefined {
  if (!PACKAGE_NAME_RE.test(specifier)) return undefined;
  let realDir: string;
  try {
    realDir = realpathSync(fromDir);
  } catch {
    return undefined;
  }
  const found = findPackageDir(specifier, realDir);
  if (!found || found.manifestError) return undefined;
  const entry = resolveEntryTypes(found);
  return entry.found ? { entryFile: entry.entryFile, scope: { root: entry.packageRoot, label: specifier } } : undefined;
}

function resolveModuleSpecifier(fromDir: string, specifier: string, scope: Scope): { file: string; scope: Scope } | undefined {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const file = resolveRelativeSpecifier(fromDir, specifier, scope.root);
    return file ? { file, scope } : undefined;
  }
  const bare = resolveBareSpecifier(fromDir, specifier);
  return bare ? { file: bare.entryFile, scope: bare.scope } : undefined;
}

// Merges same-name declarations into one record: the first documented declaration's prose, plus every declaration's tags (@param deduplicated by name) and @see links.
function mergeDeclarationDocs(docs: JsDocResult[]): JsDocResult {
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
  scope: Scope,
): SymbolRecord {
  // Overloads and declaration merging alike (`abstract class Cache {}` + `interface Cache …`): every declaration's signature, one per line. The kind is the first value declaration's — the class, function, enum, or const a user actually writes — else the first.
  const { doc, tags, see, isPublicApi } = entries.length > 1 ? mergeDeclarationDocs(entries.map((e) => extractJsDoc(ts, e.node))) : extractJsDoc(ts, entries[0]!.node);
  const signature = entries.map((e) => extractSignature(e.node, sourceFile)).join("\n");
  const primary = entries.find((e) => e.kind !== "interface" && e.kind !== "type") ?? entries[0]!;
  const { line } = sourceFile.getLineAndCharacterOfPosition(primary.node.getStart(sourceFile));

  return sanitizeSymbolRecord({
    name,
    kind: primary.kind,
    signature,
    doc,
    tags,
    see,
    isPublicApi,
    file: scope.label ? `${scope.label}/${relative(scope.root, filePath)}` : relative(scope.root, filePath),
    line: line + 1, // 1-based
  });
}

// What a visit asks a file for: everything, or specific names keyed by the name that file exports, mapped to the name(s) the record finally carries (`export { Foo as Bar }` asks for Foo, records Bar).
// "star" is what `export * from` asks for: everything except `default`, which a wildcard re-export never carries.
type ExportRequest = "all" | "star" | Map<string, string[]>;

// Walks a package's barrel graph from its entry .d.ts, collecting every exported symbol; the only place `typescript` actually loads. `packageRoot` bounds every file read from the package itself, and each record's `file` is relative to it (prefixed with the dependency's name for a symbol re-exported from one).
export async function extractPackage(entryFile: string, packageRoot: string): Promise<SymbolRecord[]> {
  const ts = await loadTypeScript();
  if (!isContained(packageRoot, entryFile)) return [];

  const parsed = new Map<string, { sourceFile: TS.SourceFile; exports: FileExports }>();
  const records = new Map<string, SymbolRecord>();
  // An "all" visit runs once per file, a named visit once per (file, name, final name) — per-file tracking alone drops names when a file is reached twice with different filters.
  const visitedAll = new Set<string>();
  const visitedStar = new Set<string>();
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
    if (request === "star") {
      if (visitedAll.has(filePath) || visitedStar.has(filePath)) return undefined;
      visitedStar.add(filePath);
      return "star";
    }
    const remaining = new Map<string, string[]>();
    for (const [name, finals] of request) {
      for (const finalName of finals) {
        // An earlier "all"/"star" visit already produced the name under its own name; only aliases are still owed.
        if (finalName === name && (visitedAll.has(filePath) || (name !== "default" && visitedStar.has(filePath)))) continue;
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

  function visit(filePath: string, rawRequest: ExportRequest, scope: Scope): void {
    const request = pending(filePath, rawRequest);
    if (!request) return;

    const { sourceFile, exports } = load(filePath);

    // The names this file is asked to export, mapped to the names they're recorded under.
    const finalsFor = (name: string): string[] => (request === "all" ? [name] : request === "star" ? (name === "default" ? [] : [name]) : (request.get(name) ?? []));

    for (const [name, entries] of exports.declarations) {
      const finals = finalsFor(name);
      for (const finalName of finals) {
        // First occurrence wins, so a name reachable through several barrels is recorded once.
        if (!records.has(finalName)) records.set(finalName, buildSymbolRecord(ts, finalName, entries, sourceFile, filePath, scope));
      }
    }

    const fileDir = dirname(filePath);
    for (const forward of exports.forwards) {
      const target = resolveModuleSpecifier(fileDir, forward.specifier, scope);
      if (!target) continue;

      if (forward.kind === "wildcard") {
        const starRequest = request === "all" || request === "star" ? "star" : new Map([...request].filter(([name]) => name !== "default"));
        if (starRequest === "star" || starRequest.size > 0) visit(target.file, starRequest, target.scope);
        continue;
      }

      const subRequest = new Map<string, string[]>();
      for (const { sourceName, exportedName } of forward.names) {
        const finals = finalsFor(exportedName);
        if (finals.length > 0) subRequest.set(sourceName, [...(subRequest.get(sourceName) ?? []), ...finals]);
      }
      if (subRequest.size > 0) visit(target.file, subRequest, target.scope);
    }
  }

  visit(entryFile, "all", { root: packageRoot });
  return [...records.values()];
}
