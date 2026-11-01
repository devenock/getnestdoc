# Architecture

How `getnestdoc` works, end to end. Read the README's "Why" section first for the motivation; this document is the how.

Every number here was measured, not assumed — see `DECISIONS.md` for the rationale behind each one.

---

## 1. Shape of the thing

A single global npm package. One binary. Data that ships inside the package, plus data that lives on the user's disk.

```
┌──────────────────────────────────────────────────────────────────┐
│  npm i -g getnestdoc                                             │
│                                                                  │
│  dist/nest-doc.mjs     190 KB   bundled CLI                      │
│  data/guides.json      4.0 MB   pre-tokenised guide corpus       │
│  data/aliases.json       7 KB   URL → guide slug table           │
│  data/names.json        50 KB   bare symbol name → package(s)    │
│  data/packages.json    840 KB   bundled @nestjs/* symbols        │
└──────────────────────────────────────────────────────────────────┘
                              │
                    reads at runtime
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  <user's project>/node_modules/**/*.d.ts                         │
│  ~/.cache/getnestdoc/<pkg>@<version>.json        (XDG_CACHE_HOME)│
│  ~/.local/share/getnestdoc/<tool version>/       (XDG_DATA_HOME) │
│      guides.json, aliases.json — only after `nest-doc update`    │
└──────────────────────────────────────────────────────────────────┘
```

The guide corpus is baked in at build time, so guide lookups need no network and no user project. Symbol lookups read the user's actual installed packages, so they are version-accurate; for the official `@nestjs/*` scope, bundled reference data covers a package that isn't installed (ADR-0010). `nest-doc update` writes a refreshed corpus per user, never into the package (ADR-0013).

---

## 2. Request lifecycle

```
nest-doc common.Injectable
        │
        ▼
   ┌─────────┐
   │  parse  │  argv → { query, flags }
   └────┬────┘
        ▼
   ┌──────────┐
   │ classify │  guide? symbol? package? ambiguous?
   └────┬─────┘
        │
   ┌────┴─────────────────────┐
   ▼                          ▼
┌───────────┐          ┌──────────────┐
│  GUIDE    │          │    SYMBOL    │
│           │          │              │
│ guides    │          │ resolve pkg  │  walk up to node_modules, then global roots
│ .json     │          │      ↓       │
│    ↓      │          │ installed?   │
│ (in mem)  │          │   ├─ no ─────┼──▶ data/packages.json (official scope only)
│           │          │   └─ yes     │
│ #anchor → │          │ cache hit?   │
│  section  │          │   ├─ yes ────┼──▶ read JSON       0.5 ms
└─────┬─────┘          │   └─ no  ────┼──▶ parse .d.ts   ~250 ms (typescript load dominates)
      │                └──────┬───────┘         │
      │                       │                 └──▶ write cache
      └───────────┬───────────┘
                  ▼
            ┌──────────┐
            │  render  │  tokens → ANSI
            └────┬─────┘
                 ▼
              stdout
```

Guide lookups never touch the filesystem beyond loading one bundled JSON. Symbol lookups hit the cache on every invocation after the first for a given package version.

---

## 3. Module layout

The `core` / `nest` seam, made concrete: `core/` is the generic, extractable engine; `nest/` is Nest-specific knowledge built on top of it.

