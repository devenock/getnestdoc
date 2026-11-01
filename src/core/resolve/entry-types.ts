import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { isContained } from "../contain.ts";
import type { EntryResolution, FoundPackage } from "./types.ts";

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

// A package-relative path to a real file inside the package, or undefined — directories and anything a crafted field points outside the package are never entry points.
function fileAt(packageDir: string, relativePath: string): string | undefined {
  const candidate = join(packageDir, relativePath);
  return isFile(candidate) && isContained(packageDir, candidate) ? candidate : undefined;
}

// The declaration file beside a JS entry (.js -> .d.ts, .mjs -> .d.mts, .cjs -> .d.cts); an extensionless path gets Node's <path>.d.ts then <path>/index.d.ts fallbacks.
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

// Flattens an exports target (string, fallback array, or nested conditions) into candidates in priority order; a `types` condition is visited first at every level.
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
    if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 1 };
  }

  // 2 & 3. exports map — a types condition (case 2), or sibling inference
  // from whatever JS entry the map does specify (case 3).
  if (manifest.exports !== undefined) {
    const candidates: ExportCandidate[] = [];
    collectExportCandidates(rootExportTarget(manifest.exports), false, candidates);

    for (const { path } of candidates.filter((c) => c.isTypes)) {
      const candidate = fileAt(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 2 };
    }
    for (const { path } of candidates.filter((c) => !c.isTypes)) {
      const candidate = siblingDts(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 3 };
    }
  } else {
    // No exports map at all: fall back to "main", defaulting to Node's own implicit "./index.js".
    const mainField = manifest.main ?? "./index.js";
    const candidate = siblingDts(packageDir, mainField);
    if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 3 };
  }

  // 4. @types/* fallback.
  const typesCandidate = join(found.nodeModulesDir, "@types", flattenScopedName(found.name), "index.d.ts");
  if (isFile(typesCandidate)) return { found: true, entryFile: typesCandidate, packageRoot: dirname(typesCandidate), resolutionCase: 4 };

  return { found: false };
}

// The exports-map target for "./<subpath>", by Node's rules: an exact key wins, else the "*" pattern with the longest prefix, its match substituted into the target.
function subpathExportTarget(exportsField: unknown, subpath: string): unknown {
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) return undefined;
  const map = exportsField as Record<string, unknown>;
  const key = `./${subpath}`;
  if (Object.hasOwn(map, key)) return map[key];

  let best: { prefix: string; target: unknown; match: string } | undefined;
  for (const [pattern, target] of Object.entries(map)) {
    const star = pattern.indexOf("*");
    if (star === -1 || pattern.indexOf("*", star + 1) !== -1) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (key.length < prefix.length + suffix.length || !key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, target, match: key.slice(prefix.length, key.length - suffix.length) };
  }
  if (!best) return undefined;
  const substitute = (value: unknown): unknown =>
    typeof value === "string" ? value.split("*").join(best!.match)
    : Array.isArray(value) ? value.map(substitute)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v)]))
    : value;
  return substitute(best.target);
}

// Resolves the .d.ts for a subpath entry point (`@nestjs/platform-fastify/multipart`): through the exports map when there is one — which, as in Node, then bounds what's importable — else the legacy deep path beside the package root.
export function resolveSubpathTypes(found: FoundPackage, subpath: string): EntryResolution {
  const { manifest, packageDir } = found;
  if (manifest.exports !== undefined) {
    const candidates: ExportCandidate[] = [];
    collectExportCandidates(subpathExportTarget(manifest.exports, subpath), false, candidates);
    for (const { path } of candidates.filter((c) => c.isTypes)) {
      const candidate = fileAt(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 2 };
    }
    for (const { path } of candidates.filter((c) => !c.isTypes)) {
      const candidate = siblingDts(packageDir, path);
      if (candidate) return { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 3 };
    }
    return { found: false };
  }
  const candidate = siblingDts(packageDir, `./${subpath}`);
  return candidate ? { found: true, entryFile: candidate, packageRoot: packageDir, resolutionCase: 3 } : { found: false };
}

// The subpath entry points a package names explicitly in its exports map ("./multipart" -> "multipart"); "*" patterns and ./package.json are open-ended or not code, so they aren't listed.
export function listEntryPoints(manifest: FoundPackage["manifest"]): string[] {
  const exportsField = manifest.exports;
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) return [];
  return Object.keys(exportsField)
    .filter((key) => key.startsWith("./") && !key.includes("*") && key !== "./package.json")
    .map((key) => key.slice(2))
    .sort();
}
