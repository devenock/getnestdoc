# Architecture decisions

Every non-obvious engineering call this project made, and why. Referenced elsewhere as `ADR-000N`.

---

## ADR-0001: Pin `typescript` to 6.0.3 exactly

**Status:** Accepted · **Date:** 2026-08-29

### Context

Symbol extraction requires the TypeScript Compiler API. The obvious dependency is `typescript@latest`.

`typescript@7.0.2` is currently `latest`. It is the native Go port, and its JavaScript export surface is two symbols:

```js
import ts from "typescript";   // 7.0.2
Object.keys(ts)                // → ["version", "versionMajorMinor"]
ts.createSourceFile            // → undefined
ts.createProgram               // → undefined
```

Verified against the published package. `typescript@6.0.3` is the last release carrying the JS Compiler API, and it is fully intact.

The failure mode is the dangerous part: `npm i typescript` installs successfully, typechecking passes, and the tool throws `undefined is not a function` at runtime on the first symbol lookup.

### Decision

Pin `"typescript": "6.0.3"` — exact, no caret — with an inline comment stating that 7.x removed the JS Compiler API.

Add a CI assertion that `typeof ts.createSourceFile === "function"`, so a transitive or careless bump fails the build rather than the user's first command.

### Consequences

- Immune to an accidental bump into a version that cannot work.
- Frozen off the 6.x line, forgoing later patches. Acceptable: we use a narrow, stable slice of the API — `createSourceFile` and AST node shapes.
- A known expiry date. Either the Go port eventually exposes a usable API surface and we migrate, or we stay on 6.x indefinitely. Revisit when the port's API story stabilises.
- `typescript` is a runtime dependency, not a devDependency, and is lazy-imported on the symbol path only so guide lookups never load it.

---

## ADR-0002: Extract by parsing, not type-checking

**Status:** Accepted · **Date:** 2026-08-29

### Context

Two ways to read a `.d.ts` with the Compiler API: build a `Program` and use the `TypeChecker`, or parse a single file with `createSourceFile` and walk the AST.

The checker path is the conventional choice and what most tooling reaches for. Both were built and measured against `@nestjs/common@12.0.1`:

| Approach | Time | Symbols | Signature produced |
|---|---|---|---|
| `createProgram` + `TypeChecker` | 1310 ms | 206 | `(options?: ScopeOptions \| undefined) => ClassDecorator` |
| `createSourceFile`, parse only | 207 ms | 155 | `export declare function Injectable(options?: InjectableOptions): ClassDecorator;` |

### Decision

Parse-only is the primary extraction path.

### Rationale

Faster by 6.3×, which matters against a 150 ms budget. But the output quality argument is the stronger one.

A type checker exists to **infer**. A declaration file has nothing to infer — every type is already written out explicitly by the package author. Running the checker over one is largely wasted work, and its normalisation actively destroys information: it expanded the author's named alias `InjectableOptions` into the structural `ScopeOptions | undefined`. The parse-only path preserves what the author wrote, which is what a documentation reader should show.

The 155-vs-206 gap is not a limitation of the approach. The spike followed `export * from` but skipped named re-exports (`export { A, B } from`), which `index.d.ts` uses for ~50 interface names. Handling both forms closes the gap.

### Consequences

- Barrel following, module specifier resolution, and cycle protection are ours to implement. Bounded and testable.
- No cross-package type resolution. Acceptable — we render declarations, not resolved types.
- Signatures reflect author intent rather than checker normalisation. Better for documentation, worse if someone wants a fully expanded type. `--resolve-types` can expose the checker path later for that case.
- Tests assert an export count of exactly 206, since the named-re-export gap is the most likely thing to get silently wrong.

---

## ADR-0003: Hand-write the terminal renderer

**Status:** Accepted · **Date:** 2026-08-29

### Context

Rendering markdown to ANSI is solved — `marked-terminal` is the standard choice. Measured cost, bundled with esbuild (the fair comparison, since we bundle anyway):

| Library | Bundled wall clock | Over the 23 ms node floor |
|---|---|---|
| `marked` (lexer only) | 41 ms | **+18 ms** |
| `marked` + `marked-terminal` | 102 ms | **+79 ms** |
| `cli-highlight` | — | pulls all of highlight.js |

