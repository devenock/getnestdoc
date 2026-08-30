# ADR-0002: Extract by parsing, not type-checking

**Status:** Accepted · **Date:** 2026-08-29

## Context

Two ways to read a `.d.ts` with the Compiler API: build a `Program` and use the `TypeChecker`, or parse a single file with `createSourceFile` and walk the AST.

The checker path is the conventional choice and what most tooling reaches for. Both were built and measured against `@nestjs/common@12.0.1`:

| Approach | Time | Symbols | Signature produced |
|---|---|---|---|
| `createProgram` + `TypeChecker` | 1310 ms | 206 | `(options?: ScopeOptions \| undefined) => ClassDecorator` |
| `createSourceFile`, parse only | 207 ms | 155 | `export declare function Injectable(options?: InjectableOptions): ClassDecorator;` |

## Decision

Parse-only is the primary extraction path.

## Rationale

Faster by 6.3×, which matters against a 150 ms budget. But the output quality argument is the stronger one.

A type checker exists to **infer**. A declaration file has nothing to infer — every type is already written out explicitly by the package author. Running the checker over one is largely wasted work, and its normalisation actively destroys information: it expanded the author's named alias `InjectableOptions` into the structural `ScopeOptions | undefined`. The parse-only path preserves what the author wrote, which is what a documentation reader should show.

The 155-vs-206 gap is not a limitation of the approach. The spike followed `export * from` but skipped named re-exports (`export { A, B } from`), which `index.d.ts` uses for ~50 interface names. Handling both forms closes the gap.

## Consequences

- Barrel following, module specifier resolution, and cycle protection are ours to implement. Bounded and testable.
- No cross-package type resolution. Acceptable — we render declarations, not resolved types.
- Signatures reflect author intent rather than checker normalisation. Better for documentation, worse if someone wants a fully expanded type. `--resolve-types` can expose the checker path later for that case.
- Phase 6 asserts an export count of 206 in tests (corrected from "Phase 3" — that's the terminal renderer, not extraction), since the named-re-export gap is the most likely thing to get silently wrong.
