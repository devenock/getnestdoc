# ADR-0003: Hand-write the terminal renderer

**Status:** Accepted · **Date:** 2026-08-29

## Context

Rendering markdown to ANSI is solved — `marked-terminal` is the standard choice. Measured cost, bundled with esbuild (the fair comparison, since we bundle anyway):

| Library | Bundled wall clock | Over the 23 ms node floor |
|---|---|---|
| `marked` (lexer only) | 41 ms | **+18 ms** |
| `marked` + `marked-terminal` | 102 ms | **+79 ms** |
| `cli-highlight` | — | pulls all of highlight.js |

The budget is 150 ms. With the CLI framework at +74 ms, `marked-terminal` lands the hot path at ~176 ms before a file has been read.

## Decision

Use `marked.lexer()` for tokenising only. Write the ANSI renderer by hand. Skip `cli-highlight`; ship a small regex highlighter for TypeScript.

## Rationale

Cost is the trigger, but the convenience being bought is convenience we cannot use. Nest's guides are not plain markdown — 453 `@@filename` directives, 227 `@@switch` blocks, 35 HTML tables, 36 Angular ad components, and ~300 internal links needing alias rewriting. `marked-terminal` handles none of it. We were always going to write custom handling; the only question was whether to also pay 79 ms for the parts it does cover.

Once guides ship pre-tokenised (`ARCHITECTURE.md` §6.1), `marked` becomes a build-time dependency and the 18 ms disappears from the runtime entirely.

## Consequences

- A few hundred lines of renderer to own and test: wrapping, tables, lists, code blocks, `NO_COLOR`, non-TTY output.
- Full control over `@@switch` and `@@filename`, which no library offers.
- Syntax highlighting is approximate. Fine for documentation samples; it does not need to be a real parser.
- Rendering must be tested against all 143 guides, not a sample, to catch edge cases in a hand-written walker.
