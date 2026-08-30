import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { resolveRenderOptions } from "../core/render/ansi.ts";
import { renderTokens } from "../core/render/markdown.ts";
import { suggest } from "../core/fuzzy.ts";
import { loadAliases } from "../nest/aliases.ts";
import { findGuide, loadGuides } from "../nest/guides/index.ts";
import { resolvePackageSymbols } from "../nest/symbols.ts";
import { loadNameIndex, resolveBareSymbol } from "../nest/names.ts";
import { getCacheDir } from "../core/cache/paths.ts";
import { clearCache } from "../core/cache/store.ts";
import { renderSymbol } from "../nest/render-symbol.ts";
import { renderPackageIndex } from "../nest/render-package-index.ts";
import { runUpdate } from "../nest/update.ts";
import type { GuidesFile } from "../nest/guides/types.ts";
import type { AliasFile } from "../nest/aliases.ts";
import type { RenderOptions } from "../core/render/ansi.ts";

// SPEC.md §5 resolution order: exact guide slug (1), alias (2)... package.symbol
// (4). Splits on the *last* dot, not the first — platform-socket.io is a real
// published package name (and a real entry in package-scope.ts's shorthand
// table) with a literal "." in it, so "platform-socket.io.SomeExport" (or its
// scoped form, "@nestjs/platform-socket.io.SomeExport") must split into that
// whole string as the package and "SomeExport" as the symbol. A SymbolRecord
// name is always a plain identifier (core/extract reads it from
// node.name.text) and can never itself contain a dot, so the last dot is
// always the real split point, and this handles the single-dot common case
// ("common.Injectable") identically to the old first-dot logic.
function splitPackageSymbol(query: string): { packageQuery: string; symbolName: string } | undefined {
  const dotIndex = query.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === query.length - 1) return undefined;
  return { packageQuery: query.slice(0, dotIndex), symbolName: query.slice(dotIndex + 1) };
}

// ADR-0007's disambiguation table for a leading "@": name-with-slash is a
// scoped package, a single capitalised word is a decorator, anything else
// (a lowercase word, most commonly) has no defined meaning and is a usage
// error, not a guess.
type AtClassification = { kind: "package" } | { kind: "decorator"; name: string } | { kind: "invalid" };

function classifyAtQuery(query: string): AtClassification {
  const rest = query.slice(1);
  if (rest.includes("/")) return { kind: "package" };
  if (/^[A-Z][A-Za-z0-9]*$/.test(rest)) return { kind: "decorator", name: rest };
  return { kind: "invalid" };
}

async function renderPackageIndexForQuery(packageQuery: string, all: boolean, options: RenderOptions, cwd: string): Promise<{ output: string } | { error: string; exitCode: number } | undefined> {
  const resolved = await resolvePackageSymbols(packageQuery, cwd);
  if (resolved.status === "not-installed") return undefined;
  if (resolved.status === "unusable") return { error: resolved.message, exitCode: 3 };
  return { output: renderPackageIndex(resolved.result.packageName, resolved.result.packageVersion, resolved.result.symbols, all, options) };
}

function renderAmbiguous(name: string, packageNames: string[]): string {
  const lines = [`"${name}" is ambiguous — found in multiple packages:`, ""];
  for (const packageName of packageNames) lines.push(`  nest-doc ${packageName}.${name}`);
  lines.push("", "Run one of the above.");
  return lines.join("\n");
}

async function renderBareSymbolQuery(name: string, dataDir: string, cwd: string, guidesFile: GuidesFile, aliasFile: AliasFile, options: RenderOptions): Promise<{ output: string; exitCode: 0 | 1 } | undefined> {
  const resolved = await resolveBareSymbol(name, dataDir, cwd);
  if (resolved.status === "not-found") return undefined;
  if (resolved.status === "ambiguous") return { output: renderAmbiguous(name, resolved.packageNames), exitCode: 1 };
  if (resolved.status === "not-installed") {
    return { output: `"${resolved.name}" is exported by ${resolved.packageName}, which isn't installed here. Try \`npm i ${resolved.packageName}\`.`, exitCode: 0 };
  }
  return { output: renderSymbol(resolved.packageName, resolved.packageVersion, resolved.symbol, guidesFile, aliasFile, options), exitCode: 0 };
}

