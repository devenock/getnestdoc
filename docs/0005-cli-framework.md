# ADR-0005: CLI framework — `nest-commander` or plain `commander`

**Status:** Accepted · **Date:** 2026-08-30

This is the only decision here that is expensive to reverse. It determines the shape of every command file. It is also the only one that is genuinely a judgement call rather than a fact, so it is recorded open rather than settled.

## Context

The original intent was to build the CLI with NestJS itself, via `nest-commander`. Two findings complicate that.

### Cost

Measured, bundled with esbuild:

| Configuration | Wall clock | Breakdown |
|---|---|---|
| Bare `node -e ""` | 23 ms | — |
| `nest-commander`, unbundled | 220 ms | `require` 217 ms, DI container 10 ms |
| `nest-commander`, bundled | 97 ms | `require` 48 ms, DI container 9 ms |

The DI container is essentially free at 9 ms. The cost is loading the Nest module graph. Bundling recovers 123 ms of it, but ~74 ms remains — **over 60% of the 150 ms budget**, and the largest single controllable cost in the tool.

Plain `commander` would land the same hot path near 46 ms. Roughly 2.5× faster overall.

### Version support

```
nest-commander@3.20.1 peerDependencies:
  "@nestjs/common": "^8.0.0 || ^9.0.0 || ^10.0.0 || ^11.0.0"
  "@nestjs/core":   "^8.0.0 || ^9.0.0 || ^10.0.0 || ^11.0.0"
```

Nest 12 is current and is what we are documenting. Building on `nest-commander` today means running Nest 11 while shipping a tool whose purpose is reading Nest 12 docs. Under strict pnpm the peer conflict is an install error, not a warning.

This does not affect correctness — the tool reads whatever is in the user's `node_modules` regardless of what it runs on. But it weakens the dogfooding argument, which was the entire case for the framework.

### Tooling

Node 22 runs TypeScript natively via type stripping, but only for **erasable syntax**. Verified:

```console
$ node decorators.ts
SyntaxError: Invalid or unexpected token     # @Cmd()
```

`nest-commander` requires `@Command()` and `@Injectable()`. Decorators are not erasable, so choosing it means native execution is unavailable and a transpiler (tsx, swc, ts-node) is needed for dev and tests. Plain `commander` needs no decorators, so `node script.ts` and `node --test suite.test.ts` work with zero tooling.

Not decisive on its own, but it is a third cost on the same side of the ledger.

## Options

**A. `nest-commander`.** Coherent story: a Nest tool built with Nest. DI genuinely suits the service shape here — resolver, extractor, cache, renderer, guide index all inject cleanly. `CommandTestFactory` gives familiar testing ergonomics. Costs ~74 ms and pins to Nest 11.

**B. Plain `commander` with hand-wired dependencies.** ~46 ms total, roughly 2.5× faster. No version ceiling. No transpiler needed for dev or tests. Loses the dogfooding story. The services are constructor-injectable either way; wiring five of them by hand in `main.ts` is a dozen lines, not a burden.

**C. `nest-commander` behind a lazy boundary.** Guide lookups skip the container; symbol lookups bootstrap it. Adds a conditional bootstrap path and two code paths to test, for a saving only on the cheaper half. Complexity is not obviously worth it.

## Recommendation

**Option B**, unless the dogfooding story is load-bearing.

The case for A was that a Nest tool built in Nest is a stronger artifact. That argument is weakened by the Nest 11 ceiling — "built with Nest" reads differently when it means the previous major. And the cost is real: 74 ms of a 150 ms budget spent on a DI container that measurably contributes 9 ms of that, for a process that constructs about five objects and exits.

Native TypeScript execution is a smaller factor but points the same way.

The counter-argument is honest and might win: if this tool is partly a credibility artifact for Nest-ecosystem work, then being built with Nest is a feature that a benchmark cannot price. 97 ms is under budget. Nobody will notice the difference between 46 ms and 97 ms in daily use — both are instant to a human. The 150 ms target is what matters, and A clears it.

If A is chosen, the constraints from ADR-0003 become mandatory rather than merely advisable: with `nest-commander` at 74 ms there is no room for a heavy renderer, and every subsequent dependency must be weighed against ~30 ms of headroom.

## Decision

**Option B: plain `commander`, hand-wired dependencies.** Confirmed by the project owner when asked to choose at the start of Phase 0, on the recommendation above — the 74 ms Nest 11 tax was not judged worth paying against a 150 ms budget with ~30 ms headroom.

## Consequences

- No `@Command()` / `@Injectable()` decorators anywhere in `src/`. `main.ts` wires `resolve`, `extract`, `cache`, `render`, and the guide index by hand — five constructor calls, not a framework.
- No Nest version ceiling: the tool's own dependency graph is independent of which Nest major a user's project is on.
- Native TypeScript execution is available for the whole codebase — `node script.ts` and `node --test suite.test.ts` run without a transpiler, per TESTING.md.
- Loses the "built with Nest" dogfooding story. If that story becomes load-bearing later (e.g. as a credibility artifact), revisit — this ADR is reversible, just expensive to reverse, per its own opening line.
- CI benchmark threshold is set assuming the ~46 ms hot path this option gives, not the ~97 ms of Option A.
