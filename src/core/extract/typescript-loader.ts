import type TS from "typescript";

// ADR-0001: guide lookups must never pay to load `typescript`. Verified: a static import anywhere in the reachable module graph is hoisted and eagerly evaluated regardless of dynamic-import wrapping — only a dynamic import of "typescript" itself defers it, so every function that touches the compiler API takes `ts` as a parameter instead of importing it, and this is the one place the dynamic import happens.
export async function loadTypeScript(): Promise<typeof TS> {
  const mod = await import("typescript");
  return mod.default;
}
