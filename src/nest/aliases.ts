import { readFileSync } from "node:fs";
import { join } from "node:path";

// The shape of the built alias table: docs.nestjs.com URLs mapped to guide slugs.
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
