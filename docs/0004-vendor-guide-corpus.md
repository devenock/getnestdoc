# ADR-0004: Vendor the guide corpus at build time

**Status:** Accepted · **Date:** 2026-08-29

## Context

The guides live in `nestjs/docs.nestjs.com`. Three options: fetch at runtime, fetch on install, or bake in at build time.

Licence verified: a single MIT licence at the repository root, whose text explicitly grants rights over "the Software and associated documentation files". No separate content licence. `package.json` declares `"license": "MIT"`. Vendoring is permitted with the copyright notice retained.

Corpus size: 143 markdown files, 1.9 MB.

## Decision

Fetch, transform, and tokenise at build time. Ship `data/guides.json` and `data/aliases.json` inside the package.

## Rationale

Runtime fetching breaks the offline guarantee, which is a core design principle and the main advantage over a browser. Install-time fetching makes installs fail behind corporate proxies and in air-gapped environments.

1.9 MB is a rounding error next to the 444 KB bundle plus `typescript`. Pre-tokenising also removes the markdown parser from the runtime path entirely.

The alias table is generated from the docs repo's own `*.routes.ts` route definitions rather than hand-maintained, so it stays correct as the docs change. The build fails if any route path has no corresponding file.

## Consequences

- Guides are pinned to the release. Staleness is bounded by release cadence — refresh in CI on a schedule.
- `nest-doc update` provides an escape hatch for users who want a newer corpus, as the only networked command.
- Retain the Nest copyright notice in the package and attribute clearly in the README.
- A docs repo restructure breaks the build script. It fails loudly at build time, never silently at runtime.
