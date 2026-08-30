import { readFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors SPEC.md §2 — defined here, not scripts/lib/, since this is the runtime consumer.
export type AliasFile = {
  version: 1;
  generatedAt: string;
  sourceCommit: string;
  urlToSlug: Record<string, string>;
};

export function loadAliases(dataDir: string): AliasFile {
  const raw = readFileSync(join(dataDir, "aliases.json"), "utf8");
  return JSON.parse(raw) as AliasFile;
}
