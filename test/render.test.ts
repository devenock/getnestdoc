import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderTokens } from "../src/core/render/markdown.ts";
import { renderTable } from "../src/core/render/table.ts";
import type { GuidesFile } from "../scripts/lib/guides-types.ts";
import type { TableToken } from "../src/core/render/types.ts";

const GUIDES_PATH = fileURLToPath(new URL("../data/guides.json", import.meta.url));
const EXPECTED_GUIDE_COUNT = 143;
const WIDTHS = [40, 80, 100];

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- matching the ESC byte is the point
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

let guidesFile: GuidesFile;

before(() => {
  guidesFile = JSON.parse(readFileSync(GUIDES_PATH, "utf8")) as GuidesFile;
});

test("all 143 guides render without throwing", () => {
  const slugs = Object.keys(guidesFile.guides);
  assert.equal(slugs.length, EXPECTED_GUIDE_COUNT);
  for (const slug of slugs) {
    assert.doesNotThrow(() => {
      renderTokens(guidesFile.guides[slug]!.tokens, { width: 100, color: true });
    }, `${slug} threw during render`);
  }
});

test("with colour disabled, no guide's output contains an escape code", () => {
  for (const [slug, guide] of Object.entries(guidesFile.guides)) {
    const out = renderTokens(guide.tokens, { width: 100, color: false });
    assert.ok(!out.includes("\x1b"), `${slug}: escape code present with colour disabled`);
  }
});

test("no rendered line exceeds the configured width, across widths and colour modes", () => {
  let widest = { length: 0, slug: "", width: 0, color: false, line: "" };

  for (const width of WIDTHS) {
    for (const color of [true, false]) {
      for (const [slug, guide] of Object.entries(guidesFile.guides)) {
        const out = renderTokens(guide.tokens, { width, color });
        for (const rawLine of out.split("\n")) {
          const line = stripAnsi(rawLine);
          assert.ok(
            line.length <= width,
            `${slug} @ width=${width} color=${color}: line is ${line.length} chars, over the ${width} cap: ${JSON.stringify(line)}`,
          );
          if (line.length > widest.length) widest = { length: line.length, slug, width, color, line };
        }
      }
    }
  }

  console.log(
    `[render.test] widest line across the corpus: ${widest.length} chars ` +
      `(budget ${widest.width}, color=${widest.color}) in "${widest.slug}": ${JSON.stringify(widest.line)}`,
  );
});

test("a real table with a codespan cell renders with consistent column alignment", () => {
  let found: TableToken | undefined;
  let foundSlug = "";

  for (const [slug, guide] of Object.entries(guidesFile.guides)) {
    for (const token of guide.tokens) {
      if (token.type === "table" && "header" in token) {
        const table = token as TableToken;
        if (table.rows.some((row) => row.some((cell) => cell.includes("`")))) {
          found = table;
          foundSlug = slug;
          break;
        }
      }
    }
    if (found) break;
  }

  assert.ok(found, "expected at least one real table with a codespan (backtick) cell");

  const lines = renderTable(found!, { width: 80, color: true });
  assert.ok(lines.length > 0, `${foundSlug}: table rendered no lines`);

  // Every physical line (header, dash separator, every wrapped row line) pads
  // to the same total column budget — if the codespan row's line came out a
  // different total width than its neighbours, the columns would have drifted.
  const widths = new Set(lines.map((l) => stripAnsi(l).length));
  assert.equal(widths.size, 1, `${foundSlug}: table rows have inconsistent total width: ${[...widths]}`);

  const hasCyan = lines.some((l) => l.includes("\x1b[36m"));
  assert.ok(hasCyan, `${foundSlug}: expected the codespan cell to render in cyan`);
});
