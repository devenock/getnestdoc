import type TS from "typescript";

// The only release line this tool can run on (ADR-0001) — named in the errors below so they say what to install.
const REQUIRED_TYPESCRIPT = "6.0.3";

// typescript@7 is the native Go port: it installs and imports fine but exports only `version`/`versionMajorMinor`, so
// without this check the first symbol lookup dies with "createSourceFile is not a function" (ADR-0001).
export function assertCompilerApi(ts: Partial<typeof TS>): asserts ts is typeof TS {
  if (typeof ts.createSourceFile !== "function") {
    throw new Error(
      `typescript ${ts.version ?? "(unknown version)"} has no JavaScript Compiler API (7.x is the native port), which symbol lookups need. ` +
        `getnestdoc requires typescript ${REQUIRED_TYPESCRIPT} — reinstall getnestdoc rather than upgrading typescript.`,
    );
  }
}

// Dynamically imports typescript so guide-only lookups never pay to load it; the only place this module is imported.
// Failures carry a message naming the fix rather than a bare module-resolution error; guide lookups never reach here.
export async function loadTypeScript(): Promise<typeof TS> {
  let mod: { default: Partial<typeof TS> };
  try {
    mod = (await import("typescript")) as { default: Partial<typeof TS> };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`symbol lookups need typescript ${REQUIRED_TYPESCRIPT}, which failed to load (${detail}). Reinstall getnestdoc.`, { cause: err });
  }
  assertCompilerApi(mod.default);
  return mod.default;
}
