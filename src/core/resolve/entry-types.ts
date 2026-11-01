import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EntryResolution, FoundPackage } from "./types.ts";

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

// A package-relative path to a real file, or undefined — a directory or missing path is never an entry point.
function fileAt(packageDir: string, relativePath: string): string | undefined {
  const candidate = join(packageDir, relativePath);
  return isFile(candidate) ? candidate : undefined;
}

// The declaration file beside a JS entry: .js -> .d.ts, .mjs -> .d.mts, .cjs -> .d.cts. An extensionless
// path (`"main": "./lib"`) gets Node's own fallbacks: <path>.d.ts, then <path>/index.d.ts.
function siblingDts(packageDir: string, jsPath: string): string | undefined {
  const ext = /\.([mc]?)js$/.exec(jsPath);
  if (ext) return fileAt(packageDir, `${jsPath.slice(0, -ext[0].length)}.d.${ext[1]}ts`);
  return fileAt(packageDir, `${jsPath}.d.ts`) ?? fileAt(packageDir, join(jsPath, "index.d.ts"));
}

// Scoped names flatten for the @types/* convention: @nestjs/common -> nestjs__common.
function flattenScopedName(name: string): string {
  return name.startsWith("@") ? name.slice(1).replace("/", "__") : name;
}

// Message shown when a package is found but ships no type declarations.
export function describeUnusablePackage(name: string): string {
  return `"${name}" is installed but ships no type declarations. Try \`npm i -D @types/${flattenScopedName(name)}\`.`;
}

// Message shown when a package is found but its package.json can't be used at all.
export function describeInvalidManifest(name: string, reason: string): string {
  return `"${name}" is installed but its ${reason}. Try reinstalling it.`;
}

// The "." target of an exports map. Node treats an object with no "."-prefixed key as the conditions for "." itself.
function rootExportTarget(exportsField: unknown): unknown {
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) return exportsField;
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith("."))) return exportsField;
  return Object.hasOwn(exportsField, ".") ? (exportsField as Record<string, unknown>)["."] : undefined;
}

type ExportCandidate = { path: string; isTypes: boolean };

// Flattens an exports target — a string, a fallback array, or nested condition objects (`{ import: { types, default } }`)
// — into candidate paths in priority order. A `types` condition is visited first at every level; any string reached
// under one, or ending in .d.ts/.d.mts/.d.cts, is a declaration file rather than a JS entry.
function collectExportCandidates(target: unknown, underTypes: boolean, out: ExportCandidate[]): void {
  if (typeof target === "string") {
    out.push({ path: target, isTypes: underTypes || /\.d\.[mc]?ts$/.test(target) });
  } else if (Array.isArray(target)) {
    for (const item of target) collectExportCandidates(item, underTypes, out);
  } else if (target !== null && typeof target === "object") {
    const conditions = target as Record<string, unknown>;
    if (Object.hasOwn(conditions, "types")) collectExportCandidates(conditions.types, true, out);
    for (const [condition, value] of Object.entries(conditions)) {
      if (condition !== "types") collectExportCandidates(value, underTypes, out);
    }
  }
}

// Resolves a package's .d.ts entry point by trying four cases in order: explicit types field, exports-map types condition, exports/main sibling inference, then a @types/* fallback.
export function resolveEntryTypes(found: FoundPackage): EntryResolution {
  const { manifest, packageDir } = found;

  // 1. Explicit types/typings field.
  const explicit = manifest.types ?? manifest.typings;
  if (explicit) {
    const candidate = fileAt(packageDir, explicit);
    if (candidate) return { found: true, entryFile: candidate, resolutionCase: 1 };
  }

  // 2 & 3. exports map — a types condition (case 2), or sibling inference
  // from whatever JS entry the map does specify (case 3).
  if (manifest.exports !== undefined) {
    const candidates: ExportCandidate[] = [];
    collectExportCandidates(rootExportTarget(manifest.exports), false, candidates);

    for (const { path } of candidates.filter((c) => c.isTypes)) {
      const candidate = fileAt(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, resolutionCase: 2 };
    }
    for (const { path } of candidates.filter((c) => !c.isTypes)) {
      const candidate = siblingDts(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, resolutionCase: 3 };
    }
  } else {
    // No exports map at all: fall back to "main", defaulting to Node's own implicit "./index.js".
    const mainField = manifest.main ?? "./index.js";
    const candidate = siblingDts(packageDir, mainField);
    if (candidate) return { found: true, entryFile: candidate, resolutionCase: 3 };
  }

  // 4. @types/* fallback.
  const typesCandidate = join(found.nodeModulesDir, "@types", flattenScopedName(found.name), "index.d.ts");
  if (isFile(typesCandidate)) return { found: true, entryFile: typesCandidate, resolutionCase: 4 };

  return { found: false };
}
