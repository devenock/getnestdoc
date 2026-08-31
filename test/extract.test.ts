import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPackage } from "../src/core/extract/barrels.ts";
import type { SymbolRecord } from "../src/core/extract/types.ts";

const ENTRY_FILE = fileURLToPath(new URL("./fixtures/node_modules/@nestjs/common/index.d.ts", import.meta.url));
const EXPECTED_EXPORT_COUNT = 206;
const EXPECTED_PUBLIC_API_COUNT = 177;

let symbols: SymbolRecord[];
let extractionMs: number;

before(async () => {
  const start = process.hrtime.bigint();
  symbols = await extractPackage(ENTRY_FILE);
  extractionMs = Number(process.hrtime.bigint() - start) / 1e6;
});

// The critical assertion (PROMPTS.md Phase 6): handling only `export *` and
// skipping named re-exports (`export { A, B } from`) yields 155, not 206,
// and looks correct — the 51-symbol gap is silent. An exact count is the
// only assertion that catches it; "some symbols" would have passed either way.
test("extracts exactly 206 exports from @nestjs/common@12.0.1", () => {
  assert.equal(symbols.length, EXPECTED_EXPORT_COUNT);
});

test("every extracted name is unique — no symbol counted twice via multiple barrel paths", () => {
  const names = symbols.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
});

test("exactly 177 records have isPublicApi: true", () => {
  const publicCount = symbols.filter((s) => s.isPublicApi).length;
  assert.equal(publicCount, EXPECTED_PUBLIC_API_COUNT);
});

test("Injectable's signature preserves InjectableOptions, not expanded to ScopeOptions | undefined", () => {
  const injectable = symbols.find((s) => s.name === "Injectable");
  assert.ok(injectable, "Injectable not found");
  assert.equal(injectable!.signature, "export declare function Injectable(options?: InjectableOptions): ClassDecorator;");
  assert.ok(!injectable!.signature.includes("ScopeOptions"), "signature was expanded by a type checker — parse-only should preserve the author's alias (ADR-0002)");
});

test("Injectable carries exactly three @see links", () => {
  const injectable = symbols.find((s) => s.name === "Injectable");
  assert.ok(injectable);
  assert.equal(injectable!.see.length, 3);
  assert.deepEqual(
    injectable!.see.map((s) => s.url),
    [
      "https://docs.nestjs.com/providers",
      "https://docs.nestjs.com/fundamentals/custom-providers",
      "https://docs.nestjs.com/fundamentals/injection-scopes",
    ],
  );
});

// The specific trap this phase is named for: features/arguments-host.interface.d.ts
// declares ContextType, ArgumentsHost, AND HttpArgumentsHost — only the first
// two are in root index.d.ts's 56-name curated re-export list. A resolver
// that propagates "all" through every wildcard instead of the inherited
// named-export filter would wrongly pull HttpArgumentsHost in too.
test("HttpArgumentsHost is correctly excluded — not part of the curated public re-export list", () => {
  assert.ok(symbols.some((s) => s.name === "ArgumentsHost"), "ArgumentsHost should be included");
  assert.ok(symbols.some((s) => s.name === "ContextType"), "ContextType should be included");
  assert.ok(!symbols.some((s) => s.name === "HttpArgumentsHost"), "HttpArgumentsHost should NOT be included");
});

test("bare-URL @see tags reconstruct the full URL, not just the parser's residual comment", () => {
  // TypeScript's JSDoc parser splits `@see https://x` into tag.name="https"
  // and tag.comment="://x" — a naive implementation that reads only
  // tag.comment would silently produce a broken "://x" URL. ValidationError's
  // own @see (interfaces/external/validation-error.interface.d.ts) hits this.
  const validationError = symbols.find((s) => s.name === "ValidationError");
  assert.ok(validationError, "ValidationError not found");
  assert.ok(
    validationError!.see.some((link) => link.url === "https://github.com/typestack/class-validator"),
    "bare-URL @see tag was not correctly reconstructed",
  );
});