The budget is 150 ms. With the CLI framework at +74 ms, `marked-terminal` lands the hot path at ~176 ms before a file has been read.

### Decision

Use `marked.lexer()` for tokenising only. Write the ANSI renderer by hand. Skip `cli-highlight`; ship a small regex highlighter for TypeScript.

### Rationale

Cost is the trigger, but the convenience being bought is convenience we cannot use. Nest's guides are not plain markdown — 453 `@@filename` directives, 227 `@@switch` blocks, 35 HTML tables, 36 Angular ad components, and ~300 internal links needing alias rewriting. `marked-terminal` handles none of it. We were always going to write custom handling; the only question was whether to also pay 79 ms for the parts it does cover.

Once guides ship pre-tokenised (`ARCHITECTURE.md` §6.1), `marked` becomes a build-time dependency and the 18 ms disappears from the runtime entirely.

### Consequences

- A few hundred lines of renderer to own and test: wrapping, tables, lists, code blocks, `NO_COLOR`, non-TTY output.
- Full control over `@@switch` and `@@filename`, which no library offers.
- Syntax highlighting is approximate. Fine for documentation samples; it does not need to be a real parser.
- Rendering must be tested against all 143 guides, not a sample, to catch edge cases in a hand-written walker.

---

## ADR-0004: Vendor the guide corpus at build time

**Status:** Accepted · **Date:** 2026-08-29

### Context

The guides live in `nestjs/docs.nestjs.com`. Three options: fetch at runtime, fetch on install, or bake in at build time.

Licence verified: a single MIT licence at the repository root, whose text explicitly grants rights over "the Software and associated documentation files". No separate content licence. `package.json` declares `"license": "MIT"`. Vendoring is permitted with the copyright notice retained.

Corpus size: 143 markdown files, 1.9 MB.

### Decision

Fetch, transform, and tokenise at build time. Ship `data/guides.json` and `data/aliases.json` inside the package.

### Rationale

Runtime fetching breaks the offline guarantee, which is a core design principle and the main advantage over a browser. Install-time fetching makes installs fail behind corporate proxies and in air-gapped environments.

1.9 MB is a rounding error next to the 444 KB bundle plus `typescript`. Pre-tokenising also removes the markdown parser from the runtime path entirely.

The alias table is generated from the docs repo's own `*.routes.ts` route definitions rather than hand-maintained, so it stays correct as the docs change. The build fails if any route path has no corresponding file.

### Consequences

- Guides are pinned to the release. Staleness is bounded by release cadence — refresh in CI on a schedule.
- `nest-doc update` provides an escape hatch for users who want a newer corpus, as the only networked command.
- Retain the Nest copyright notice in the package and attribute clearly in the README.
- A docs repo restructure breaks the build script. It fails loudly at build time, never silently at runtime.

---

## ADR-0005: CLI framework — `nest-commander` or plain `commander`

**Status:** Accepted · **Date:** 2026-08-30

### Context

The original intent was to build the CLI with NestJS itself, via `nest-commander`. Three findings complicated that.

**Cost.** Measured, bundled with esbuild:

| Configuration | Wall clock | Breakdown |
|---|---|---|
| Bare `node -e ""` | 23 ms | — |
| `nest-commander`, unbundled | 220 ms | `require` 217 ms, DI container 10 ms |
| `nest-commander`, bundled | 97 ms | `require` 48 ms, DI container 9 ms |

The DI container is essentially free at 9 ms; the cost is loading the Nest module graph. Bundling recovers 123 ms of it, but ~74 ms remains — over 60% of the 150 ms budget. Plain `commander` lands the same hot path near 46 ms, roughly 2.5× faster overall.

**Version support.** `nest-commander@3.20.1`'s peer range tops out at Nest 11, while this tool documents Nest 12 — running Nest 11 to build a tool that reads Nest 12 docs weakens the dogfooding argument, the entire case for the framework.

**Tooling.** Node 22's native TypeScript execution only handles erasable syntax; `nest-commander` requires `@Command()`/`@Injectable()` decorators, which forces a transpiler for dev and tests. Plain `commander` needs none.

### Options

