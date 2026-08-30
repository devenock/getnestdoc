# CLAUDE.md

Working notes for AI assistance in this repo. Read `ARCHITECTURE.md`, `SPEC.md`, and the ADRs before proposing changes.

## What this is

A terminal documentation reader for NestJS. Installs as `getnestdoc`, runs as `nest-doc`. Two corpora: guides vendored from the Nest docs repo at build time, and API symbols parsed from the user's `node_modules` at runtime.

## Constraints that are not negotiable

**Latency budget is 150 ms.** This is the product, not a nice-to-have — the tool competes with alt-tabbing to a browser. Before adding any dependency, measure its bundled import cost. The CI benchmark fails the build on regression. Current headroom is roughly 30 ms.

**`typescript` is pinned to `6.0.3` exactly.** Version 7 is the Go port and exports only `version` and `versionMajorMinor`. Do not widen this range. Do not "upgrade to latest". See ADR-0001.

**No network in the hot path.** Guides ship in the package. `nest-doc update` is the only networked command. Suggestions to fetch from the registry or from docs.nestjs.com at lookup time contradict the core design.

**`core/` must not import from `nest/`.** Enforced by ESLint. `core/` is the extractable generic engine; `nest/` holds Nest-specific knowledge.

**Parse, don't type-check.** Do not reintroduce `ts.createProgram` on the main path. It is 6.3× slower and produces worse signatures. See ADR-0002.

## Things that look like bugs but aren't

- **Signatures show the author's type aliases**, not expanded structural types. Deliberate — ADR-0002.
- **Guide slugs don't match URLs.** `/providers` is `components.md`. The alias table is generated from the docs repo's route files, not hand-maintained.
- **`@@switch` blocks show only TypeScript** by default. The JavaScript half is stored and shown under `--js`.

## Known trap

Barrel extraction must handle **both** `export * from './x.js'` and `export { A, B } from './y.js'`. Handling only the first yields 155 symbols instead of 206 and appears to work. If an export count test fails, this is the first place to look.

## Testing expectations

- Render all 143 guides, not a sample. Hand-written renderers fail on edge cases.
- Resolution tested against Nest 10, 11, and 12 fixtures — packaging changed across those majors.
- Extraction asserts exactly 206 exports for `@nestjs/common@12.0.1`.
- Benchmark assertions run in CI on every commit.

## Style

Direct and compressed. This repo documents decisions in ADRs — when a non-obvious choice is made, write one. Do not restate what a doc already says; link to it.
