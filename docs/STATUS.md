# STATUS

Current state and what's next. Ordered by what unblocks the most.

**Phase:** 9 mostly done — packaging, install, and licensing are verified. **Publishing to npm and opening the docs.nestjs.com issue are deliberately not done yet** — both are external, effectively-irreversible actions the user asked to hold off on until they give the explicit go-ahead. Everything else in the release checklist is complete: tarball contents verified (656.3 kB packed, 7 files — `LICENSE`, `README.md`, `data/*.json`, `dist/nest-doc.mjs`, `package.json`; no `test/`, `scripts/`, or fixtures), a real global install from the tarball works and `nest-doc` resolves on `PATH`, and two real gaps found and fixed along the way: no `LICENSE` file existed at all despite the README claiming MIT (added, including the required docs.nestjs.com copyright notice per ADR-0004 — previously only mentioned in README prose, never actually retained in the package), and the README claimed "Node 20 or newer" while `package.json`'s `engines` field and the esbuild bundle target both require Node 22.6+ (README corrected to match).

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
| 6 | Symbol extraction | done |
| 7 | Cache | done |
| 8 | Cross-linking + package index + `@Decorator` lookup | done |
| 9 | Release | packaging/install/licensing done; publish + docs.nestjs.com issue awaiting go-ahead |

## Measurements

Record every benchmark here as phases land. A number not written down is a number that gets argued about.