**A. `nest-commander`.** Coherent "Nest tool built with Nest" story; DI genuinely suits the service shape (resolver, extractor, cache, renderer, guide index all inject cleanly). Costs ~74 ms and pins to Nest 11.

**B. Plain `commander` with hand-wired dependencies.** ~46 ms total. No version ceiling, no transpiler needed. Loses the dogfooding story, but wiring five services by hand in `main.ts` is a dozen lines, not a burden.

**C. `nest-commander` behind a lazy boundary** (guide lookups skip the container, symbol lookups bootstrap it). Adds a conditional bootstrap path and two code paths to test, for a saving only on the cheaper half — not obviously worth the complexity.

### Decision

**Option B: plain `commander`, hand-wired dependencies.** Confirmed by the project owner when asked to choose at the start of the build, on the recommendation that the 74 ms Nest 11 tax was not worth paying against a 150 ms budget with ~30 ms of headroom.

### Consequences

- No `@Command()`/`@Injectable()` decorators anywhere in `src/`. `main.ts` wires `resolve`, `extract`, `cache`, `render`, and the guide index by hand.
- No Nest version ceiling: the tool's own dependency graph is independent of which Nest major a user's project is on.
- Native TypeScript execution is available for the whole codebase — `node script.ts` and `node --test suite.test.ts` run without a transpiler (TESTING.md).
- Loses the "built with Nest" dogfooding story. Revisit if that becomes load-bearing later — reversible, just expensive.
- The CI benchmark threshold assumes the ~46 ms hot path this option gives, not the ~97 ms of Option A. If Option A is ever chosen instead, ADR-0003's renderer constraints become mandatory rather than advisory — at 74 ms there's no room left for a heavy renderer.

---

## ADR-0006: Package name `getnestdoc`, binary `nest-doc`

**Status:** Accepted · **Date:** 2026-08-29

### Context

The tool was to install as `getnestdoc` and be invoked as `nestdoc`. Registry check:

| Name | Status |
|---|---|
| `getnestdoc` | available |
| `nest-doc` | available |
| `nestdoc` | **taken** |
| `ndoc` | taken |

`nestdoc@0.0.71` is a real package, not a squat — a "Nest.JS documentation generator", last published September 2023, declaring `"bin": { "nestdoc": "bin/nestdoc" }`. Claiming `nestdoc` as a binary would collide on `PATH` for anyone who has it installed, and would confuse a documentation *generator* with a documentation *reader*.

A binary named `nestjs` was rejected earlier for a different reason: NestJS is a trademarked project name, `nest` belongs to `@nestjs/cli`, and an unofficial tool claiming either implies a status it does not have.

### Decision

- **npm package:** `getnestdoc`
- **binary:** `nest-doc`
- Reserve the `nest-doc` package name as a placeholder pointing at `getnestdoc`, to protect the binary name from a future collision.

### Rationale

`nest-doc` is eight characters, free on the registry, reads as a command, and mirrors `go doc` almost exactly — the hyphen distinguishes it from the abandoned `nestdoc` without being hard to type.

Package name and binary name need not match. `getnestdoc` keeps the brandable install name; the binary stays short, the property that matters since it's typed dozens of times a day against an install name typed once. Compound naming like this is well tolerated in the ecosystem — `nest-commander` is precedent.

### Consequences

- README and all documentation say `npm i -g getnestdoc`, then `nest-doc <query>` — the mismatch is stated explicitly and early, or users will try `getnestdoc interceptors`.
- Reserving `nest-doc` costs one placeholder publish.
- Consider a `ndoc`-style short alias in the `bin` map later if users ask. `ndoc` itself is taken; do not claim it.
- If the abandoned `nestdoc` is ever deprecated or transferred, revisit — but do not plan around it.

---

## ADR-0007: Bare symbol lookup and the `@Decorator` form

**Status:** Accepted · **Date:** 2026-08-29

### Context

`SPEC.md` §5 originally defined four query forms: guide slug, alias, package name, and `package.symbol`. Testing the design against a natural user question — "what does `@Get` do?" — showed the grammar had no entry for it, and it's the most likely query the tool will receive: Nest's public API is overwhelmingly decorators, and a developer reads `@Get()` in a controller without thinking `common.Get`.

