# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- Cache file paths are now flattened and containment-checked before use, closing a path traversal via a package's `name`/`version` fields (CWE-22).
- Barrel export resolution (`export * from`) now refuses to follow specifiers that resolve outside the package root.
- Extracted symbol text (signatures, JSDoc, `@see` tags) is now stripped of raw control/escape-sequence bytes before being cached or printed, closing a terminal escape-sequence injection risk.

See [ADR-0009](./docs/DECISIONS.md#adr-0009-sanitize-everything-a-third-party-package-controls) for the full writeup.

### Fixed

- The pager (`less`) no longer duplicates content on scroll — dropped the `X` flag, which disabled the alternate-screen switch `less` relies on to redraw cleanly.

## [0.1.0] - 2026-08-31

Initial public release.

### Added

- Guide lookup (`nest-doc providers`), symbol lookup (`nest-doc common.Injectable`), package index (`nest-doc @nestjs/common`), and bare-symbol resolution (`nest-doc Get`).
- `nest-doc update` to refresh the bundled guide corpus.
- Auto-paging through `$PAGER`/`less` for output taller than the terminal.

[Unreleased]: https://github.com/devenock/getnestdoc/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/devenock/getnestdoc/releases/tag/v0.1.0
