# ADR-0006: Package name `getnestdoc`, binary `nest-doc`

**Status:** Accepted · **Date:** 2026-08-29

## Context

The tool was to install as `getnestdoc` and be invoked as `nestdoc`. Registry check:

| Name | Status |
|---|---|
| `getnestdoc` | available |
| `nest-doc` | available |
| `nestdoc` | **taken** |
| `ndoc` | taken |

`nestdoc@0.0.71` is a real package, not a squat. It describes itself as a "Nest.JS documentation generator", was last published in September 2023, and declares:

```json
"bin": { "nestdoc": "bin/nestdoc" }
```

Claiming `nestdoc` as a binary would collide on `PATH` for anyone who has it installed, and would confuse a documentation *generator* with a documentation *reader* — close enough in the same ecosystem to be a genuinely bad first impression.

A binary named `nestjs` was rejected earlier for a different reason: NestJS is a trademarked project name, `nest` belongs to `@nestjs/cli`, and an unofficial tool claiming either implies a status it does not have.

## Decision

- **npm package:** `getnestdoc`
- **binary:** `nest-doc`
- Reserve the `nest-doc` package name as a placeholder pointing at `getnestdoc`, to protect the binary name from a future collision.

## Rationale

`nest-doc` is eight characters, free on the registry, reads as a command, and mirrors `go doc` almost exactly. The hyphen distinguishes it from the abandoned `nestdoc` clearly enough to avoid confusion while staying obvious to type.

Package name and binary name need not match. `getnestdoc` keeps the brandable install name and a plausible domain, while the binary stays short — the property that matters, since it is typed dozens of times a day and the install name is typed once.

Compound naming like this is well tolerated in the ecosystem — `nest-commander` is precedent — in a way that claiming the bare `nest` or `nestjs` binary would not be.

## Consequences

- README and all documentation say `npm i -g getnestdoc`, then `nest-doc <query>`. The mismatch needs stating explicitly and early, or users will try `getnestdoc interceptors`.
- Reserving `nest-doc` costs one placeholder publish.
- Consider a `ndoc`-style short alias in the `bin` map later if users ask. `ndoc` itself is taken; do not claim it.
- If the abandoned `nestdoc` is ever deprecated or transferred, revisit — but do not plan around it.