Measured across `@nestjs/common@12.0.1`, `@nestjs/core@12.0.1`, and `@nestjs/swagger@12.0.1`: zero colliding public symbol names across the three packages, and `Get` resolves uniquely to `@nestjs/common` with JSDoc, `@publicApi`, and a `@see` link to `/controllers#routing`. Symbol names in the Nest scope are effectively globally unique, so a bare name identifies a package without qualification.

### Decision

Add two query forms and a disambiguation rule:

```
nest-doc @Get          decorator form  → strip @, bare symbol lookup
nest-doc Get           bare symbol     → search the name index
```

**Disambiguating `@`:**

| Pattern | Meaning |
|---|---|
| `@` + name containing `/` | scoped package — `@nestjs/common` |
| `@` + single capitalised word | decorator — `@Get`, `@Injectable` |
| `@` + single lowercase word | error, exit 2 with a suggestion |

**Resolution order:**

```
1. exact guide slug          "interceptors"
2. alias table               "providers"
3. scoped package            "@nestjs/common"
4. package.symbol             "common.Injectable"
5. bare symbol / decorator   "@Get", "Get", "Injectable"
6. fuzzy suggestions
7. miss → exit 1
```

Guides win ties — `nest-doc Module` could mean the guide or the decorator; guides are the cheaper, more common intent, and `--api` forces the other.

**Name index.** Bare lookup needs name → package. Ship a prebuilt index for the official `@nestjs` scope, generated alongside `guides.json`, rather than scanned: it's instant, needs no cache warm-up, and works before the package is even installed (in which case the tool reports the symbol, names its package, and says it isn't installed). Fall back to scanning installed `@nestjs/*` for anything outside the shipped index. Where a name maps to several packages, print the list and exit 1 rather than guessing.

### Consequences

- The most natural query form works — without this the tool couldn't answer a question users would actually ask.
- One more build artifact to generate and keep in sync with the guide corpus.
- The index covers the official scope only. Third-party Nest packages fall back to scanning, which is slower and requires installation.

### Related finding: documentation coverage is not uniform

`@nestjs/swagger@12.0.1` ships **125 declaration files with zero JSDoc blocks and zero `@publicApi` tags**. `@nestjs/common` has 220 `@publicApi` tags; `@nestjs/core` has 16 public symbols (measured directly — an earlier, less precise pass had estimated 17).

So the tool's usefulness varies sharply by package — for swagger it can show signatures but has no prose to render. Two requirements follow, both verified against swagger directly:

1. The `@publicApi` filter must degrade gracefully. A package with zero tags is not a package with zero public symbols — fall back to showing all exports rather than an empty list.
2. A symbol with no doc comment renders its signature plus an explicit "No documentation available in this package" line, never a blank section.

---

## ADR-0008: Auto-page long output, don't launch an editor

**Status:** Accepted · **Date:** 2026-08-31

### Context

User feedback after first real-world use: long guides (`custom-decorators` is 165 lines — verified, well past any normal terminal height) are awkward to read as a flat stdout dump, and asked for them to open "in a vim editor" the user could scroll and search.

Launching `vim` specifically has real costs: it assumes vim is installed (not guaranteed — Windows, minimal containers, CI), it takes over the terminal in a way that contradicts this tool's own "prints and exits, not a TUI" position, and — most concretely — it would break piping. `nest-doc x | grep foo` only stays instant and clean today because output goes straight to stdout with no ANSI when stdout isn't a TTY (tested explicitly); a hard-coded editor launch has no piped-mode fallback to speak of.

`git log`, `man`, and `npm help` all solve the identical problem the same way: pipe long output through `$PAGER` (defaulting to `less`) automatically when connected to a real terminal, and never otherwise. `less` already provides scrolling and `/pattern` search — exactly what was asked for — without a new dependency or a new failure mode.

### Decision

Auto-page through `$PAGER`, or `less` by default, when stdout is a real TTY **and** the rendered content is taller than the terminal. Never page when piped, redirected, or when the content already fits on one screen.

Set `LESS=FR` in the child's environment if the user hasn't already set their own `LESS`: `F` quit-if-it-fits as a defense-in-depth safety net since the height check above already filters for this; `R` preserves the ANSI color codes already in the rendered text.

