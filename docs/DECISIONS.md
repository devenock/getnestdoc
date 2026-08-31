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

Mirrors git's own default `less` invocation: set `LESS=FRX` in the child's environment if the user hasn't already set their own `LESS` (`F` quit-if-it-fits as a defense-in-depth safety net since the height check already filters for this; `R` preserves the ANSI color codes already in the rendered text; `X` leaves the content in scrollback after quitting instead of clearing the screen).

### Rationale

This is the smallest change that satisfies the actual request — scrollable, searchable output — without touching anything about how the tool behaves when it isn't attached to an interactive terminal, which is most of its real usage (piped, redirected, called from scripts/CI, or from an editor's integrated terminal).

A real, verified pitfall: `spawn(command, { shell: true, ... })`, needed so a `$PAGER` value with flags (`"less -S"`) works, does **not** raise Node's `error` event when the command doesn't exist — the shell absorbs it and reports failure the POSIX way, exit code 127, via a normal `close` event. Not checking for that specifically means a broken or missing `$PAGER` silently swallows the entire output — the shell prints its own error to stderr and the tool exits 0 as if paging had succeeded. Caught by testing the actual spawn behavior rather than assuming Node's error handling covered it; fixed by falling back to a plain print whenever the child exits with code 127.

### Consequences

- Scrolling and search work for long output without a new runtime dependency — `less` is assumed present (near-universal on Unix-likes; falls back to a plain print if it isn't, rather than failing).
- Piped/redirected/short output is completely unaffected — verified via the full integration suite (spawned via `spawnSync`, never a TTY) and a dedicated test asserting a 165-line guide still prints in full when spawned non-interactively.
- `$PAGER` is respected for users who already have one configured; a missing or broken pager degrades to a plain print rather than losing output.
- If this doesn't hold up in practice, it's a small, isolated, reversible change — one module (`core/pager.ts`) and six call sites in `cli/doc.command.ts`.