```
src/
├── main.ts                     entry, bin target; maps errors to exit codes
├── cli/
│   └── doc.command.ts          the command: flags, resolution order, output
│
├── core/                       ← zero Nest knowledge, extractable
│   ├── contain.ts              real-path containment check (ADR-0009)
│   ├── own.ts                  own-property lookup for JSON dictionaries
│   ├── fuzzy.ts                Levenshtein "did you mean?"
│   ├── pager.ts                $PAGER / less decision and spawn (ADR-0008)
│   ├── resolve/
│   │   ├── find-package.ts     walk up to node_modules, then global roots
│   │   ├── entry-types.ts      package.json → entry .d.ts
│   │   └── types.ts
│   ├── extract/
│   │   ├── parse.ts            ts.createSourceFile, per-file export table
│   │   ├── barrels.ts          follow re-exports, build SymbolRecords
│   │   ├── jsdoc.ts            comment + tag extraction
│   │   ├── signature.ts        declaration text normalisation
│   │   ├── sanitize.ts         strip control bytes from third-party text
│   │   ├── typescript-loader.ts  the one lazy `typescript` import
│   │   └── types.ts            SymbolRecord
│   ├── cache/
│   │   ├── store.ts            read/validate/write, atomic
│   │   └── paths.ts            XDG cache and data directories
│   └── render/
│       ├── ansi.ts             colour primitives, width handling
│       ├── markdown.ts         guide tokens → ANSI
│       ├── table.ts            table token → terminal table
│       ├── code.ts             minimal TS/JS highlighter
│       └── types.ts            token contract
│
└── nest/                       ← Nest-specific knowledge
    ├── guides/
    │   ├── index.ts            load guides.json, slug/alias/#anchor lookup, @see → slug
    │   └── types.ts
    ├── aliases.ts              load aliases.json
    ├── package-scope.ts        `common` → `@nestjs/common` shorthand table
    ├── symbols.ts              resolve + cache + extract, bundled fallback
    ├── bundled-packages.ts     load packages.json
    ├── names.ts                bare symbol name → package (names.json, then scan)
    ├── doc-text.ts             JSDoc markdown → paragraphs, lists, code
    ├── render-symbol.ts        one symbol (SPEC.md §4.1)
    ├── render-package-index.ts package index (SPEC.md §4.2)
    ├── update.ts               `nest-doc update`
    └── update/                 fetch, guide transform, alias routes, link rewrite

scripts/                        ← build time only, not shipped
├── build-guides.ts             fetch docs repo → guides.json
├── build-aliases.ts            parse *.routes.ts → aliases.json, rewrite links
├── build-packages.ts           extract official scope → packages.json, names.json
├── bundle.ts                   esbuild config
└── bench.ts                    latency harness (TESTING.md)
```

`core/` never imports from `nest/`. Enforce it with an ESLint boundary rule from day one, so extraction later is a directory move rather than an untangling exercise.

---

## 4. Resolution

### 4.1 Query classification

One positional argument carries five possible meanings. Resolution order (SPEC.md §5, extended by ADR-0007):

```
1. exact guide slug            "interceptors"          → guide  ("slug#anchor" → one section, ADR-0012)
2. exact concept alias         "providers"             → guide (components.md)
3. scoped package              "@nestjs/common"        → package index
4. package.symbol              "common.Injectable"     → symbol
5. bare symbol / decorator     "@Get", "Get"            → symbol
6. fuzzy match                 "intercepters"          → "did you mean interceptors?"
7. miss                        → exit 1 with suggestions
```

`--guide` short-circuits to steps 1–2; `--api` to 3–5; the two together are a usage error (exit 2). Guides win ties *silently* — a bare word that could be either resolves to the guide by default (`nest-doc Module` → the guide; `--api` forces the decorator), because steps 1–2 run before 3–5 and simply match first. This isn't the same thing as ADR-0007's "ambiguous" case, which is narrower and concrete: a bare name that maps to *more than one package* in the name index (`data/names.json`) — that's the one case that prints every option and exits 1 rather than guessing, per SPEC.md §2b. Verified against the real shipped index (37 packages, 1229 names): 36 real collisions today (e.g. `PartialType`, exported by `@nestjs/graphql`, `@nestjs/mapped-types`, and `@nestjs/swagger` alike) — this path fires for real queries, not just in theory.

Query classification also has to decide, ahead of all of this, whether a dotted query is a package.symbol pair (step 4) before falling through to steps 3/5 — checked first and independent of a leading `@`, since `@nestjs/swagger.ApiProperty` and `common.Injectable` are the same shape. The split point is the *last* `.`, not the first: `platform-socket.io` is a real published package name (and a real shorthand-table entry) with a literal `.` in it, so `@nestjs/platform-socket.io.SomeExport` must keep the whole thing before the last dot as the package.

When the package of a `package.symbol` query resolves but has no such export, that's a definitive miss answered with near matches from the package's own exports (§10) — unless the whole dotted query is itself a resolvable package name (`socket.io`).

