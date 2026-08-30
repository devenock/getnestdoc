# ADR-0001: Pin `typescript` to 6.0.3 exactly

**Status:** Accepted · **Date:** 2026-08-29

## Context

Symbol extraction requires the TypeScript Compiler API. The obvious dependency is `typescript@latest`.

`typescript@7.0.2` is currently `latest`. It is the native Go port, and its JavaScript export surface is two symbols:

```js
import ts from "typescript";   // 7.0.2
Object.keys(ts)                // → ["version", "versionMajorMinor"]
ts.createSourceFile            // → undefined
ts.createProgram               // → undefined
```

Verified against the published package. `typescript@6.0.3` is the last release carrying the JS Compiler API, and it is fully intact.

The failure mode is the dangerous part: `npm i typescript` installs successfully, typechecking passes, and the tool throws `undefined is not a function` at runtime on the first symbol lookup.

## Decision

Pin `"typescript": "6.0.3"` — exact, no caret — with an inline comment stating that 7.x removed the JS Compiler API.

Add a CI assertion that `typeof ts.createSourceFile === "function"`, so a transitive or careless bump fails the build rather than the user's first command.

## Consequences

- Immune to an accidental bump into a version that cannot work.
- Frozen off the 6.x line, forgoing later patches. Acceptable: we use a narrow, stable slice of the API — `createSourceFile` and AST node shapes.
- A known expiry date. Either the Go port eventually exposes a usable API surface and we migrate, or we stay on 6.x indefinitely. Revisit when the port's API story stabilises.
- `typescript` is a runtime dependency, not a devDependency, and is lazy-imported on the symbol path only so guide lookups never load it.
