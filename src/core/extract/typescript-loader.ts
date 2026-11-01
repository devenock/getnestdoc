import type TS from "typescript";

// The only typescript release with the JS Compiler API this tool runs on, named in the errors below.
const REQUIRED_TYPESCRIPT = "6.0.3";

// typescript@7 (the native Go port) imports fine but exports only `version`/`versionMajorMinor`; this turns that into a clear error instead of "createSourceFile is not a function".
export function assertCompilerApi(ts: Partial<typeof TS>): asserts ts is typeof TS {
  if (typeof ts.createSourceFile !== "function") {
    throw new Error(
      `typescript ${ts.version ?? "(unknown version)"} has no JavaScript Compiler API (7.x is the native port), which symbol lookups need. ` +
        `getnestdoc requires typescript ${REQUIRED_TYPESCRIPT} — reinstall getnestdoc rather than upgrading typescript.`,
    );
  }
}

// Dynamically imports typescript so guide-only lookups never pay to load it; failures name the fix rather than surfacing a bare resolution error.
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
