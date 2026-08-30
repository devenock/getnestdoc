# STATUS

Current state and what's next. Ordered by what unblocks the most.

**Phase:** 0 done — skeleton, benchmark harness, and CI in place.

---

## Next

Build prompts for every phase are in `PROMPTS.md`. Contracts are in `SPEC.md`; verification requirements in `TESTING.md`.

| # | Phase | Status |
|---|---|---|
| 0 | Skeleton + benchmark harness | done |
| 1 | Guide corpus → `guides.json` | not started |
| 2 | Alias table → `aliases.json` | not started |
| 3 | Terminal renderer | not started |
| 4 | Guide command — **ship `0.1.0`** | not started |
| 5 | Package resolution | not started |
| 6 | Symbol extraction | not started |
| 7 | Cache | not started |
| 8 | Cross-linking + package index + `@Decorator` lookup | not started |
| 9 | Release | not started |

## Measurements

Record every benchmark here as phases land. A number not written down is a number that gets argued about.

| Phase | Command | Budget | Measured |
|---|---|---|---|
| 0 | `nest-doc --version` | 60 ms | 26.9 ms median / 54.1 ms p95 (linked binary, this machine) |
| 4 | `nest-doc interceptors` | 150 ms | — |
| 7 | `nest-doc common.Injectable` (warm) | 150 ms | — |

## Settled

| Question | Answer | Where |
|---|---|---|
| Do published `.d.ts` retain JSDoc? | Yes — 220 `@publicApi` tags in `@nestjs/common@12.0.1` | PROBLEM §Gate 1 |
| Which TypeScript version? | `6.0.3` exact — 7.x has no JS Compiler API | ADR-0001 |
| Checker or parser? | Parser — 6.3× faster, better signatures | ADR-0002 |
| Which markdown renderer? | Hand-written; `marked` lexer only | ADR-0003 |
| Can the guides be vendored? | Yes, MIT, 143 files, 1.9 MB | ADR-0004 |
| Package and binary name? | `getnestdoc` / `nest-doc` — `nestdoc` is taken | ADR-0006 |
| Can users type `@Get` directly? | Yes — added in Phase 8; names are unique across the scope | ADR-0007 |
| Does Nest bootstrap fit the budget? | Yes, bundled: 97 ms of 150 ms | PROBLEM §Gate 3 |
| Test runner? | `node --test` + native TS, zero deps | TESTING |
| CLI framework? | Plain `commander` (Option B) | ADR-0005 |

---

## Risks

**Latency headroom is generous, not thin.** ADR-0005 settled on plain `commander` (Option B), so the framework line item is ~46 ms rather than the ~97 ms of `nest-commander`, leaving well over the ~30 ms headroom the ADR costed for Option A. Every dependency added after Phase 0 still needs measuring — the CI benchmark is the guard, and it exists from Phase 0 for this reason.

**Named re-exports are the likely silent bug.** Extraction that handles only `export *` finds 155 of 206 symbols and looks like it works. Phase 3 asserts the count.

**Docs repo restructure breaks the corpus build.** Fails at build time, never at runtime. Acceptable, but the build script needs an owner when it breaks.

**`typescript@6` is a frozen foundation.** No urgency, but there is an eventual migration or an indefinite freeze. Revisit when the Go port's API story settles.

---

## Explicitly out of scope for 1.0

Full-text search · documenting the user's own app · any TUI or interactive mode · non-Nest packages as a marketed feature · packages that ship no types
