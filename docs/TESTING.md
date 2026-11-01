# Testing

Every change ships with green tests and, where latency is relevant, a measured number against the budget in `scripts/bench.ts`.

---

## Tooling

**`node --test` with native TypeScript. No test framework, no transpiler.**

```console
$ node script.ts              # runs — native type stripping
$ node --test suite.test.ts   # runs — node:test resolves .ts directly
```

No vitest, no jest, no ts-node, no tsx. Consistent with a project whose core constraint is startup cost.

Node's type stripping handles **erasable syntax only** — no decorators, no `enum`, no `namespace`. This is exactly why ADR-0005 picked plain `commander` over `nest-commander`: `@Command()`/`@Injectable()` decorators would have required a transpiler for both dev and tests. **Rule:** no `enum` and no `namespace` anywhere in `src/`. Use `as const` objects and union types instead.

---

## Layers

**Unit** — pure functions, no filesystem. Renderer, alias resolution, query classification, signature formatting. Fast, and the bulk of the suite.

**Fixture** — real data committed to `test/fixtures/`. Extraction against real `.d.ts` trees, corpus transformation against real markdown. This is where the bugs actually are.

**Integration** — spawn the built binary, assert stdout, stderr, and exit code. Few, but they are the only tests that prove the thing works.

**Benchmark** — wall clock against a threshold, in CI, failing on regression.

---

## Fixtures

Commit real packages, not hand-written stubs. Hand-written `.d.ts` files agree with your mental model, which is exactly the failure being tested for.

```
test/fixtures/
├── node_modules/@nestjs/common/     v12.0.1  ESM, exports map, no types field
├── node_modules/@nestjs/common-11/  v11.x    prior packaging
├── node_modules/@nestjs/common-10/  v10.x    prior packaging
├── node_modules/@nestjs/core/       v12.0.1  exports["."] as a bare string
├── node_modules/@nestjs/swagger/    v12.0.1  zero JSDoc, zero @publicApi tags
├── node_modules/typed-legacy/       "types" field
├── node_modules/untyped/            no types at all
└── docs-snapshot/                   pinned content/ + routes for corpus tests
```

Three Nest majors for `@nestjs/common`, because packaging changed across them and most real projects are not on the newest. Generate with `npm pack`, extract, commit — record the exact version and why in `FIXTURES.md` beside them.

---

## Non-negotiables

**Exact counts, not "some symbols".** Extraction handling only `export *` finds 155 of 206 real exports and looks correct — the missing 51 are named re-exports. An exact-count assertion is the only thing that catches this; a loose one ("at least some symbols") would pass anyway. Same principle wherever a silent-truncation bug is possible.

**Render the whole corpus, not a sample.** Hand-written renderers fail on the one file with a nested table inside a list. Iterate all 143 guides, every time.

**Every latency-relevant change re-runs the benchmark.** Headroom is ~100 ms on every hot path (ARCHITECTURE.md §9) — generous, which is exactly how it gets spent unnoticed. A regression is invisible without a threshold.

**Test the piped path.** ANSI leaking into `nest-doc x | grep` is a real bug that no TTY test catches. Assert `\x1b` is absent from non-TTY output.

**No mocking the filesystem.** Fixtures are real directories. A mock that returns what you expect proves only that you know what you expect.

---

## Benchmark harness

Runs in CI on every commit.

```
scripts/bench.ts [--budget=ms] [--cwd=dir] [query]
  → fresh, empty XDG_CACHE_HOME and XDG_DATA_HOME for the whole invocation
  → spawn the built binary N=20 times from --cwd
  → discard first 3 (page cache warmup — and, for a symbol query, the one cold extraction)
  → report median and p95
  → exit 1 if median exceeds the threshold
```

Thresholds live in the `--budget` argument at each call site in CI (`.github/workflows/ci.yml`, mirrored in `publish.yml`):

| Call | Path measured | Budget |
|---|---|---|
| `bench` | `--version` — process start plus CLI framework, the floor | 60 ms |
| `bench -- --budget=150 interceptors` | guide lookup | 150 ms |
| `bench -- --budget=150 --cwd=test/fixtures common.Injectable` | symbol lookup, cached live `node_modules` | 150 ms |
| `bench -- --budget=150 --cwd=test/fixtures throttler.Throttle` | symbol lookup, bundled fallback (ADR-0010) | 150 ms |

---

## Scope conformance

`npm run verify:scope` (`scripts/verify-scope.ts`) checks the tool against real installs of the whole official `@nestjs/*` scope, using the TypeScript checker as an independent oracle. For each of the three latest Nest majors (or `--majors=10,11,12`) it installs the newest release of every official package built for that major — chosen by each package's declared `@nestjs/common` peer range — into its own project, then for every entry point (each package root plus every subpath its exports map names) asserts:

1. our entry file is the one `ts.resolveModuleName` (NodeNext) resolves;
2. our export list equals `checker.getExportsOfModule`, name for name;
3. every export the checker sees a doc comment on has one in our record;
4. `nest-doc <entry>` and `nest-doc <entry>.<name>` exit 0 with the right header, for every export.

It's networked and takes a couple of minutes, so it isn't part of `npm test` or CI — run it before a release, and after any change to resolution or extraction. Last run (2026-11-01): Nest 10, 11, 12 — 118 entry points, 4,144 exports, 4,262 CLI lookups, zero differences.
