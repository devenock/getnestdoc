import type { marked as MarkedSingleton } from "marked";

// Mirrors core/extract/typescript-loader.ts exactly, same reason: `marked` is
// a runtime dependency of the `nest-doc update` path only, and must not load
// on every CLI invocation. This is the one place the dynamic import happens;
// everything else in nest/update/ takes the `marked` singleton as a
// parameter (typed via `typeof MarkedSingleton`, not the `Marked` class —
// the singleton export's own shape, verified against the package's .d.ts,
// isn't structurally assignable to `Marked<string, string>`).
export async function loadMarked(): Promise<typeof MarkedSingleton> {
  const mod = await import("marked");
  return mod.marked;
}
