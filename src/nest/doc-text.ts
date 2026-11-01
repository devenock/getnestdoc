// Collapses whitespace and reduces inline markdown markup to plain text; block structure isn't preserved — see docBlocks for that.
export function plainText(doc: string): string {
  return doc
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1");
}

export type DocBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] } | { kind: "code"; code: string };

const FENCE_RE = /^\s*```/;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

// Strips the indentation every non-blank line shares, so a code example indented inside a JSDoc block renders flush.
function dedent(lines: string[]): string {
  const indents = lines.filter((l) => l.trim().length > 0).map((l) => /^\s*/.exec(l)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(common)).join("\n");
}

// Splits a JSDoc body (markdown, as Nest writes it) into paragraphs, bullet lists, and fenced code examples.
export function docBlocks(doc: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const lines = doc.split("\n");
  let paragraph: string[] = [];
  let list: string[] | undefined;

  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (list) blocks.push({ kind: "list", items: list });
    paragraph = [];
    list = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (FENCE_RE.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE_RE.test(lines[i]!); i++) code.push(lines[i]!);
      const text = dedent(code).trim();
      if (text.length > 0) blocks.push({ kind: "code", code: text });
      continue;
    }

    if (line.trim().length === 0) {
      flush();
      continue;
    }

    const item = LIST_ITEM_RE.exec(line);
    if (item) {
      if (paragraph.length > 0) {
        blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
      }
      (list ??= []).push(item[1]!);
      continue;
    }

    // An indented line directly under a list item continues that item.
    if (list && /^\s+\S/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }

    if (list) flush();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

// The package index's one-line summary: the first sentence of the first prose paragraph, never a code example.
export function firstSentence(doc: string): string {
  const first = docBlocks(doc).find((b) => b.kind === "paragraph");
  const plain = first ? plainText(first.text) : "";
  const match = /^(.*?[.!?])(\s|$)/.exec(plain);
  return match ? match[1]! : plain;
}
