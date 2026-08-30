# Specification

Contracts every phase depends on. `ARCHITECTURE.md` says how the system works; this file pins the exact shapes so phases can be built and tested independently.

Nothing here is negotiable mid-build. Changing a contract means updating this file first, then the phases that touch it.

---

## 1. `data/guides.json`

Produced by `scripts/build-guides.ts`. Consumed by the guide command.

```ts
type GuidesFile = {
  version: 1;              // bump invalidates consumers
  generatedAt: string;     // ISO 8601
  sourceCommit: string;    // docs repo commit SHA — provenance
  guides: Record<string, Guide>;   // key: slug
};

type Guide = {
  slug: string;      // "interceptors" | "fundamentals/injection-scopes"
  title: string;     // "Interceptors" — from the first heading
  file: string;      // "interceptors.md" — source path, for debugging
  headings: Heading[];
  tokens: Token[];
};

type Heading = {
  depth: number;      // 1-6, normalised: Nest's top-level `###` becomes 1
  text: string;
  anchor: string;     // kebab-case, matches docs.nestjs.com #fragments
  tokenIndex: number; // index into tokens[], for anchor jumps
};
```

### Token types

`marked` token types pass through unchanged except the four below, which replace or extend them.

```ts
type CodeToken = {
  type: "code";
  lang: string;
  filename?: string;   // from @@filename(x)
  ts: string;          // TypeScript variant — always present
  js?: string;         // JavaScript variant — present only if @@switch was used
};

type TableToken = {
  type: "table";
  header: string[];
  rows: string[][];
  align: ("left" | "right" | "center" | null)[];
};

type ImageToken = {
  type: "image";
  alt: string;
  src: string;         // absolute docs.nestjs.com URL
};

type InternalLinkToken = {
  type: "internalLink";
  text: string;
  slug: string;        // resolved local guide slug
  anchor?: string;
};
```

**Invariants asserted in tests:**
- Every `CodeToken.ts` is non-empty.
- No token contains the literal `@@filename`, `@@switch`, or `<app-banner`.
- Every `InternalLinkToken.slug` exists as a key in `guides`.
- `guides` has exactly 143 entries for the current docs revision. If the count changes, the build prints the delta and requires an explicit bump — silence would hide an upstream restructure.

---

## 2. `data/aliases.json`

Produced by `scripts/build-aliases.ts` from the docs repo's `*.routes.ts`.

```ts
type AliasFile = {
  version: 1;
  generatedAt: string;
  sourceCommit: string;
  urlToSlug: Record<string, string>;
};
```

Known entries, verified — these four are the ones naive path mapping gets wrong:

```json
{
  "providers":                       "components",
  "middleware":                      "middlewares",
  "fundamentals/injection-scopes":   "fundamentals/provider-scopes",
  "fundamentals/custom-providers":   "fundamentals/dependency-injection"
}
```

The fourth entry was previously documented as an identity mapping
(`fundamentals/custom-providers` → itself). Re-verified against the current
`fundamentals.routes.ts` in Phase 2: the URL redirects through `dependency-injection`
→ `custom-providers`, served by `DependencyInjectionComponent` (source directory
`dependency-injection/`) — there is no `fundamentals/custom-providers.md`, so the
identity mapping would violate the invariant below. Upstream renamed the component
and file since this was written; not a routing-parser bug.

**Invariant:** every value resolves to a key in `guides.json`. Build fails otherwise.

---

## 2b. `data/names.json`

Prebuilt name index for bare symbol lookup (ADR-0007). Generated alongside the guide corpus.

```ts
type NameIndex = {
  version: 1;
  generatedAt: string;
  names: Record<string, string[]>;   // "Get" → ["@nestjs/common"]
};
```

Covers the official `@nestjs` scope. Verified: zero colliding names across `@nestjs/common`, `core`, and `swagger`. Where a name maps to several packages, the CLI lists them and exits 1 rather than guessing.

---

## 3. Cache file

Path: `${XDG_CACHE_HOME:-~/.cache}/getnestdoc/<name>@<version>.json`, with `/` in scoped names replaced by `+` (`@nestjs/common@12.0.1` → `@nestjs+common@12.0.1.json`).

```ts
type CacheFile = {
  version: 1;            // bump invalidates every entry
  package: string;
  packageVersion: string;
  entryFile: string;     // absolute path extraction started from
  extractedAt: string;
  symbols: SymbolRecord[];
};

