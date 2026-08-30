import type { marked as MarkedSingleton } from "marked";

// Mirrors typescript-loader.ts — the one place `marked` is dynamically imported; typed via `typeof MarkedSingleton`, not `Marked`, since the singleton export isn't assignable to `Marked<string, string>`.
export async function loadMarked(): Promise<typeof MarkedSingleton> {
  const mod = await import("marked");
  return mod.marked;
}