### Rationale

This is the smallest change that satisfies the actual request — scrollable, searchable output — without touching anything about how the tool behaves when it isn't attached to an interactive terminal, which is most of its real usage (piped, redirected, called from scripts/CI, or from an editor's integrated terminal).

Two real, verified pitfalls, both caught by testing the actual behavior rather than assuming:

1. `spawn(command, { shell: true, ... })`, needed so a `$PAGER` value with flags (`"less -S"`) works, does **not** raise Node's `error` event when the command doesn't exist — the shell absorbs it and reports failure the POSIX way, exit code 127, via a normal `close` event. Not checking for that specifically means a broken or missing `$PAGER` silently swallows the entire output — the shell prints its own error to stderr and the tool exits 0 as if paging had succeeded. Fixed by falling back to a plain print whenever the child exits with code 127.
2. The first version set `LESS=FRX`, copying git's own default flags verbatim. `X` (`--no-init`) skips `less`'s alternate-screen switch (the terminal's `smcup`/`rmcup` sequences) — real-world use surfaced this immediately as duplicated content: every screenful `less` draws while scrolling piles onto the same buffer instead of replacing the last one, since nothing ever clears. Git sets `X` deliberately, for a reason that doesn't hold here — it wants diff/log output left visible in scrollback after quitting. A documentation reader should behave like `man`/`vim`: clear, scroll in place, restore the terminal on exit. Dropped `X` entirely.

### Consequences

- Scrolling and search work for long output without a new runtime dependency — `less` is assumed present (near-universal on Unix-likes; falls back to a plain print if it isn't, rather than failing).
- Piped/redirected/short output is completely unaffected — verified via the full integration suite (spawned via `spawnSync`, never a TTY) and a dedicated test asserting a 165-line guide still prints in full when spawned non-interactively.
- `$PAGER` is respected for users who already have one configured; a missing or broken pager degrades to a plain print rather than losing output.
- If this doesn't hold up in practice, it's a small, isolated, reversible change — one module (`core/pager.ts`) and six call sites in `cli/doc.command.ts`.

---

## ADR-0009: Sanitize everything a third-party package controls

**Status:** Accepted · **Date:** 2026-08-31

### Context

A security review prompted by real-world adoption — the tool is installed globally and runs against `node_modules` in developers' actual, sometimes sensitive, projects. Three real, verified vulnerabilities were found by constructing and running actual exploits against the built binary, not by inspecting code for theoretical issues. All three share one root cause: package.json fields and `.d.ts` file content are **third-party, attacker-controlled data** — the same trust level as a network response — but were being treated as trusted input throughout the resolve/extract/cache pipeline.

**1. Cache path traversal (CWE-22, the serious one).** `core/cache/paths.ts`'s `getCacheFilePath` built the cache filename directly from a package's own `package.json` `"version"` field, with no sanitization at all. A crafted `"version": "../../../../../../tmp/PWNED"` made `nest-doc <that-package>` write a real file — with attacker-controlled JSON content — to an arbitrary path outside the cache directory, verified end-to-end against the real built binary. Worse, `readCache`'s corrupt-file self-heal (`rmSync` on a JSON-parse failure) used the same unsanitized path, giving an **arbitrary file delete** primitive too: point the traversal at any real, non-JSON file — nearly anything — and the next lookup deletes it. Both trigger from nothing more than a victim running `nest-doc <package-name>` on a package they already have installed; no need for them to have deliberately queried anything suspicious.

**2. Barrel traversal outside the package root (CWE-22, lower severity).** `core/extract/barrels.ts` follows `export * from "<specifier>"` wherever a `.d.ts` file's own text points, with no boundary check. A crafted `export * from "../../secret-location/leaked.js"` in a package's own entry file made `extractPackage()` read and display a symbol from a `.d.ts` file completely outside that package's directory — verified end-to-end. Lower severity than #1 (read-only, no write/delete capability, requires the attacker to know a real path to another `.d.ts` file, same user/machine so no privilege or exfiltration boundary is crossed), but a real violation of what "look up docs for package X" should be able to touch.

**3. Terminal escape-sequence injection (the one that could reach furthest).** Nothing stripped control characters from extracted JSDoc text before it reached the terminal. A doc comment containing a raw ESC byte followed by an OSC sequence reached the final rendered output completely unfiltered, byte for byte — verified with `cat -v`. Not cosmetic: some terminals (iTerm2, Windows Terminal, and others) interpret OSC 52 as "write to the clipboard", no confirmation prompt. A malicious package's JSDoc could silently replace what a user copies next — a credential, a command they paste later without looking — just from running `nest-doc <malicious-package>`.

### Decision

Sanitize at every point untrusted data crosses into the system, rather than trying to catch it at render time:

- **Cache paths** (`core/cache/paths.ts`): replace every `/` and `\` in both `packageName` and `packageVersion` before they ever become part of a filename. Without a path separator left in either string, there is no way to construct a new path segment, so the flattened result can never resolve outside the cache directory — verified across 3 to 20 levels of `../`, every one collapses into one ordinary, if ugly, filename. `getCacheFilePath` also re-validates the final resolved path stays inside `cacheDir` as a defense-in-depth backstop (returns `undefined` if not; both `readCache`/`writeCache` treat that exactly like an unwritable cache directory), for whatever the character replacement doesn't anticipate rather than for the cases already covered.
- **Barrel following** (`core/extract/barrels.ts`): `resolveModuleSpecifier` now takes the package's own root directory and refuses to return a path outside it. Verified this doesn't break any real barrel: all three real fixtures (`@nestjs/common` 206, `@nestjs/core` 54, `@nestjs/swagger` 160 — the latter with a nested `dist/` entry point, the case most likely to have false-positived) extract the exact same counts as before.
- **Extracted text** (`core/extract/sanitize.ts`): every string field of a `SymbolRecord` — `doc`, `signature`, each tag's text, each `@see` link's text and URL — has every C0 control byte stripped except `\t`/`\n`, at the one point (`buildSymbolRecord`) all of them get assembled. This runs on raw source text, before any of the tool's *own* legitimate ANSI colour codes are added at render time, so it can't strip its own styling — only text a third party wrote. Re-applied on every cache **read**, not just at extraction: a cache entry written by a pre-fix version of this tool (or hand-tampered on disk) could already have the raw bytes baked in, and upgrading the tool doesn't retroactively clean an existing `~/.cache/getnestdoc/*.json` — a cache entry only invalidates on a package version bump, not a tool version bump.

### Rationale

All three follow the same principle: this tool reads two kinds of input the CLI's own caller never typed — a third-party package's `package.json` and `.d.ts` files, and (separately, lower trust concern since it's vendored from one fixed, vetted repository at build time) the guide corpus. The first is genuinely adversarial-shaped: anyone can publish an npm package, and "a developer runs `nest-doc <package-name>` on something they already depend on" is an ordinary, expected use of this tool, not an edge case. Every fix sanitizes at the boundary where that data enters the system — cache paths at construction, barrel targets at resolution, symbol text at assembly — so nothing downstream (rendering, JSON serialization, a future feature) has to remember to think about it again.

`npm audit` reported zero known vulnerabilities in the dependency tree at time of writing; the fetch-and-extract path in `nest-doc update` was checked too — the system `tar` binary already refuses `../`-containing entries on its own (verified directly: a crafted tarball entry was rejected with "Path contains '..'"), and `runUpdate`'s atomic writes mean a failed extraction never touches the existing, working `guides.json`/`aliases.json`.

### Consequences

- Every real fixture (`@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`) extracts identical symbol counts before and after — sanitization touches only genuinely dangerous bytes, verified by the exact-count assertions already in place for this reason (TESTING.md's own non-negotiable).
- Three dedicated regression tests, each built by reproducing the real exploit against the built binary first and only then turning it into a unit test — `test/cache.test.ts` (path traversal in both directions, write and delete) and `test/extract.test.ts` (barrel escape, escape-sequence stripping, including the stale-cache case).
- Guide content is not run through the same escape-sequence stripping — it's vendored from one fixed, trusted repository at build time (ADR-0004), not arbitrary user-installed packages, a materially different trust level. Worth revisiting only if that trust model ever changes.