| Phase | Command | Budget | Measured |
|---|---|---|---|
| 0 | `nest-doc --version` | 60 ms | 26.9 ms median / 54.1 ms p95 (linked binary, this machine) |
| 4 | `nest-doc interceptors` | 150 ms | 42-51 ms median across runs (linked binary, this machine) |
| 6 | Cold extraction, `@nestjs/common@12.0.1` (in-process, not a CLI spawn) | 207 ms (prior measurement, ADR-0002) | 35-42 ms across 5 runs, this machine |
| 7 | `nest-doc common.Injectable` (cold, empty cache, CLI spawn) | — | 306 ms median across 5 fresh-cache runs (285-352 ms range), this machine |
| 7 | `nest-doc common.Injectable` (warm) | within 5 ms of a guide lookup | 58.9 ms median / 62.0 ms p95, vs. 59.6 ms median for `nest-doc interceptors` — warm symbol lookup is as fast as a guide lookup |
| 8 | `nest-doc --version` | 60 ms | 30.2 ms median / 34.8 ms p95 |
| 8 | `nest-doc interceptors` | 150 ms | 45.3 ms median / 46.9 ms p95 |
| 8 | `nest-doc common.Injectable` (warm) | 150 ms | 49.9 ms median / 53.3 ms p95 |
| 8 | `nest-doc @nestjs/common` (package index, warm) | 150 ms | 55.5 ms median / 57.7 ms p95 |
| 8 | `nest-doc @nestjs/common` (package index, cold) | — | 252-270 ms across 3 fresh-cache runs |
| 8 | `nest-doc Get` (bare symbol, warm) | 150 ms | 51.4 ms median / 59.3 ms p95 |

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
| Named-re-export filter propagation? | Must propagate through nested wildcards unchanged, not reset to "all" — `features/arguments-host.interface.d.ts` declares `ContextType`, `ArgumentsHost`, and `HttpArgumentsHost`, and only the first two are in root `index.d.ts`'s 56-name curated list. Resetting to "all" on each `export *` would wrongly pull `HttpArgumentsHost` in too | ARCHITECTURE §5.1, Phase 6 |
| TypeScript's `@see` bare-URL JSDoc parsing? | `@see https://x` splits into `tag.name="https"` and `tag.comment="://x"` — a real parser quirk, not a bug in this project. 9 of 164 real `@see` tags hit it. Reconstructing `name + comment` recovers the full URL for every tag shape | Phase 6 |
| Extraction result: 206/206 on first full run | Exactly 206 exports, 177 `isPublicApi`, `Injectable` preserves `InjectableOptions` and carries exactly 3 `@see` links — all four PROMPTS.md Phase 6 assertions passed without needing a fix-up pass, once the filter-propagation trap above was handled correctly from the start | Phase 6 |
| Does a static `import "typescript"` inside a module only reached via dynamic `import()` actually defer loading? | No — verified by 3 throwaway esbuild bundle experiments. ESM hoists and eagerly evaluates static imports of external packages at module-load time regardless of how the containing module is reached. Every `core/extract/` function had to be refactored to take `ts: typeof TS` as a parameter instead of statically importing it; only `typescript-loader.ts`'s single `await import("typescript")` actually defers the cost | Phase 7 |
| Cache key collision risk across package versions? | None — `packageVersion` is part of the filename (`<name>@<version>.json`), so a package upgrade lands on a different file with no separate staleness check needed. Only the `CacheFile.version` *format* field needs an explicit mismatch check | Phase 7 |
| Warm symbol lookup vs. guide lookup latency | 58.9 ms vs. 59.6 ms median — indistinguishable within run-to-run noise, confirming the cache read (not `typescript`) is the only cost on the warm path | Phase 7 |
| `SymbolRecord.signature` for classes/interfaces with documented members | Was wrong since Phase 6, only surfaced when Phase 8 actually rendered raw signatures to a terminal: `node.getText()` excludes a node's own *leading* JSDoc but not JSDoc nested inside its own span — a class's members' doc comments came along for free. `BadGatewayException`'s signature was 1301 chars; stripping `/** */` blocks throughout brings it to 139. The render layer also now wraps the signature line — some (enums, larger interfaces) are still legitimately wide even after stripping | `core/extract/signature.ts`, Phase 8 |
| Is a static `import x from "external-pkg"` in a module only reached via dynamic `import()` still hoisted, if that *middle* module has no further nesting? | Yes, confirmed by inspecting actual esbuild output (not just testing behavior): the external package's `import` statement is emitted as a real top-level ESM import in the bundle file itself — Node's loader runs it immediately on file load, regardless of whether the *code that uses it* is wrapped in a lazy `__esm()` init function. Only a literal `import()` **call expression** at the reference site is deferred; a static `import` declaration anywhere in the reachable module graph is not. This forced `nest/update/aliases-transform.ts` (typescript) and `nest/update/guides-transform.ts` (marked) through the same parameter-passing pattern as `core/extract/`, since `nest-doc update`'s logic now ships in the same bundle as everything else | Phase 8 |
| Does `@nestjs/core` have exactly 17 public symbols, per ADR-0007's estimate? | No — 16, measured directly from the real fixture. ADR-0007's number was from an earlier, less precise pass; the measured number is what the tests assert, not the ADR's | Phase 8 |
| Zero name collisions across the shipped name index? | Yes — 606 unique names across all 10 packages (the 9 `nestjs/nest` monorepo packages plus `swagger`), zero collisions, verified directly (not assumed from ADR-0007's narrower common/core/swagger-only check) | Phase 8, `scripts/build-names.ts` |
| DECORATORS bucket in the package index — how to detect a "decorator" when `SymbolKind` has no such kind? | Signature-based heuristic: a `function` or `const` declaration whose signature matches `/Decorator\b/` (`ClassDecorator`, `MethodDecorator`, `PropertyDecorator`, `ParameterDecorator`, `CustomDecorator<...>`). Verified against all 420 real exports across common/core/swagger: 57+0+76 matches, zero false positives (checked every one by hand) | Phase 8, `nest/render-package-index.ts` |
| `nest-doc Module` (no flag) — guide or symbol? | Guide, by design (`--api` forces the symbol) — but this exposed a real gap: no route in the live docs site ever links to `/module` (singular), only `/modules`, so the auto-derived alias table has no entry for it and the query wouldn't resolve at all without help. Fixed with a small, explicitly-curated single-entry supplement (`module` → `modules`) plus a case-insensitive fallback in `findGuide`, not a general singular/plural heuristic | ARCHITECTURE §4.1, Phase 8 |
| What actually triggers SPEC.md's "ambiguous query, exits 1, lists both options"? | Not guide-vs-symbol overlap (that's resolved deterministically — guides win by running first in resolution order). It's specifically a bare name resolving to more than one *installed package* in the name index (SPEC.md §2b) — currently untriggered by the real shipped index (zero collisions), verified instead with a synthetic collision injected into a scratch copy of `data/names.json` | ARCHITECTURE §4.1, Phase 8 |
| `nest-doc update` — only networked path? | Verified directly against the built bundle: exactly 2 `fetch()` call sites total, both inside `nest/update/fetch-docs-repo.ts`, both only reachable from the `update` subcommand's action handler | Phase 8 |
| Packed tarball contents and size | 656.3 kB packed (4.4 MB unpacked), 7 files: `LICENSE`, `README.md`, `data/{aliases,guides,names}.json`, `dist/nest-doc.mjs`, `package.json`. Confirmed absent: `test/`, `scripts/`, fixtures | Phase 9 |
| Real global install from the packed tarball | `npm install -g --prefix <isolated>` then `nest-doc interceptors` from a clean directory with no project-local `node_modules` — resolves on `PATH`, exits 0, correct output | Phase 9 |
| Was the "MIT" license claim actually backed by a `LICENSE` file? | No — `package.json` had no `license` field and no `LICENSE` file existed at all. ADR-0004's requirement to retain the docs.nestjs.com copyright notice "in the package" was also unmet — the README's attribution section states facts about it but never reproduces the actual notice text, and nothing packed carried it. Fixed: added `LICENSE` (MIT, this project) with the verified real docs.nestjs.com notice appended, and `"license": "MIT"` in `package.json` | ADR-0004, Phase 9 |
| Does `nest-doc` actually work on Node 20, as the README claimed? | No — `package.json`'s `engines` field requires `>=22.6.0` and `scripts/bundle.ts` targets `node22` explicitly; the README's "Node 20 or newer" was stale and never matched either. Corrected to Node 22.6+ | Phase 9 |
| Can the offline guarantee be tested with networking actually disabled? | Not fully, in this sandbox: no `sudo`, `/etc/hosts` not writable, no network-namespace tooling, and Node's `fetch` doesn't respect `HTTP_PROXY`/`HTTPS_PROXY` (verified empirically) — there's no available mechanism here to sever network access without elevated privileges. Verified instead: statically (Phase 8's exactly-2-`fetch()`-call-sites test) and dynamically (every non-`update` command completes in 45-94 ms from a clean directory with no project `node_modules`, consistent with no network I/O being attempted). User accepted this as sufficient for now | Phase 9 |
| Asciinema recording for the README | The `asciinema` CLI isn't installed in this environment and a live recording requires an interactive TTY session I can't run non-interactively; uploading to asciinema.org for embedding is also an external, user-owned action. Generated a real, valid asciicast v2 file (`demo.cast`) from genuine captured `nest-doc` output instead (not fabricated) — playable locally via `asciinema play demo.cast`. Uploading it and swapping in the embedded SVG badge is left as a manual step (noted inline in the README) | Phase 9 |

