# Fixtures

Real data, committed. See TESTING.md § Fixtures — hand-written stubs agree with your
mental model, which is exactly the failure being tested for.

## docs-snapshot/

Pinned snapshot of [nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com),
used by `test/guides.test.ts` (Phase 1) and later `test/aliases.test.ts` (Phase 2).
Fetched the same way `scripts/build-guides.ts` does, straight from
`codeload.github.com/nestjs/docs.nestjs.com/tar.gz/master` — not hand-picked.

- **Source commit:** `e1db7bc14893088915b7855bd24a63d4a2f13400`
- **Fetched:** 2026-08-30
- `content/` — all 143 guide markdown files (1.8 MB)
- `routes/` — all 13 `*.routes.ts` files, under the original `src/` path they were
  found at (e.g. `routes/app/homepage/pages/...`)

Measured against this snapshot at the time it was pinned: 143 guides, 453
`@@filename` occurrences (452 well-formed as the first line of a fence, one —
`content/websockets/gateways.md` — mid-fence with no `@@switch` present, an
upstream authoring slip), 227 `@@switch` splits, 36 `<app-banner-*>` occurrences,
35 HTML `<table>` blocks, 45 GFM pipe tables (80 tables total — see
ARCHITECTURE.md §6.1), 64 `<figure><img>` occurrences (62 render as standalone
images, 2 are embedded inside a GFM table cell in `content/recipes/terminus.md`
and render as `[image]` inline instead).

If upstream restructures, `scripts/build-guides.ts` fails loudly on the guide
count rather than silently producing a wrong `data/guides.json` — this snapshot
does not need to be re-pinned just because upstream moved on; it needs to be
re-pinned only if the transform itself changes and the fixtures no longer
exercise what they're meant to.
