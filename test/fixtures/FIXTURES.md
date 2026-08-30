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

## node_modules/

Real packages via `npm pack` + extract, not hand-written `.d.ts` stubs (TESTING.md
§Fixtures). Used by `test/resolve.test.ts` (Phase 5). `.gitignore` blanket-excludes
`node_modules/` everywhere else in the repo; `!test/fixtures/node_modules/**`
carves this one back in.

| Directory | Package@version | Entry resolution case |
|---|---|---|
| `@nestjs/common/` | `@nestjs/common@12.0.1` | 3 — `exports["."]` present, no `types` condition; sibling-infer `./index.js` → `./index.d.ts` |
| `@nestjs/common-11/` | `@nestjs/common@11.2.3` | 3 — **no `exports` map at all**, no `main` either; falls all the way to the implicit `./index.js` default before sibling-inferring `.d.ts` |
| `@nestjs/common-10/` | `@nestjs/common@10.4.22` | 3 — same shape as 11.2.3 |
| `@nestjs/core/` | `@nestjs/core@12.0.1` | 3 — `exports["."]` is a bare string (`"./index.js"`), not an object with conditions; sibling-infer straight from it |
| `@nestjs/swagger/` | `@nestjs/swagger@12.0.1` | 1 — has **both** an explicit top-level `"types": "dist/index.d.ts"` and a conditional `exports` map; case 1 wins on priority even though case 2 would also resolve |
| `typed-legacy/` | `picocolors@1.0.1` | 1 — explicit top-level `"types": "./picocolors.d.ts"`, no `exports` map to even consider |
| `untyped/` | `is-thirteen@2.0.0` | none resolve — no `types`/`typings`/`exports`, no `.d.ts` anywhere in the package, no `@types/is-thirteen` published. Exit 3. |

**Phase 8 (ADR-0007) findings, measured against these three real packages:** zero colliding symbol names across all 420 unique names extracted from `@nestjs/common` (206), `@nestjs/core` (54), and `@nestjs/swagger` (160) — not just the public ones. `@nestjs/core` has 16 `@publicApi`-tagged symbols (ADR-0007 estimated 17 from an earlier, less precise pass; 16 is the measured, verified number and is what the tests assert). `@nestjs/swagger` confirmed to ship **zero** JSDoc comments and **zero** `@publicApi` tags across all 160 exports — the package-index fallback (list everything when nothing is tagged public) and the "no documentation available" per-symbol fallback are both tested against it directly.

**Finding:** ARCHITECTURE.md §4.3 describes case 3 as "exports map without a
types condition → sibling inference," measured against 12.0.1 only. Verified
against the real 10.4.22 and 11.2.3 tarballs (not `npm view`, which computes a
misleading `types` value even when the raw `package.json` has none — always
check the actual downloaded tarball): neither has an `exports` map *or* a
`main` field at all. Node/TypeScript's implicit default (`./index.js`) has to
run first before the same `.js` → `.d.ts` sibling inference applies. Same
resolution case in spirit, but the resolver needs the main-or-default fallback
as part of it, not just "read `exports["."]`" — see `core/resolve/entry-types.ts`.
