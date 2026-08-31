# Contributing to getnestdoc

Thanks for considering it. This is a small, opinionated tool, and the fastest way to get a PR merged is to work with its existing conventions rather than against them — this doc is about what those are.

Participating means following the [Code of Conduct](./CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](./SECURITY.md) instead of opening an issue.

## Before you start

Read these first — they explain *why* the code looks the way it does, and changes that don't fit the reasoning in them are the most common reason a PR stalls:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the tool works end to end
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — every non-obvious engineering call and why it was made (ADRs)
- [`docs/SPEC.md`](./docs/SPEC.md) — exact contracts: JSON shapes, output formats, exit codes
- [`docs/TESTING.md`](./docs/TESTING.md) — testing philosophy and non-negotiables
- [`CLAUDE.md`](./CLAUDE.md) — the short version: constraints that aren't negotiable, and traps that look like bugs but aren't

## Setup

```bash
git clone https://github.com/devenock/getnestdoc.git
cd getnestdoc
npm install
```

Node 22.6 or newer. There is no build step for development — Node's native TypeScript execution runs `.ts` files directly:

```bash
node src/main.ts interceptors
```

## Before opening a PR

```bash
npm run typecheck   # tsc
npm run lint        # eslint .
npm test            # node --test, real fixtures, no mocks
npm run build        # bundles dist/nest-doc.mjs
npm run bench        # latency budget — see below
```

All four need to pass. CI runs the same commands.

## The constraints that shape everything here

**Latency is the product, not a nice-to-have.** Target is under 150 ms for a lookup. If your change adds a dependency or does meaningfully more work on the hot path, run `npm run bench` and say what it measured in your PR description. A change that regresses the benchmark without a compelling reason won't be merged as-is.

**`core/` must not import from `nest/`.** Enforced by ESLint, not just convention. `core/` is the generic, extractable engine (rendering, resolution, extraction, caching); `nest/` is where Nest-specific knowledge lives (guides, the `common.X` shorthand, decorator lookup). If you're not sure which side something belongs on, ask in the PR rather than guessing.

**A package's `package.json` and `.d.ts` files are untrusted input, always.** This tool reads whatever's installed in a user's `node_modules` — that's third-party, potentially adversarial data, not something the CLI's own caller wrote. Any new code that builds a filesystem path or a terminal string from package content needs to go through the same sanitization the existing code does (`core/cache/paths.ts`, `core/extract/barrels.ts`, `core/extract/sanitize.ts`). See `docs/DECISIONS.md` ADR-0009 for what happens when this gets skipped — three real, exploitable bugs, all from treating third-party file content as trusted.

**No `enum`, no `namespace` in `src/`.** Node's native type stripping rejects both. Use `as const` objects and union types.

**`typescript` is pinned to `6.0.3` exactly, no caret.** Don't touch this without reading ADR-0001 first — version 7 is a different product (the Go port) with a different JS API surface.

## Testing

Real fixtures, not hand-written stubs — `test/fixtures/` has real `npm pack`-extracted packages and a real pinned snapshot of the docs corpus. A hand-written `.d.ts` stub agrees with your own mental model of what a package looks like, which is exactly the class of bug this project has been burned by before (see `docs/TESTING.md`'s non-negotiables). If your change touches extraction, resolution, or rendering, it needs a fixture-backed test, not a synthetic one — and if the bug you're fixing came from running an actual exploit or actual weird real-world input, a test built by reproducing that first (like the security fixes in ADR-0009) is worth more than one written straight from the fix.

Exact-count assertions (`extracts exactly 206 exports from @nestjs/common@12.0.1`, and similar) are deliberate, not fragile. A loose assertion like "extracts some symbols" would still pass if half the exports silently went missing. Don't loosen one of these to make a test pass — if it's failing, something upstream of it broke.

## Style

Comments are one-liners carrying the non-obvious "why" — a verified finding, a spec citation, a trap the next person would otherwise fall into. Not what the code already says. If you're restating the code, delete the comment instead.

When you make a genuinely non-obvious engineering call, write an ADR for it in `docs/DECISIONS.md` rather than only explaining it in the PR description — PR descriptions aren't discoverable six months later when someone's trying to understand why the code does what it does.

## Commit messages and PRs

Small, focused commits over one big one — this project's own history commits each piece of work separately rather than bundling unrelated changes. Explain *why*, not just what; the diff already shows what changed.

In your PR description:

- What problem this solves, and what issue (if any) it relates to
- What you measured, if the change is latency-relevant
- Anything you deliberately left out, and why

Don't bump the version in `package.json` — [release-please](https://github.com/googleapis/release-please) does that from commit messages when its release PR is merged. Use a [Conventional Commits](https://www.conventionalcommits.org/) prefix (`fix:`, `feat:`, `chore:`, `docs:`, and so on) so it bumps correctly.

Merging the release PR creates a git tag, which runs the full test suite and latency budget again, then pauses for the maintainer's manual approval before anything reaches npm — merging the PR does not, by itself, publish anything.
