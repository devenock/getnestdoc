# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0](https://github.com/devenock/getnestdoc/compare/v0.1.2...v0.2.0) (2026-08-31)


### Features

* broaden npm keywords for discoverability ([966df15](https://github.com/devenock/getnestdoc/commit/966df15d8e716a460e5980b82a6aef7e4ed8298e))


### Bug Fixes

* remove dangling release-tag links from CHANGELOG ([970b1e5](https://github.com/devenock/getnestdoc/commit/970b1e552af5577c3a11b3148b49b07758c9577c))

## 0.1.2 - 2026-08-31

### Docs

- Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
- Added this changelog and CI/npm/node/license badges to the README.
- Removed `demo.cast` and its README reference.

### Fixed

- CI: the `@nestjs/swagger` test fixture's `dist/` directory was silently excluded from git by a `.gitignore` ordering bug, so it only ever existed locally — 5 tests failed on every fresh checkout. Reordered the ignore rules so the fixture allowlist wins.
- CI: widened a cold-extraction sanity check's threshold (800ms → 2000ms) after observing 939.6ms on GitHub Actions' shared runners, well past what local-machine contention alone justified.
- Regenerated `package-lock.json` to match what the registry currently resolves; the previous lock (produced by `npm install --package-lock-only`) was missing an optional platform dependency subtree, breaking `npm ci` on CI.

## 0.1.1 - 2026-08-31

### Security

- Cache file paths are now flattened and containment-checked before use, closing a path traversal via a package's `name`/`version` fields (CWE-22).
- Barrel export resolution (`export * from`) now refuses to follow specifiers that resolve outside the package root.
- Extracted symbol text (signatures, JSDoc, `@see` tags) is now stripped of raw control/escape-sequence bytes before being cached or printed, closing a terminal escape-sequence injection risk.

See [ADR-0009](./docs/DECISIONS.md#adr-0009-sanitize-everything-a-third-party-package-controls) for the full writeup.

### Fixed

- The pager (`less`) no longer duplicates content on scroll — dropped the `X` flag, which disabled the alternate-screen switch `less` relies on to redraw cleanly.

## 0.1.0 - 2026-08-31

Initial public release.

### Added

- Guide lookup (`nest-doc providers`), symbol lookup (`nest-doc common.Injectable`), package index (`nest-doc @nestjs/common`), and bare-symbol resolution (`nest-doc Get`).
- `nest-doc update` to refresh the bundled guide corpus.
- Auto-paging through `$PAGER`/`less` for output taller than the terminal.

0.1.0 through 0.1.2 predate git tagging — no release links for them. From 0.1.3 onward, [release-please](https://github.com/googleapis/release-please) generates each entry with a real compare link.