export function createProgram(dataDir: string): Command {
  const program = new Command();

  program
    .name("nest-doc")
    .description("A terminal documentation reader for NestJS.")
    .version(pkg.version, "--version", "output the version number")
    .argument("[query]", "guide slug, concept name, package name, package.Symbol, @Decorator, or bare symbol name")
    .option("--js", "show JavaScript code samples instead of TypeScript")
    .option("--guide", "force guide resolution (steps 1-2 only)")
    .option("--api", "force package/symbol resolution (steps 3-5 only)")
    .option("--all", "include non-public exports in a package index")
    .option("--clear-cache", "delete the extracted-symbol cache")
    .action(async (query: string | undefined, opts: { js?: boolean; guide?: boolean; api?: boolean; all?: boolean; clearCache?: boolean }) => {
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
      const cwd = process.cwd();
      const renderOptions = resolveRenderOptions();

      if (!opts.api) {
        const guide = findGuide(query, guidesFile, aliasFile);
        if (guide) {
          const guideRenderOptions = { ...renderOptions, js: opts.js === true };
          process.stdout.write(`${renderTokens(guide.tokens, guideRenderOptions)}\n`);
          return;
        }
      }

      if (!opts.guide) {
        // Step 4, package.symbol — tried first and independent of a leading
        // "@", since a scoped package's own name can precede the dot just as
        // well as its shorthand ("@nestjs/swagger.ApiProperty" and
        // "common.Injectable" are the same shape). Falls through (not a
        // miss) on no match: a dotted string that isn't an installed
        // package.symbol pair still isn't excluded from being a literal
        // bare name by anything in the spec.
        const split = splitPackageSymbol(query);
        if (split) {
          const resolved = await resolvePackageSymbols(split.packageQuery, cwd);

          if (resolved.status === "unusable") {
            process.stderr.write(`${resolved.message}\n`);
            process.exitCode = 3;
            return;
          }

          if (resolved.status === "found") {
            const symbol = resolved.result.symbols.find((s) => s.name === split.symbolName);
            if (symbol) {
              process.stdout.write(`${renderSymbol(resolved.result.packageName, resolved.result.packageVersion, symbol, guidesFile, aliasFile, renderOptions)}\n`);
              return;
            }
          }
        }

        if (query.startsWith("@")) {
          const classified = classifyAtQuery(query);

          if (classified.kind === "invalid") {
            const suggestions = suggest(query.slice(1), Object.keys(loadNameIndex(dataDir).names));
            process.stderr.write(`"${query}" is not a valid package (needs a "/") or decorator (needs a capitalised name).\n`);
            if (suggestions.length > 0) {
              process.stderr.write("\nDid you mean?\n");
              for (const s of suggestions) process.stderr.write(`  nest-doc @${s}\n`);
            }
            process.exitCode = 2;
            return;
          }

          if (classified.kind === "package") {
            const result = await renderPackageIndexForQuery(query, opts.all === true, renderOptions, cwd);
            if (result) {
              if ("error" in result) {
                process.stderr.write(`${result.error}\n`);
                process.exitCode = result.exitCode;
              } else {
                process.stdout.write(`${result.output}\n`);
              }
              return;
            }
            // Not installed — an @-prefixed scoped package has no other
            // possible meaning (ADR-0007's table), so this is a genuine miss,
            // not a fallthrough to bare-symbol resolution.
          } else {
            const bare = await renderBareSymbolQuery(classified.name, dataDir, cwd, guidesFile, aliasFile, renderOptions);
            if (bare) {
              process.stdout.write(`${bare.output}\n`);
              process.exitCode = bare.exitCode;
              return;
            }
          }
        } else {
          const indexResult = await renderPackageIndexForQuery(query, opts.all === true, renderOptions, cwd);
          if (indexResult) {
            if ("error" in indexResult) {
              process.stderr.write(`${indexResult.error}\n`);
              process.exitCode = indexResult.exitCode;
            } else {
              process.stdout.write(`${indexResult.output}\n`);
            }
            return;
          }

          const bare = await renderBareSymbolQuery(query, dataDir, cwd, guidesFile, aliasFile, renderOptions);
          if (bare) {
            process.stdout.write(`${bare.output}\n`);
            process.exitCode = bare.exitCode;
            return;
          }
        }
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

  program
    .command("update")
    .description("refresh the guide corpus from docs.nestjs.com (the only networked command)")
    .action(async () => {
      process.stdout.write("Fetching latest guides from docs.nestjs.com...\n");
      const result = await runUpdate(dataDir);
      process.stdout.write(`Updated: ${result.guideCount} guides, ${result.aliasCount} aliases (commit ${result.sourceCommit.slice(0, 7)}).\n`);
    });

  return program;
}
