# STATUS

Current state and what's next. Ordered by what unblocks the most.

**Phase:** 5 done — package resolution locates entry `.d.ts` files for real Nest 10/11/12 packages. No CLI wiring yet (extraction doesn't exist until Phase 6).

---

## Next

Build prompts for every phase are in `PROMPTS.md`. Contracts are in `SPEC.md`; verification requirements in `TESTING.md`.

| # | Phase | Status |
|---|---|---|
| 0 | Skeleton + benchmark harness | done |
| 1 | Guide corpus → `guides.json` | done |
| 2 | Alias table → `aliases.json` | done |
| 3 | Terminal renderer | done |
| 4 | Guide command — **ship `0.1.0`** | done |
| 5 | Package resolution | done |
| 6 | Symbol extraction | not started |
| 7 | Cache | not started |
| 8 | Cross-linking + package index + `@Decorator` lookup | not started |
| 9 | Release | not started |

## Measurements

Record every benchmark here as phases land. A number not written down is a number that gets argued about.

| Phase | Command | Budget | Measured |
|---|---|---|---|
| 0 | `nest-doc --version` | 60 ms | 26.9 ms median / 54.1 ms p95 (linked binary, this machine) |
| 4 | `nest-doc interceptors` | 150 ms | 42-51 ms median across runs (linked binary, this machine) |
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
| Only HTML `<table>`s in the corpus? | No — 45 more as GFM pipe tables, 80 total | ARCHITECTURE §6.1, Phase 1 |
| Heading anchor algorithm? | `text.replace(/\s/g, '-').toLowerCase()`, verified against `header-anchor.directive.ts` in the docs repo — no punctuation stripping | Phase 1 |
| Component name kebab-case → filename? | No — wrong for 29/145 real routes. Use the component's own import path directory instead (144/145) | ARCHITECTURE §6.2, Phase 2 |
| `fundamentals/custom-providers` alias target? | `fundamentals/dependency-injection`, not itself — component/file renamed upstream since SPEC.md was written | SPEC.md §2, Phase 2 |
| `@see` URL resolution via the alias table? | 100% (47/47) against real `@nestjs/common@12.0.1`, vs. 74.5% (35/47) naive | Phase 2 |
| Guide/GuideToken canonical type location? | `src/core/render/types.ts` — the renderer, not `scripts/`, owns the contract; build scripts import it back so there's one definition | Phase 3 |
| Table column widths under pressure? | Fair-share redistribution, not uniform proportional scaling — short columns (e.g. "Type") keep their natural width instead of being squeezed as hard as the long "Description" column | Phase 3 |
| Widest line across the real corpus? | 100 chars at a 100-char budget (a tightly-wrapped paragraph, not an overflow) — zero width violations across 143 guides × 3 widths × 2 colour modes | Phase 3 |
| Guide/AliasFile canonical type location? | `src/nest/guides/types.ts` and `src/nest/aliases.ts` — same reasoning as the token types: the runtime consumer owns the contract, build scripts import it back | Phase 4 |
| Commander's default usage-error exit code? | 1 for every error (missing argument, unknown option) — indistinguishable from "not found". `exitOverride()` + remapping to exit 2 needed to match SPEC.md §5 | Phase 4 |
| `concepts.ts` as a separate file? | No — "concept" lookups (`providers`) and alias-table lookups are the same table (`urlToSlug`); a separate file would just re-export it | ARCHITECTURE §3, Phase 4 |
| Which resolution case do Nest 10/11/12 actually take? | All three land on case 3, but not the same way. 12.0.1 has an `exports` map with no `types` condition (matches ARCHITECTURE §4.3 exactly). 11.2.3 and 10.4.22 have **neither an `exports` map nor a `main` field at all** — nothing for the documented "sibling-infer from `exports["."]`" to read. Node/TS's implicit `./index.js` default has to resolve first | ARCHITECTURE §4.3, Phase 5 |
| Exit code for "package ships no types"? | 3, not 1 — ARCHITECTURE §10's failure-modes table said exit 1, contradicting SPEC.md §5's own exit code table (and PROMPTS.md's explicit Phase 5 instruction). Corrected | ARCHITECTURE §10, Phase 5 |
| `common.X` official-scope table? | 33 packages, built from two verified sources: the `nestjs/nest` monorepo's `packages/` directory (9) plus every `@nestjs/*` string found in real guide code samples (24 more, cross-checked against npm) — not guessed | Phase 5 |

**0.1.0 readiness:** `nest-doc <slug>`, alias resolution, fuzzy "did you mean" suggestions, `--js`, correct exit codes (0/1/2), zero-escape-code piped output — all verified against the real linked binary, not just unit tests. Phase 9 (release) still needs to happen before actually publishing.

---

## Risks

**Latency headroom is generous, not thin.** ADR-0005 settled on plain `commander` (Option B), so the framework line item is ~46 ms rather than the ~97 ms of `nest-commander`, leaving well over the ~30 ms headroom the ADR costed for Option A. Every dependency added after Phase 0 still needs measuring — the CI benchmark is the guard, and it exists from Phase 0 for this reason.

**Named re-exports are the likely silent bug.** Extraction that handles only `export *` finds 155 of 206 symbols and looks like it works. Phase 6 asserts the count (corrected from "Phase 3" — that's the terminal renderer, not extraction).

**Docs repo restructure breaks the corpus build.** Fails at build time, never at runtime. Acceptable, but the build script needs an owner when it breaks.

**`guides.json` is 4.1 MB, over double ARCHITECTURE.md's ~2 MB estimate.** Even after stripping marked's redundant `raw` field (~2 MB of the unstripped 6.5 MB). The real corpus has grown since that number was written — a new `observability/` section and more tables/figures than originally documented. Not a build blocker, but worth watching once Phase 3 measures guide-JSON load time against the latency budget (ARCHITECTURE §9 assumes ~1 ms for this step).

**`typescript@6` is a frozen foundation.** No urgency, but there is an eventual migration or an indefinite freeze. Revisit when the Go port's API story settles.

---

## Explicitly out of scope for 1.0

Full-text search · documenting the user's own app · any TUI or interactive mode · non-Nest packages as a marketed feature · packages that ship no types
