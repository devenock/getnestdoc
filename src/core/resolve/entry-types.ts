import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EntryResolution, ExportsCondition, FoundPackage } from "./types.ts";

function siblingDts(packageDir: string, jsPath: string): string | undefined {
  const candidate = join(packageDir, jsPath.replace(/\.js$/, ".d.ts"));
  return existsSync(candidate) ? candidate : undefined;
}

// Scoped names flatten for the @types/* convention: @nestjs/common -> nestjs__common.
function flattenScopedName(name: string): string {
  return name.startsWith("@") ? name.slice(1).replace("/", "__") : name;
}

// SPEC.md §5 exit code 3: "package found but unusable — ships no types."
export function describeUnusablePackage(name: string): string {
  return `"${name}" is installed but ships no type declarations. Try \`npm i -D @types/${flattenScopedName(name)}\`.`;
}

// ARCHITECTURE.md §4.3, four cases in order — verified against real fixtures, not the spec text alone: @nestjs/common@11/10 have neither an exports map nor a main field, so Node's implicit "./index.js" default has to run before the .js -> .d.ts sibling inference applies.
export function resolveEntryTypes(found: FoundPackage): EntryResolution {
  const { manifest, packageDir } = found;

  // 1. Explicit types/typings field.
  const explicit = manifest.types ?? manifest.typings;
  if (explicit) {
    const candidate = join(packageDir, explicit);
    if (existsSync(candidate)) return { found: true, entryFile: candidate, resolutionCase: 1 };
  }

  // 2 & 3. exports map — a types condition (case 2), or sibling inference
  // from whatever JS entry the map does specify (case 3).
  if (manifest.exports !== undefined) {
    const rootExport = typeof manifest.exports === "string" ? manifest.exports : manifest.exports["."];

    if (typeof rootExport === "string") {
      const candidate = siblingDts(packageDir, rootExport);
      if (candidate) return { found: true, entryFile: candidate, resolutionCase: 3 };
    } else if (rootExport && typeof rootExport === "object") {
      const condition = rootExport as ExportsCondition;
      if (condition.types) {
        const candidate = join(packageDir, condition.types);
        if (existsSync(candidate)) return { found: true, entryFile: candidate, resolutionCase: 2 };
      }
      const jsEntry = condition.require ?? condition.import ?? condition.default;
      if (jsEntry) {
        const candidate = siblingDts(packageDir, jsEntry);
        if (candidate) return { found: true, entryFile: candidate, resolutionCase: 3 };
      }
    }
  } else {
    // No exports map at all (content/@nestjs/common-11, -10): fall back to
    // "main", defaulting to Node's own implicit "./index.js".
    const mainField = manifest.main ?? "./index.js";
    const candidate = siblingDts(packageDir, mainField);
    if (candidate) return { found: true, entryFile: candidate, resolutionCase: 3 };
  }

  // 4. @types/* fallback.
  const typesCandidate = join(found.nodeModulesDir, "@types", flattenScopedName(found.name), "index.d.ts");
  if (existsSync(typesCandidate)) return { found: true, entryFile: typesCandidate, resolutionCase: 4 };

  return { found: false };
}
