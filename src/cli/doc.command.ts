import { Command, Option } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { resolveRenderOptions } from "../core/render/ansi.ts";
import { renderTokens } from "../core/render/markdown.ts";
import { suggest } from "../core/fuzzy.ts";
import { writeOutput } from "../core/pager.ts";
import { loadAliases } from "../nest/aliases.ts";
import { findGuideSection, loadGuides } from "../nest/guides/index.ts";
import { resolvePackageSymbolsOrBundled } from "../nest/symbols.ts";
import { loadNameIndex, resolveBareSymbol } from "../nest/names.ts";
import { getCacheDir } from "../core/cache/paths.ts";
import { clearCache } from "../core/cache/store.ts";
import { renderSymbol } from "../nest/render-symbol.ts";
import { renderPackageIndex } from "../nest/render-package-index.ts";
import { runUpdate } from "../nest/update.ts";
import { shorthandFor } from "../nest/package-scope.ts";
import type { GuidesFile } from "../nest/guides/types.ts";
import type { AliasFile } from "../nest/aliases.ts";
import type { RenderOptions } from "../core/render/ansi.ts";

// Splits on the *last* dot, not the first — platform-socket.io is a real package name with a literal "." in it, and a SymbolRecord name never contains one.
function splitPackageSymbol(query: string): { packageQuery: string; symbolName: string } | undefined {
  const dotIndex = query.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === query.length - 1) return undefined;
  return { packageQuery: query.slice(0, dotIndex), symbolName: query.slice(dotIndex + 1) };
}

// After a leading "@": a name with a slash is a package, a capitalised word is a decorator, anything else is a usage error.
type AtClassification = { kind: "package" } | { kind: "decorator"; name: string } | { kind: "invalid" };

function classifyAtQuery(query: string): AtClassification {
  const rest = query.slice(1);
  if (rest.includes("/")) return { kind: "package" };
  if (/^[A-Z][A-Za-z0-9]*$/.test(rest)) return { kind: "decorator", name: rest };
  return { kind: "invalid" };
}

async function renderPackageIndexForQuery(packageQuery: string, all: boolean, options: RenderOptions, cwd: string, dataDir: string): Promise<{ output: string } | { error: string; exitCode: number } | { notInstalled: true; packageName: string } | undefined> {
  const resolved = await resolvePackageSymbolsOrBundled(packageQuery, cwd, dataDir);
  if (resolved.status === "not-installed") return { notInstalled: true, packageName: resolved.packageName };
  if (resolved.status === "unusable") return { error: resolved.message, exitCode: 3 };
  const output = renderPackageIndex(resolved.result.packageName, resolved.result.packageVersion, resolved.result.symbols, all, options);
  return { output: resolved.result.bundled ? `${output}\n\n${bundledNote(resolved.result.packageName, resolved.result.packageVersion)}` : output };
}

function notInstalledMessage(packageName: string): string {
  return `"${packageName}" isn't installed here. Try \`npm i ${packageName}\`.`;
}

function bundledNote(packageName: string, packageVersion: string): string {
  return `(bundled reference docs for ${packageName}@${packageVersion} — not installed in this project; run \`npm i ${packageName}\` to match your own version)`;
}

// A miss: headline and suggestions on stderr so piped stdout stays empty (SPEC.md §4.4), exit 1.
function writeMiss(headline: string, suggestions: string[]): void {
  process.stderr.write(`${headline}\n`);
  if (suggestions.length > 0) {
    process.stderr.write("\nDid you mean?\n");
    for (const s of suggestions) process.stderr.write(`  nest-doc ${s}\n`);
  }
  process.exitCode = 1;
}

function renderAmbiguous(name: string, packageNames: string[]): string {
  const lines = [`"${name}" is ambiguous — found in multiple packages:`, ""];
  for (const packageName of packageNames) lines.push(`  nest-doc ${packageName}.${name}`);
  lines.push("", "Run one of the above.");
  return lines.join("\n");
}

async function renderBareSymbolQuery(
  name: string,
  dataDir: string,
  cwd: string,
  guidesFile: GuidesFile,
  aliasFile: AliasFile,
  options: RenderOptions,
): Promise<{ output: string; exitCode: 0 | 1 } | { error: string; exitCode: 1 | 3 } | undefined> {
  const resolved = await resolveBareSymbol(name, dataDir, cwd);
  if (resolved.status === "not-found") return undefined;
  if (resolved.status === "unusable") return { error: resolved.message, exitCode: 3 };
  if (resolved.status === "missing-from-installed") {
    return { error: `"${resolved.name}" is exported by ${resolved.packageName}, but not by the ${resolved.packageVersion} installed here.`, exitCode: 1 };
  }
  if (resolved.status === "ambiguous") return { output: renderAmbiguous(name, resolved.packageNames), exitCode: 1 };
  if (resolved.status === "not-installed") {
    return { output: `"${resolved.name}" is exported by ${resolved.packageName}, which isn't installed here. Try \`npm i ${resolved.packageName}\`.`, exitCode: 0 };
  }
  const output = renderSymbol(resolved.packageName, resolved.packageVersion, resolved.symbol, guidesFile, aliasFile, options);
  return { output: resolved.bundled ? `${output}\n\n${bundledNote(resolved.packageName, resolved.packageVersion)}` : output, exitCode: 0 };
}