The `common.X` shorthand expands `common` → `@nestjs/common` via a static table of the official scope. Unscoped names not in that table are treated as literal package names.

A bare name missing from `names.json` falls back to scanning installed `@nestjs/*` packages (symlinked ones included — the pnpm layout), so a newer installed version can still contribute names. Installs at exactly the version `data/packages.json` was built from are skipped: the index already covers them, and extracting them cold would put a simple typo far over budget.

**Disambiguating a leading `@`** (ADR-0007): a name containing `/` is a scoped package; a single capitalised word is a decorator; anything else (most commonly a lowercase word) is a usage error, exit 2 with a suggestion — there's no third meaning to guess at.

### 4.2 Finding the package

Walk up from `cwd` looking for `node_modules/<name>`. Stop at filesystem root or a `.git` boundary, whichever comes first; if that fails, try the global npm roots: first the `node_modules` directory `nest-doc` itself is installed in (the real path of `argv[1]` — for any npm-prefix global install that *is* the global root, including Homebrew, whose `process.execPath` resolves into its Cellar instead), then the one derived from `process.execPath`. No `npm root -g` subprocess — that would cost 100ms+ on a path that has to stay fast. If a package genuinely isn't installed anywhere and it's part of the official `@nestjs/*` scope, `resolvePackageSymbolsOrBundled` (ADR-0010) falls back to `data/packages.json` before giving up — still fully offline, no registry fetch, because that would break the offline guarantee. A live install always wins over bundled data when both exist.

### 4.3 Finding the entry declaration file

Four cases, in order. Nest 12 is case 3, which is the one naive implementations miss.

```ts
// 1. explicit types field (older packages)
pkg.types ?? pkg.typings

// 2. exports map with a types condition — at any depth of nesting
pkg.exports["."]            // or the whole object, if no key starts with "."
  { types }  |  { import: { types, default }, require: { … } }  |  [fallbacks…]

// 3. exports map without one (or no exports map: main ?? "./index.js") → sibling inference
//    "./index.js" ⟹ "./index.d.ts"   ".mjs" ⟹ ".d.mts"   ".cjs" ⟹ ".d.cts"   ← @nestjs/common@12

// 4. @types/* fallback
node_modules/@types/<name-with-slashes-flattened>/index.d.ts
```

Verified against `@nestjs/common@12.0.1`, which declares `"type": "module"`, an `exports` map, and **no `types` field at all**.

Every candidate from cases 1–3 must be a real file that resolves — by real path, so symlinks count — inside the package directory (ADR-0009); `EntryResolution.packageRoot` carries that directory on to extraction as its containment root. package.json itself is third-party input: a malformed file is reported as unusable (exit 3), and a wrongly-typed field is treated as absent.

---

## 5. Symbol extraction

Parse-only. No `TypeChecker`. See ADR-0002 for why — the short version is that it is 6.3× faster and produces better signatures, because declaration files have nothing left to infer.

### 5.1 Walking the barrel graph

`@nestjs/common/index.d.ts` re-exports three levels deep and mixes two forms:

```ts
export * from './decorators/index.js';        // wildcard  → recurse
export { Abstract, ArgumentMetadata, ... }    // named     → recurse, filter
  from './interfaces/index.js';
```

Both must be followed. Handling only the wildcard form finds 155 of 206 exports — the ~50 interface names come through the named form. Specifiers are written with `.js` extensions (ESM); rewrite to `.d.ts` (`.mjs`/`.cjs` to `.d.mts`/`.d.cts`), and fall back to `<spec>/index.d.ts` for directory specifiers. A relative specifier resolving outside the package directory isn't followed. A bare specifier naming another package (`export { getQueueToken, JOB_REF } from '@nestjs/bull-shared'` in `@nestjs/bull`/`@nestjs/bullmq`; `export { EventEmitter2 } from 'eventemitter2'` in `@nestjs/event-emitter@3`) is followed into that installed dependency — found Node-style from the re-exporting file's real path, so pnpm's store layout works — and walked inside the dependency's own root. Only a valid bare package name is ever looked up: subpaths, `node:` builtins, and anything path-shaped are skipped.