test("reports the extraction count and cold extraction time", () => {
  console.log(`[extract.test] ${symbols.length} symbols extracted from @nestjs/common@12.0.1 in ${extractionMs.toFixed(1)} ms`);
  // Loading typescript itself (~160-200 ms in a fresh process — verified in
  // isolation) dominates this number, not the extraction algorithm (~35-40 ms
  // once typescript is already loaded). That load is unavoidable on a cold
  // path and is exactly why Phase 7's cache matters: a warm lookup skips
  // extractPackage — and therefore this cost — entirely. In isolation this
  // measures 236-255 ms; observed as high as 401 ms when `npm test` runs
  // every other file's CPU-bound work (other typescript loads, spawned CLI
  // processes) concurrently on this machine. 800 ms clears that contention
  // noise with room to spare; the number itself, not this bound, is what
  // gets reported and compared against the 207 ms baseline.
  assert.ok(extractionMs < 800, `extraction took ${extractionMs.toFixed(1)} ms — profile before continuing`);
});

// SECURITY REGRESSION — a barrel's `export * from "<specifier>"` is text
// inside a *third-party* .d.ts file, not something the CLI's own caller
// controls. Verified end-to-end against the real built binary: a specifier
// like "../../secret-location/leaked.js" made extractPackage() read and
// display a symbol from a .d.ts file completely outside the package's own
// directory — a real barrel never legitimately needs to leave its own
// package root. CWE-22, lower severity than the cache path traversal (no
// write capability, same user/machine, requires knowing a real path to
// another .d.ts file) but a real boundary violation regardless.
test("a barrel's export specifier cannot traverse outside the package's own directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "getnestdoc-barrel-security-test-"));
  try {
    const secretDir = join(root, "secret-location");
    mkdirSync(secretDir, { recursive: true });
    writeFileSync(join(secretDir, "leaked.d.ts"), `export declare const secretApiKey: string;\n`);

    const packageDir = join(root, "evil-package");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "index.d.ts"), `export * from "../secret-location/leaked.js";\n`);

    const symbolsFromMaliciousBarrel = await extractPackage(join(packageDir, "index.d.ts"));
    assert.equal(symbolsFromMaliciousBarrel.length, 0, "a specifier resolving outside the package root must not be followed at all");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// SECURITY REGRESSION — JSDoc comment text is written by a *third-party*
// package author, not the CLI's own caller. Verified end-to-end against the
// real built binary: a raw ESC byte followed by an OSC sequence embedded in
// a doc comment reached the final terminal output completely unfiltered,
// byte for byte. Not just cosmetic — some terminals treat OSC 52 as
// "write to the clipboard", no confirmation prompt, so this is a real
// clipboard-hijack vector from running `nest-doc <malicious-package>`, not a
// theoretical one.
test("a raw escape sequence embedded in a JSDoc comment never reaches the extracted SymbolRecord", async () => {
  const root = mkdtempSync(join(tmpdir(), "getnestdoc-ansi-security-test-"));
  try {
    const packageDir = join(root, "evil-ansi");
    mkdirSync(packageDir, { recursive: true });
    const esc = "\x1b";
    const bel = "\x07";
    writeFileSync(
      join(packageDir, "index.d.ts"),
      `/**\n * innocuous docs ${esc}]0;PWNED-TITLE${bel} more text\n */\nexport declare function totallyNormal(): void;\n`,
    );

    const [symbol] = await extractPackage(join(packageDir, "index.d.ts"));
    assert.ok(symbol, "totallyNormal not found");
    assert.ok(!symbol!.doc.includes(esc), `doc still contains a raw ESC byte: ${JSON.stringify(symbol!.doc)}`);
    assert.ok(!symbol!.doc.includes(bel), `doc still contains a raw BEL byte: ${JSON.stringify(symbol!.doc)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
