# ADR-0007: Bare symbol lookup and the `@Decorator` form

**Status:** Accepted · **Date:** 2026-08-29

## Context

`SPEC.md` §5 defined four query forms: guide slug, alias, package name, and `package.symbol`. Testing the design against a natural user question — "what does `@Get` do?" — showed the grammar has no entry for it.

This is the most likely query the tool will receive. Nest's public API is overwhelmingly decorators. A developer reads `@Get()` in a controller and wants to know what it takes. They do not think `common.Get`; they type what they see.

The data supports serving it. Measured across `@nestjs/common@12.0.1`, `@nestjs/core@12.0.1`, and `@nestjs/swagger@12.0.1`:

- **Zero colliding public symbol names** across the three packages
- `Get` resolves uniquely to `@nestjs/common`, with JSDoc, `@publicApi`, and a `@see` link to `/controllers#routing`

Symbol names in the Nest scope are effectively globally unique, so a bare name identifies a package without qualification.

## Decision

Add two query forms and a disambiguation rule.

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

**Resolution order becomes:**

```
1. exact guide slug          "interceptors"
2. alias table               "providers"
3. scoped package            "@nestjs/common"
4. package.symbol            "common.Injectable"
5. bare symbol / decorator   "@Get", "Get", "Injectable"
6. fuzzy suggestions
7. miss → exit 1
```

Guides win ties. `nest-doc Module` could mean the guide or the decorator; guides are the cheaper, more common intent, and `--api` forces the other.

**Name index.** Bare lookup needs name → package. Ship a prebuilt index for the official `@nestjs` scope, generated alongside `guides.json`:

```ts
type NameIndex = {
  version: 1;
  names: Record<string, string[]>;   // "Get" → ["@nestjs/common"]
};
```

Prebuilt rather than scanned, because it is instant, needs no cache warm-up, and works before the package is installed — in which case the tool reports the symbol, names its package, and says it is not installed. Fall back to scanning installed `@nestjs/*` for anything outside the shipped index.

Where a name maps to several packages, print the list and exit 1 rather than guessing.

## Consequences

- The most natural query form works. Without this the tool answers a question users would not have asked.
- One more build artifact to generate and keep in sync with the guide corpus.
- The index covers the official scope only. Third-party Nest packages fall back to scanning, which is slower and requires installation.
- Phase 8 gains this work; `SPEC.md` §5 and the Phase 8 prompt are updated.

## Related finding: documentation coverage is not uniform

`@nestjs/swagger@12.0.1` ships **125 declaration files with zero JSDoc blocks and zero `@publicApi` tags**. `@nestjs/common` has 220 `@publicApi` tags; `@nestjs/core` has 17 public symbols.

So the tool's usefulness varies sharply by package. For swagger it can show signatures but has no prose to render.

Two requirements follow:

1. The `@publicApi` filter must degrade gracefully. A package with zero tags is not a package with zero public symbols — fall back to showing all exports rather than an empty list.
2. A symbol with no doc comment renders its signature plus an explicit "No documentation available in this package" line, never a blank section.

Both belong in Phase 8 acceptance criteria, tested against swagger specifically.
