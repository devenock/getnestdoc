import { readFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors SPEC.md §2. Defined here (not scripts/lib/) because this is the
// runtime consumer — scripts/lib/aliases-types.ts imports it back so build
// and runtime share one definition, same as src/nest/guides/types.ts.
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