**0.1.0 readiness:** `nest-doc <slug>`, alias resolution, fuzzy "did you mean" suggestions, `--js`, correct exit codes (0/1/2), zero-escape-code piped output, package index, bare symbol/decorator lookup, `nest-doc update` — all verified against the real linked binary and a real packed-tarball install, not just unit tests. Publishing to npm and opening the docs.nestjs.com issue are the only remaining Phase 9 items, both awaiting explicit user go-ahead.

---

## Risks

**Latency headroom is generous, not thin.** ADR-0005 settled on plain `commander` (Option B), so the framework line item is ~46 ms rather than the ~97 ms of `nest-commander`, leaving well over the ~30 ms headroom the ADR costed for Option A. Every dependency added after Phase 0 still needs measuring — the CI benchmark is the guard, and it exists from Phase 0 for this reason.

~~**Named re-exports are the likely silent bug.**~~ Resolved in Phase 6 — extraction correctly propagates the named-export filter through nested wildcards (not just handling `export *` alone) and gets exactly 206/206 against the real package, verified on the first full run.

**Docs repo restructure breaks the corpus build.** Fails at build time, never at runtime. Acceptable, but the build script needs an owner when it breaks.

**`guides.json` is 4.1 MB, over double ARCHITECTURE.md's ~2 MB estimate.** Even after stripping marked's redundant `raw` field (~2 MB of the unstripped 6.5 MB). The real corpus has grown since that number was written — a new `observability/` section and more tables/figures than originally documented. Not a build blocker, but worth watching once Phase 3 measures guide-JSON load time against the latency budget (ARCHITECTURE §9 assumes ~1 ms for this step).

**`typescript@6` is a frozen foundation.** No urgency, but there is an eventual migration or an indefinite freeze. Revisit when the Go port's API story settles.

---

## Explicitly out of scope for 1.0

Full-text search · documenting the user's own app · any TUI or interactive mode · non-Nest packages as a marketed feature · packages that ship no types