Three more shapes appear in real declaration files and are handled the same way:

```ts
export { Foo as Bar } from './a.js';     // aliased  → recorded as Bar, not Foo
declare class A {}  export { A as B };   // local export list (rollup/tsup-bundled .d.ts, @nestjs/jwt)
import { C } from './c.js'; export { C }; // imported binding re-exported → followed into ./c
```

Termination: an "export everything" visit runs once per file; a filtered visit once per (file, name, final name). Tracking files alone drops names when one file is reached twice with different filters. Each file is parsed once per extraction, and a name reachable through several barrels is recorded once (first wins).

### 5.2 Per-declaration extraction

For each exported name, from its declaration node(s):

| Field | Source |
|---|---|
| `name` | the name it's exported as (not the source name, for an aliased re-export) |
| `doc` | `node.jsDoc.at(-1).comment` |
| `tags` | `node.jsDoc.at(-1).tags[]` — name and reconstructed text |
| `signature` | `node.getText()`, JSDoc blocks stripped, whitespace collapsed |
| `see` | `tags` filtered to `see`, link text and URL parsed out |
| `isPublicApi` | `tags` includes `publicApi` |
| `file`, `line` | declaration site, `file` relative to the package directory (prefixed with the dependency's name for a symbol re-exported from one) — provenance only, not rendered |

Function overloads merge into one record (ADR-0011): one signature line per overload, the first documented overload's prose, the union of tags and `@see` links. Every string field passes through `sanitize.ts` before it's cached or printed (ADR-0009).

`ts.createSourceFile` must be called with `setParentNodes: true` for `getText()` to work.

### 5.3 Cache

```
~/.cache/getnestdoc/@nestjs+common@12.0.1.json      (XDG_CACHE_HOME aware)
```

Key is package name plus exact resolved version from its `package.json`. Version is part of the key, so upgrades invalidate naturally and no staleness check is needed. The entry's format `version` (currently 2) is bumped whenever extraction output changes for the same package version, so a tool upgrade never keeps serving records from an older extractor. Writes are atomic — temp file plus rename — so concurrent invocations cannot tear a cache entry. Reads validate every field consumers use; a wrongly-shaped entry is deleted and treated as a miss.

Measured: 150 KB for 220 symbols, 0.5 ms to read and parse. A cold `nest-doc common.Injectable` (load typescript, extract, write cache) is ~285 ms end to end; cached it's within the normal ~50 ms lookup (§9).

`nest-doc --clear-cache` exists for when a package is reinstalled at the same version.

---

## 6. Guide pipeline

### 6.1 Build time

Run by hand before a release — `npm run build:guides`, then `npm run build:aliases` (which also rewrites internal links in `guides.json`), and `npm run build:packages` for the bundled symbol data (`--pin` re-extracts the already-bundled versions after an extractor change). No CI workflow runs these today; staleness is bounded by how often someone does. Never at install time, never at runtime — `nest-doc update` runs the same guide pipeline on demand, into the user's data directory (ADR-0013).

```
codeload.github.com/nestjs/docs.nestjs.com/tar.gz/master
        │
        ├── content/**/*.md      143 files, 1.9 MB
        │       │
        │       ├── strip <app-banner-*>          36 occurrences
        │       ├── split @@switch fences          227
        │       ├── extract @@filename headers     453
        │       ├── parse HTML tables               35
        │       ├── parse GFM pipe tables            45   (not HTML — marked's own
        │       │                                          Tokens.Table; TableToken
        │       │                                          isn't scoped to <table>
        │       │                                          source, found by running
        │       │                                          the real corpus through
        │       │                                          marked.lexer(), Phase 1)
        │       └── rewrite ](/slug) links
        │       ▼
        │   guides.json      { slug → { title, headings[], tokens[] } }
        │
        └── src/**/*.routes.ts
                │
                └── { path, component } pairs
                        │  ProviderScopesComponent → provider-scopes.md
                        ▼
                    aliases.json
```

Pre-tokenising at build time means the runtime never runs a markdown parser over raw files — it loads a JSON of `marked` tokens and walks straight to rendering.

### 6.2 The alias table

Guide URLs do not match filenames. `/providers` is served by `components.md`; `/fundamentals/injection-scopes` by `fundamentals/provider-scopes.md`. Naive path mapping resolves 35 of 47 `@see` URLs (74%).

The mapping is machine-derivable from the docs repo's own Angular routes — but not by kebab-casing the component class name, which was the original plan here. Verified against all 145 component routes in the real tree (Phase 2): kebab-casing the class name only matches the real filename in 116/145 (80%). Nested route files prefix class names to dodge identifier collisions — `microservices.routes.ts` and `websockets.routes.ts` both need a "Pipes" page, so they're `MicroservicesPipesComponent` / `WsPipesComponent` in code, which kebab-case to `microservices-pipes` / `ws-pipes`, neither of which exists. Both really just point at `pipes.md` in their own directory.

The reliable signal is the component's own import path, not its name:

```ts
// fundamentals.routes.ts
import { ProviderScopesComponent } from './provider-scopes/provider-scopes.component';
//                                       └─ this directory, relative to homepage/pages/,
//                                          is the guide slug: fundamentals/provider-scopes
{ path: 'injection-scopes', component: ProviderScopesComponent }
//        └─ URL slug (unrelated to the filename)
```

Resolve the import specifier to a file path, drop the filename, and take the directory relative to `homepage/pages/` — 144/145 real routes resolve this way. The one that doesn't is `HomepageComponent`, the root layout shell (the only route with both `component` and inline `children`, correctly not a content page).

Generate it; do not hand-maintain it. It then stays correct as the docs evolve, and it serves both `@see` resolution and internal `](/slug)` link rewriting.

If a route path fails to resolve to a file, the build fails loudly rather than shipping a broken link table.

### 6.3 Custom syntax

Handled at build time so the runtime renderer stays simple:

- **`@@filename(x)`** — first line inside a fence. Lift into a header rendered above the code block.
- **`@@switch`** — splits a fence into TypeScript (before) and JavaScript (after). Store both; render TypeScript by default, JavaScript under `--js`.
- **`<app-banner-*>`** — strip by prefix, not by enumerating the five known variants.
- **`<figure><img>`** — replace with a dim `[image: alt]` placeholder and the URL.
- **`<table>`** — parse to a cell matrix for the terminal table renderer.

---

## 7. Rendering

Hand-written. `marked-terminal` costs 79 ms over the node floor and bundles to 1.5 MB, which is more than the entire remaining budget. `marked.lexer()` alone costs 18 ms. See ADR-0003.

```
tokens (from guides.json, or built from a symbol record)
   │
   ▼  walk
┌────────────────────────────────────────┐
│ heading   → bold, colour by depth      │
│ paragraph → wrap to min(termWidth, 100)│
│ code      → indent, highlight, filename│
│ list      → bullet, indent, recurse    │
│ table     → column-aligned box         │
│ link      → underline + dim URL        │
│ codespan  → cyan                       │
└────────────────────────────────────────┘
   │
   ▼
stdout
```

Rules that matter:

- **Respect `NO_COLOR`** and disable ANSI when `!process.stdout.isTTY`, so piping to a file or `grep` yields clean text.
- **Wrap on `process.stdout.columns`**, capped at 100 for readability on wide terminals, floored at 40, 80 when the terminal reports no width.
- **Page only when it helps** (ADR-0008): on a real TTY, output taller than the screen goes through `$PAGER` (default `less`, `LESS=FR`). Piped or redirected output is never paged and stays plain text, so it still composes like `go doc`.
- **Signatures word-wrap at whitespace**, never mid-token; overloads print one per line with wrapped continuations hanging four. At the 40-column floor only a single identifier or runnable command longer than the terminal may overflow — breaking it would make it uncopyable.

Syntax highlighting is a small regex tokeniser covering keywords, strings, comments, decorators, and types. `cli-highlight` pulls all of highlight.js and is not affordable.

---

## 8. Build and distribution

```
src/**/*.ts
    │  tsc typecheck (no emit)
    │  esbuild bundle → dist/nest-doc.mjs
    ▼
package.json
  "bin":   { "nest-doc": "./dist/nest-doc.mjs" }
  "files": ["dist", "data"]
```

Bundling is mandatory, not an optimisation. Measured on `nest-doc interceptors`: ~95 ms running `src/main.ts` unbundled (module resolution plus type stripping), ~51 ms bundled. (The nest-commander spike in ADR-0005 measured 217 ms vs 48 ms for module loading alone.)

The only externals are the two lazy-loaded runtime dependencies, `typescript` and `marked`. The CLI imports no Nest code, so none of Nest's optional peers need marking external — that requirement belonged to the nest-commander option ADR-0005 didn't adopt.

`typescript` is pinned to `6.0.3` exactly. Version 7 is the native Go port and exports only `version` and `versionMajorMinor` — no `createSourceFile`, no Compiler API at all. A bump to 7 fails at runtime, not at install. See ADR-0001.

`typescript` is a runtime dependency, not a devDependency, because extraction needs it in the user's installed copy. It is deliberately **not** bundled — 40 MB is unacceptable in a bundle — and is instead lazy-imported only on the symbol path, so guide lookups never pay for it.

---

## 9. Performance budget

The target is 150 ms. Anything slower loses to alt-tabbing to a browser, which is the actual competition.

Measured with `scripts/bench.ts` (median of 17 timed runs after 3 warmups; the CI call sites are listed in TESTING.md):

| Lookup | Median | |
|---|---|---|
| `node -e ""` — process start, the floor | ~26 ms | not a bench call; for reference |
| `nest-doc --version` — plus the bundled CLI | ~29 ms | budget 60 ms |
| `nest-doc interceptors` — guide (includes ~15 ms to parse the 4 MB `guides.json`) | ~50 ms | budget 150 ms |
| `nest-doc common.Injectable` — symbol, cached live install | ~47 ms | budget 150 ms |
| `nest-doc throttler.Throttle` — symbol, bundled fallback | ~48 ms | budget 150 ms |
| `nest-doc common.Injectable`, cold cache — loads typescript, extracts, writes cache | ~285 ms | once per package version |

Headroom on every hot path is ~100 ms. The cold path is over budget by design and paid once; the cache exists for it.

**Lazy-load discipline.** `typescript` loads only on the cold symbol path. `marked` loads only inside `nest-doc update` — guides ship pre-tokenised, so no lookup ever runs a markdown parser. `data/packages.json` and `data/names.json` load only when a lookup reaches the bundled fallback or bare-symbol resolution. A regression here is a bug, not a tradeoff.

---

## 10. Failure modes

| Situation | Behaviour |
|---|---|
| Package not installed, official `@nestjs/*` scope | Render bundled reference docs with a note naming the bundled version, exit 0 (ADR-0010) |
| Package not installed, anything else | `"<pkg>" isn't installed here. Try \`npm i <pkg>\`.`, exit 0 — a known, actionable outcome (SPEC.md §5) |
| Package ships no types | Say so, suggest `@types/<name>`, exit 3 |
| Package's `package.json` unreadable | Say so, suggest reinstalling, exit 3; a wrongly-typed field is ignored instead |
| Symbol not found in a resolved package | `No export "X" in pkg@v.` with near matches from that package's exports, exit 1 |
| Bare symbol the installed version lacks | Name the installed version that doesn't export it, exit 1 |
| Guide anchor matches no heading | Print the whole guide with a note on stderr, exit 0 (ADR-0012) |
| Cache corrupt or wrongly shaped | Delete the entry, re-extract, continue silently |
| Cache directory unwritable | Warn once to stderr, continue without caching |
| `typescript` import fails, or is 7.x | Guide lookups keep working; symbol lookups exit 4 with a message naming the required 6.0.3 |
| `nest-doc update` fails (network, unwritable `$XDG_DATA_HOME`) | Exit 4; the installed corpus is never touched — `update` writes only under the user's data directory (ADR-0013) |
| Terminal width unavailable | Default to 80 |

The tool never fetches at runtime and never fails a guide lookup because of a symbol-side problem. The two paths are independent by design.