type SymbolRecord = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "enum" | "const" | "variable";
  signature: string;     // declaration text, JSDoc lines stripped, single line where possible
  doc: string;           // JSDoc body, markdown, no tags
  tags: { name: string; text: string }[];
  see: { text: string; url: string }[];
  isPublicApi: boolean;
  file: string;          // relative to package root
  line: number;          // 1-based
};
```

Version is part of the filename, so upgrades invalidate naturally and no staleness check is needed. Writes are atomic: temp file plus `rename`.

---

## 4. Output formats

These are acceptance criteria. "Looks fine" is not a test.

### 4.1 Symbol

```
@nestjs/common@12.0.1

function Injectable(options?: InjectableOptions): ClassDecorator

    Decorator that marks a class as a provider. Providers can be injected
    into other classes via constructor parameter injection using Nest's
    built-in Dependency Injection (DI) system.

    When injecting a provider, it must be visible within the module scope
    of the class it is being injected into.

  Parameters
    options    options specifying scope of injectable

  See also
    nest-doc providers
    nest-doc fundamentals/custom-providers
    nest-doc fundamentals/injection-scopes
```

Rules: package and resolved version on line 1. Signature unindented. Doc body indented four spaces, wrapped. Sections indented two, contents four. `See also` entries are runnable commands, not URLs.

### 4.2 Package index

```
@nestjs/common@12.0.1
206 exports, 177 public

DECORATORS
  Injectable          Marks a class as a provider
  Controller          Marks a class as a controller
  ...

INTERFACES
  CanActivate         Interface defining the canActivate() contract
  ...

  nest-doc --all @nestjs/common     include non-public exports
  nest-doc common.<name>            detail for one symbol
```

Grouped by kind. One-line summary = first sentence of the doc, truncated to terminal width. Public-only unless `--all`.

### 4.3 Guide

Rendered markdown. Title bold, headings coloured by depth, body wrapped to `min(columns, 100)`, code blocks indented and highlighted with `@@filename` shown as a header above the block.

### 4.4 Not found

```
No guide or symbol matches "intercepters".

Did you mean?
  nest-doc interceptors
  nest-doc exception-filters
```

Exit 1. Suggestions to stderr, so piping stays clean.

---

## 5. CLI contract

```
nest-doc <query>              lookup, auto-detected
nest-doc @Get                 decorator lookup
nest-doc Get                  bare symbol lookup
nest-doc <query> --guide      force guide
nest-doc <query> --api        force symbol
nest-doc <query> --js         JavaScript code samples
nest-doc --all <package>      include non-public exports
nest-doc update               refresh guide corpus (only networked command)
nest-doc --clear-cache
nest-doc --version
nest-doc --help
```

### Resolution order

```
1. exact guide slug          "interceptors"
2. alias table               "providers" → components
3. scoped package            "@nestjs/common"
4. package.symbol            "common.Injectable"
5. bare symbol / decorator   "@Get", "Get", "Injectable"
6. fuzzy suggestions
7. miss → exit 1
```

**Disambiguating a leading `@`** (ADR-0007):

| Pattern | Meaning |
|---|---|
| `@` + name with `/` | scoped package — `@nestjs/common` |
| `@` + one capitalised word | decorator — `@Get`, `@Injectable` |
| `@` + one lowercase word | exit 2 with a suggestion |

Guides win ties: `nest-doc Module` resolves to the guide; `--api` forces the symbol.

`--guide` restricts to 1–2, `--api` to 3–5. A query matching both prints both headings and asks the user to disambiguate; it never guesses.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | query not found |
| 2 | usage error — unknown flag, missing argument |
| 3 | package found but unusable — ships no types |
| 4 | internal error — unexpected, prints a stack trace |

### Environment

| Variable | Effect |
|---|---|
| `NO_COLOR` | disable ANSI, any value |
| `XDG_CACHE_HOME` | cache location |
| `FORCE_COLOR` | force ANSI when not a TTY |

When `!process.stdout.isTTY`, colour is off and width is 80 regardless of `columns`.

---

## 6. Dependencies

Runtime dependencies are a latency cost. Each addition needs a measured bundled import cost recorded in the PR.

| Package | Version | Why | Loaded |
|---|---|---|---|
| `typescript` | `6.0.3` **exact** | Compiler API; 7.x removed it (ADR-0001) | lazily, symbol path only |
| `commander` | `^15.0.0` | CLI parsing (ADR-0005) | always |

`marked` is a **devDependency**. Guides ship pre-tokenised, so it never loads at runtime.

Not used, deliberately: `marked-terminal` (+79 ms, ADR-0003), `cli-highlight` (pulls highlight.js), `chalk` (ANSI codes are a dozen constants).
