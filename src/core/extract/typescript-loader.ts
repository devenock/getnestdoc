import type TS from "typescript";

// `typescript` is a runtime dependency but must be lazy-loaded — ADR-0001:
// guide lookups never pay for it. Verified empirically (not assumed): in an
// ESM bundle, a *static* `import ts from "typescript"` gets hoisted and
// eagerly evaluated at startup by ESM's own module semantics, even when the
// module containing that import is itself only reached through a dynamic
// `import()` elsewhere — wrapping doesn't help, only a dynamic import of
// "typescript" itself actually defers loading it. That's why every function
// in this directory that touches the compiler API takes `ts` as a parameter
// instead of importing it directly — this is the one place the dynamic
// import happens.
export async function loadTypeScript(): Promise<typeof TS> {
  const mod = await import("typescript");
  return mod.default;
}
