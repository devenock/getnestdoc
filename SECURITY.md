# Security Policy

## Supported versions

`getnestdoc` is pre-1.0 and moves quickly. Only the latest published version receives security fixes — please upgrade before reporting an issue to confirm it still reproduces.

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Instead, use GitHub's private reporting:

**[github.com/devenock/getnestdoc/security/advisories/new](https://github.com/devenock/getnestdoc/security/advisories/new)**

This opens a draft security advisory visible only to the maintainer until a fix is ready. Include:

- The version of `getnestdoc` affected (`nest-doc --version`)
- Steps to reproduce, ideally a minimal `package.json`/`.d.ts` that triggers it
- What you'd expect to happen instead

If GitHub's reporting form isn't an option for you, open a regular issue asking for an alternative contact — without vulnerability details in the issue itself.

## What to expect

This is a solo-maintained project, not a company with an SLA. A best-effort response within a few days is the realistic expectation, not a guarantee. Confirmed vulnerabilities are fixed and released as a patch version; credit is given in the release notes unless you ask not to be named.

## Why this matters for this project specifically

`getnestdoc` runs against `.d.ts` files and `package.json` fields from whatever is installed in a user's `node_modules` — content this tool does not control and must treat as untrusted, the same way a browser treats a web page. Reports involving that trust boundary (path handling, anything written to disk, anything that reaches the terminal unfiltered) are taken seriously. See [`docs/DECISIONS.md`](./docs/DECISIONS.md), ADR-0009, for the design principle and the kind of issue it's meant to catch.
