import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { resolveRenderOptions } from "../core/render/ansi.ts";
import { renderTokens } from "../core/render/markdown.ts";
import { suggest } from "../core/fuzzy.ts";
import { loadAliases } from "../nest/aliases.ts";
import { findGuide, loadGuides } from "../nest/guides/index.ts";

export function createProgram(dataDir: string): Command {
  const program = new Command();

  program
    .name("nest-doc")
    .description("A terminal documentation reader for NestJS.")
    .version(pkg.version, "--version", "output the version number")
    .argument("<query>", "guide slug or concept name, e.g. interceptors, providers")
    .option("--js", "show JavaScript code samples instead of TypeScript")
    .option("--guide", "force guide resolution (the only resolution this version does)")
    .action((query: string, opts: { js?: boolean; guide?: boolean }) => {
      const guidesFile = loadGuides(dataDir);
      const aliasFile = loadAliases(dataDir);
      const guide = findGuide(query, guidesFile, aliasFile);

      if (!guide) {
        const candidates = [...Object.keys(guidesFile.guides), ...Object.keys(aliasFile.urlToSlug)];
        const suggestions = suggest(query, candidates);

        process.stderr.write(`No guide or symbol matches "${query}".\n`);
        if (suggestions.length > 0) {
          process.stderr.write("\nDid you mean?\n");
          for (const s of suggestions) process.stderr.write(`  nest-doc ${s}\n`);
        }
        process.exitCode = 1;
        return;
      }

      const renderOptions = { ...resolveRenderOptions(), js: opts.js === true };
      process.stdout.write(`${renderTokens(guide.tokens, renderOptions)}\n`);
    });

  return program;
}
