import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { resolveRenderOptions, wrapText } from "../core/render/ansi.ts";
import { renderTokens } from "../core/render/markdown.ts";
import { suggest } from "../core/fuzzy.ts";
import { loadAliases } from "../nest/aliases.ts";
import { findGuide, loadGuides } from "../nest/guides/index.ts";
import { resolvePackageSymbols } from "../nest/symbols.ts";
import { getCacheDir } from "../core/cache/paths.ts";
import { clearCache } from "../core/cache/store.ts";
import type { SymbolRecord } from "../core/extract/types.ts";
import type { RenderOptions } from "../core/render/ansi.ts";

// Minimal — SPEC.md §4.1's full format (See also resolved through the alias
// table, column-aligned parameters, etc.) is Phase 8's job. This is just
// enough to prove the cache works: package/version header, signature with
// export/declare stripped and the trailing ";" dropped, wrapped doc body,
// raw @param tag text.
function renderSymbol(packageName: string, packageVersion: string, symbol: SymbolRecord, options: RenderOptions): string {
  const lines: string[] = [`${packageName}@${packageVersion}`, ""];

  const displaySignature = symbol.signature.replace(/^export\s+/, "").replace(/^declare\s+/, "").replace(/;$/, "");
  lines.push(displaySignature, "");

  if (symbol.doc) {
    for (const wrapped of wrapText(symbol.doc, Math.max(1, options.width - 4))) {
      lines.push(`    ${wrapped}`);
    }
    lines.push("");
  }

  const params = symbol.tags.filter((t) => t.name === "param");
  if (params.length > 0) {
    lines.push("  Parameters");
    for (const param of params) lines.push(`    ${param.text}`);
  }

  return lines.join("\n").replace(/\n+$/, "");
}

// SPEC.md §5 resolution order: exact slug (1), alias (2)... package.symbol
// (4). Steps 3 (bare scoped package -> index) and 5 (bare symbol/decorator)
// are Phase 8. Splits on the *first* dot — the one real package name with a
// dot in it, platform-socket.io, isn't part of the common.X shorthand table
// as anything other than its full scoped form, so this doesn't collide with
// PROMPTS.md's own worked example (common.Injectable).
function splitPackageSymbol(query: string): { packageQuery: string; symbolName: string } | undefined {
  const dotIndex = query.indexOf(".");
  if (dotIndex <= 0 || dotIndex === query.length - 1) return undefined;
  return { packageQuery: query.slice(0, dotIndex), symbolName: query.slice(dotIndex + 1) };
}

export function createProgram(dataDir: string): Command {
  const program = new Command();

  program
    .name("nest-doc")
    .description("A terminal documentation reader for NestJS.")
    .version(pkg.version, "--version", "output the version number")
    .argument("[query]", "guide slug, concept name, or package.Symbol, e.g. interceptors, providers, common.Injectable")
    .option("--js", "show JavaScript code samples instead of TypeScript")
    .option("--guide", "force guide resolution (the only guide-side resolution this version does)")
    .option("--clear-cache", "delete the extracted-symbol cache")
    .action(async (query: string | undefined, opts: { js?: boolean; guide?: boolean; clearCache?: boolean }) => {
      if (opts.clearCache) {
        clearCache(getCacheDir());
        return;
      }

      if (!query) {
        process.stderr.write("error: missing required argument 'query'\n");
        process.exitCode = 2;
        return;
      }

      const guidesFile = loadGuides(dataDir);
      const aliasFile = loadAliases(dataDir);
      const guide = findGuide(query, guidesFile, aliasFile);

      if (guide) {
        const renderOptions = { ...resolveRenderOptions(), js: opts.js === true };
        process.stdout.write(`${renderTokens(guide.tokens, renderOptions)}\n`);
        return;
      }

      const split = splitPackageSymbol(query);
      if (split) {
        const resolved = await resolvePackageSymbols(split.packageQuery, process.cwd());

        if (resolved.status === "unusable") {
          process.stderr.write(`${resolved.message}\n`);
          process.exitCode = 3;
          return;
        }

        if (resolved.status === "found") {
          const symbol = resolved.result.symbols.find((s) => s.name === split.symbolName);
          if (symbol) {
            const renderOptions = resolveRenderOptions();
            process.stdout.write(`${renderSymbol(resolved.result.packageName, resolved.result.packageVersion, symbol, renderOptions)}\n`);
            return;
          }
        }
        // Package not installed, or installed but the symbol name isn't
        // among its exports — both fall through to the generic miss below.
      }

      const candidates = [...Object.keys(guidesFile.guides), ...Object.keys(aliasFile.urlToSlug)];
      const suggestions = suggest(query, candidates);

      process.stderr.write(`No guide or symbol matches "${query}".\n`);
      if (suggestions.length > 0) {
        process.stderr.write("\nDid you mean?\n");
        for (const s of suggestions) process.stderr.write(`  nest-doc ${s}\n`);
      }
      process.exitCode = 1;
    });

  return program;
}