async function writeBareResult(result: { output: string; exitCode: 0 | 1 } | { error: string; exitCode: 1 | 3 }): Promise<void> {
  if ("error" in result) process.stderr.write(`${result.error}\n`);
  else await writeOutput(result.output);
  process.exitCode = result.exitCode;
}

export function createProgram(dataDir: string): Command {
  const program = new Command();
  // Throw instead of exiting, so main.ts can map usage errors to exit 2. Must precede `.command("update")` below:
  // commander copies this setting into a subcommand only when the subcommand is created.
  program.exitOverride();

  program
    .name("nest-doc")
    .description("A terminal documentation reader for NestJS.")
    .version(pkg.version, "-v, --version", "output the version number")
    .argument("[query]", "guide slug, concept name, package name, package.Symbol, @Decorator, or bare symbol name")
    .option("--js", "show JavaScript code samples instead of TypeScript")
    // Mutually exclusive: together they'd skip every resolution step and report a miss for any query.
    .addOption(new Option("--guide", "force guide resolution (steps 1-2 only)").conflicts("api"))
    .addOption(new Option("--api", "force package/symbol resolution (steps 3-5 only)").conflicts("guide"))
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
        const lookup = findGuideSection(query, guidesFile, aliasFile);
        if (lookup) {
          if (lookup.missingAnchor !== undefined) {
            process.stderr.write(`No section "#${lookup.missingAnchor}" in ${lookup.guide.slug}; showing the whole guide.\n`);
          }
          const guideRenderOptions = { ...renderOptions, js: opts.js === true };
          await writeOutput(renderTokens(lookup.tokens, guideRenderOptions));
          return;
        }
      }

      if (!opts.guide) {
        // package.symbol is tried first regardless of a leading "@" ("@nestjs/swagger.ApiProperty" and "common.Injectable" are the same shape); falls through, not a miss, on no match.
        const split = splitPackageSymbol(query);
        if (split) {
          const resolved = await resolvePackageSymbolsOrBundled(split.packageQuery, cwd, dataDir);

          if (resolved.status === "unusable") {
            process.stderr.write(`${resolved.message}\n`);
            process.exitCode = 3;
            return;
          }

          if (resolved.status === "found") {
            const { packageName, packageVersion, symbols, bundled } = resolved.result;
            const symbol = symbols.find((s) => s.name === split.symbolName);
            if (symbol) {
              const symbolOutput = renderSymbol(packageName, packageVersion, symbol, guidesFile, aliasFile, renderOptions);
              await writeOutput(bundled ? `${symbolOutput}\n\n${bundledNote(packageName, packageVersion)}` : symbolOutput);
              return;
            }

            // The package exists but has no such export — a definitive miss, answered from that package's own export
            // list (ARCHITECTURE.md §10), unless the whole query is itself a package name with a dot in it.
            if ((await resolvePackageSymbolsOrBundled(query, cwd, dataDir)).status !== "found") {
              const prefix = shorthandFor(packageName);
              writeMiss(
                `No export "${split.symbolName}" in ${packageName}@${packageVersion}.`,
                suggest(split.symbolName, symbols.map((s) => s.name)).map((name) => `${prefix}.${name}`),
              );
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
            const result = await renderPackageIndexForQuery(query, opts.all === true, renderOptions, cwd, dataDir);
            if (result) {
              if ("notInstalled" in result) {
                await writeOutput(notInstalledMessage(result.packageName));
              } else if ("error" in result) {
                process.stderr.write(`${result.error}\n`);
                process.exitCode = result.exitCode;
              } else {
                await writeOutput(result.output);
              }
              return;
            }
          } else {
            const bare = await renderBareSymbolQuery(classified.name, dataDir, cwd, guidesFile, aliasFile, renderOptions);
            if (bare) {
              await writeBareResult(bare);
              return;
            }
          }
        } else {
          const indexResult = await renderPackageIndexForQuery(query, opts.all === true, renderOptions, cwd, dataDir);
          // A recognised shorthand (e.g. "throttler" -> "@nestjs/throttler") that isn't installed gets the helpful
          // message below; an unrecognised bare word falls through to bare-symbol lookup and the suggestions below that.
          const isUnrecognisedShorthand = indexResult && "notInstalled" in indexResult && indexResult.packageName === query;
          if (indexResult && !isUnrecognisedShorthand) {
            if ("notInstalled" in indexResult) {
              await writeOutput(notInstalledMessage(indexResult.packageName));
            } else if ("error" in indexResult) {
              process.stderr.write(`${indexResult.error}\n`);
              process.exitCode = indexResult.exitCode;
            } else {
              await writeOutput(indexResult.output);
            }
            return;
          }

          const bare = await renderBareSymbolQuery(query, dataDir, cwd, guidesFile, aliasFile, renderOptions);
          if (bare) {
            await writeBareResult(bare);
            return;
          }
        }
      }

      // Symbol names are only candidates when symbols were in scope for this query.
      const candidates = [...Object.keys(guidesFile.guides), ...Object.keys(aliasFile.urlToSlug)];
      if (!opts.guide) candidates.push(...Object.keys(loadNameIndex(dataDir).names));
      writeMiss(`No guide or symbol matches "${query}".`, suggest(query, candidates));
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
