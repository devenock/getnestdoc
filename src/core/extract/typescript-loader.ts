import type TS from "typescript";

// Dynamically imports typescript so guide-only lookups never pay to load it; the only place this module is imported.
export async function loadTypeScript(): Promise<typeof TS> {
  const mod = await import("typescript");
  return mod.default;
}
