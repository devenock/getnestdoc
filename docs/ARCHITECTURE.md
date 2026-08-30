# Architecture

How `getnestdoc` works, end to end. Read `PROBLEM.md` first for why; this document is the how.

Every number here was measured. See `PROBLEM.md` § Verified findings.

---

## 1. Shape of the thing

A single global npm package. One binary. Two data sources, one of which ships inside the package and one of which lives on the user's disk.

```
┌─────────────────────────────────────────────────────────────┐
│  npm i -g getnestdoc                                        │
│                                                             │
│  dist/nest-doc.mjs      444 KB   bundled CLI                │
│  data/guides.json       ~2 MB    pre-indexed guide corpus   │
│  data/aliases.json      ~4 KB    URL → guide slug table     │
└─────────────────────────────────────────────────────────────┘
                              │
                    reads at runtime
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  <user's project>/node_modules/@nestjs/**/*.d.ts            │
│  ~/.cache/getnestdoc/<pkg>@<version>.json                   │
└─────────────────────────────────────────────────────────────┘
```

The guide corpus is baked in at build time, so guide lookups need no network and no user project. Symbol lookups read the user's actual installed packages, so they are version-accurate.

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
│ guides    │          │ resolve pkg  │  walk up to node_modules
│ .json     │          │      ↓       │
│    ↓      │          │ cache hit?   │
│ (in mem)  │          │   ├─ yes ────┼──▶ read JSON       0.5 ms
└─────┬─────┘          │   └─ no  ────┼──▶ parse .d.ts   207 ms
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

The `core` / `nest` seam from `PROBLEM.md`, made concrete.

```
src/
├── main.ts                     entry, bin target
├── cli/
│   ├── doc.command.ts          the single command
│   └── flags.ts                flag parsing and validation
│
├── core/                       ← zero Nest knowledge, extractable
│   ├── resolve/
│   │   ├── find-package.ts     walk up from cwd to node_modules
│   │   ├── entry-types.ts      package.json → entry .d.ts
│   │   └── types.ts
│   ├── extract/
│   │   ├── parse.ts            ts.createSourceFile, walk AST
│   │   ├── barrels.ts          follow export * and named re-exports
│   │   ├── jsdoc.ts            comment + tag extraction
│   │   └── signature.ts        declaration text normalisation
│   ├── cache/
│   │   ├── store.ts            read/write, key derivation
│   │   └── paths.ts            XDG-compliant cache dir
│   └── render/
│       ├── ansi.ts             colour primitives, width handling
│       ├── markdown.ts         marked tokens → ANSI
│       ├── table.ts            HTML table → terminal table
│       └── code.ts             minimal TS/JS highlighter
│
└── nest/                       ← Nest-specific knowledge
    ├── guides/
    │   ├── index.ts            load and query guides.json
    │   └── concepts.ts         concept name → slug
    ├── aliases.ts              docs URL → guide slug
    ├── public-api.ts           @publicApi filtering
    └── see-links.ts            @see tag → local guide anchor

scripts/                        ← build time only, not shipped
├── build-guides.ts             fetch docs repo → guides.json
├── build-aliases.ts            parse *.routes.ts → aliases.json
└── bundle.ts                   esbuild config
```

`core/` never imports from `nest/`. Enforce it with an ESLint boundary rule from day one, so extraction later is a directory move rather than an untangling exercise.

---

## 4. Resolution

### 4.1 Query classification

One positional argument carries three possible meanings. Resolution order:

```
1. exact guide slug            "interceptors"        → guide
2. exact concept alias         "providers"           → guide (components.md)
3. package name                "@nestjs/common"      → package index
4. package.symbol              "common.Injectable"   → symbol
5. fuzzy match                 "intercepters"        → "did you mean interceptors?"
6. miss                        → exit 1 with suggestions
```

`--guide` and `--api` short-circuit to steps 1–2 or 3–4 respectively. Ambiguity (a name existing in both spaces) prints both headings and asks the user to disambiguate rather than guessing.

The `common.X` shorthand expands `common` → `@nestjs/common` via a static table of the official scope. Unscoped names not in that table are treated as literal package names.

### 4.2 Finding the package

Walk up from `cwd` looking for `node_modules/<name>`. Stop at filesystem root or a `.git` boundary, whichever comes first. If nothing is found, the tool reports that the package is not installed and falls back to guide lookups only — it does not fetch from the registry, because that would break the offline guarantee.

### 4.3 Finding the entry declaration file

Four cases, in order. Nest 12 is case 3, which is the one naive implementations miss.

```ts
// 1. explicit types field (older packages)
pkg.types ?? pkg.typings

// 2. exports map with a types condition
pkg.exports["."]?.types

// 3. exports map without one → sibling inference   ← @nestjs/common@12
//    "." : "./index.js"  ⟹  "./index.d.ts"
resolveExports(pkg, ".").replace(/\.js$/, ".d.ts")

// 4. @types/* fallback
node_modules/@types/<name-with-slashes-flattened>/index.d.ts
```

Verified against `@nestjs/common@12.0.1`, which declares `"type": "module"`, an `exports` map, and **no `types` field at all**.

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

Both must be followed. Handling only the wildcard form finds 155 of 206 exports — the ~50 interface names come through the named form. Specifiers are written with `.js` extensions (ESM); rewrite to `.d.ts`, and fall back to `<spec>/index.d.ts` for directory specifiers.

Track visited files in a `Set` to terminate on cycles.

### 5.2 Per-declaration extraction

For each declaration node with a name:

| Field | Source |
|---|---|
| `name` | `node.name.text` |
| `doc` | `node.jsDoc.at(-1).comment` |
| `tags` | `node.jsDoc.at(-1).tags[].tagName.text` |
| `signature` | `node.getText()`, JSDoc lines stripped |
| `see` | `tags` filtered to `see`, link text parsed out |
| `isPublic` | `tags.includes("publicApi")` |
| `file`, `line` | for `--src` and error messages |

`ts.createSourceFile` must be called with `setParentNodes: true` for `getText()` to work.

### 5.3 Cache

```
~/.cache/getnestdoc/@nestjs+common@12.0.1.json      (XDG_CACHE_HOME aware)
```

Key is package name plus exact resolved version from its `package.json`. Version is part of the key, so upgrades invalidate naturally and no staleness check is needed. Writes are atomic — temp file plus rename — so concurrent invocations cannot tear a cache entry.

Measured: 150 KB for 220 symbols, 0.5 ms to read and parse. Cold extraction is 207 ms; cached is effectively free.

`nest-doc --clear-cache` exists for when a package is reinstalled at the same version.

---

## 6. Guide pipeline

### 6.1 Build time

Run in CI on a schedule and before each release. Never at install time, never at runtime.

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
- **Wrap on `process.stdout.columns`**, capped at 100 for readability on wide terminals, floored at 40.
- **Never page internally.** Print and exit. Users pipe to `$PAGER` themselves, which is what `go doc` does and why it composes.
- **Width-aware truncation** for long TypeScript signatures — break at parameter boundaries, not mid-token.

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

Bundling is mandatory, not an optimisation. Unbundled, module loading costs 217 ms; bundled, 48 ms. It is the difference between shipping and not shipping.

Optional peers must be marked external or esbuild fails to resolve Nest's lazy `require` calls:

```
--external:class-validator --external:class-transformer
--external:@nestjs/websockets --external:@nestjs/websockets/socket-module
--external:@nestjs/microservices --external:@nestjs/microservices/microservices-module
--external:@nestjs/platform-express --external:cache-manager
```

`typescript` is pinned to `6.0.3` exactly. Version 7 is the native Go port and exports only `version` and `versionMajorMinor` — no `createSourceFile`, no Compiler API at all. A bump to 7 fails at runtime, not at install. See ADR-0001.

`typescript` is a runtime dependency, not a devDependency, because extraction needs it in the user's installed copy. It is deliberately **not** bundled — 40 MB is unacceptable in a bundle — and is instead lazy-imported only on the symbol path, so guide lookups never pay for it.

---

## 9. Performance budget

The target is 150 ms. Anything slower loses to alt-tabbing to a browser, which is the actual competition.

| Stage | Cost | Cumulative |
|---|---|---|
| `node` process start | 23 ms | 23 ms |
| CLI framework (bundled) | +74 ms | 97 ms |
| `marked` lexer | +18 ms | 115 ms |
| Guide JSON load | ~1 ms | 116 ms |
| Render to ANSI | ~3 ms | **~119 ms** |
| *Symbol path, cached* | +0.5 ms | ~120 ms |
| *Symbol path, cold* | +207 ms | ~327 ms |

Roughly 74 ms of that is the CLI framework — over 60% of the budget, and the largest single controllable cost. ADR-0005 holds that decision open.

**Lazy-load discipline.** `typescript` loads only on symbol lookups. `marked` is not needed at all at runtime if guides ship pre-tokenised — it is a build-time dependency, and the 18 ms line above disappears once §6.1 is implemented. Measure after every phase; a regression here is a bug, not a tradeoff.

---

## 10. Failure modes

| Situation | Behaviour |
|---|---|
| Package not installed | Report it, offer the guide match if one exists, exit 1 |
| Package ships no types | Say so, suggest `@types/<name>`, exit 1 |
| Symbol not found in package | List near matches from that package's export list |
| Cache corrupt | Delete the entry, re-extract, continue silently |
| Cache directory unwritable | Warn once to stderr, continue without caching |
| `typescript` import fails | Guide lookups keep working; symbol lookups error clearly |
| Terminal width unavailable | Default to 80 |

The tool never fetches at runtime and never fails a guide lookup because of a symbol-side problem. The two paths are independent by design.
