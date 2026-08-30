import type TS from "typescript";
import type { JsDocTag, SeeLink } from "./types.ts";

function flattenComment(ts: typeof TS, comment: string | TS.NodeArray<TS.JSDocComment> | undefined): string {
  if (comment === undefined) return "";
  if (typeof comment === "string") return comment;
  return comment
    .map((part) => {
      if (part.kind === ts.SyntaxKind.JSDocText) return part.text;
      // `{@link Name}` and friends render as inline code, matching the codespan convention used elsewhere.
      const raw = part.getText();
      const match = /\{@link(?:code|plain)?\s+([^}]+)\}/.exec(raw);
      return match ? `\`${match[1]!.trim()}\`` : raw;
    })
    .join("");
}

// A bare-URL `@see https://x` tokenises "https" into `.name` and "://x" into `.comment` (a TS parser quirk, verified on 9/164 real @see tags) — reconstructing name + comment recovers the full text for every tag shape.
function reconstructTagText(ts: typeof TS, tag: TS.JSDocTag): string {
  const namePart = (tag as { name?: TS.EntityName | TS.JSDocMemberName }).name;
  return (namePart ? namePart.getText() : "") + flattenComment(ts, tag.comment);
}

const SEE_BRACKET_LINK = /^\[([^\]]*)\]\(([^)]*)\)/;

function parseSeeLink(text: string): SeeLink | undefined {
  const bracketMatch = SEE_BRACKET_LINK.exec(text);
  if (bracketMatch) return { text: bracketMatch[1]!, url: bracketMatch[2]! };

  if (/^https?:\/\//.test(text)) {
    const url = text.split(/\s/)[0]!;
    return { text: url, url };
  }

  // e.g. `{ParseFilePipe}` — a symbol cross-reference, no URL; stays in `tags`, just not `see`.
  return undefined;
}

export type JsDocResult = {
  doc: string;
  tags: JsDocTag[];
  see: SeeLink[];
  isPublicApi: boolean;
};

const EMPTY_RESULT: JsDocResult = { doc: "", tags: [], see: [], isPublicApi: false };

// ARCHITECTURE.md §5.2. `.jsDoc` isn't part of the public compiler API (hence the cast) but is populated at parse time and stable across the TS versions this project has used.
export function extractJsDoc(ts: typeof TS, node: TS.Node): JsDocResult {
  const jsDocNodes = (node as { jsDoc?: TS.JSDoc[] }).jsDoc;
  if (!jsDocNodes || jsDocNodes.length === 0) return EMPTY_RESULT;

  const block = jsDocNodes[jsDocNodes.length - 1]!;
  const doc = flattenComment(ts, block.comment);

  const tags: JsDocTag[] = [];
  const see: SeeLink[] = [];

  for (const tag of block.tags ?? []) {
    const tagName = tag.tagName.text;
    let text: string;

    if (ts.isJSDocParameterTag(tag) || ts.isJSDocPropertyTag(tag)) {
      const paramName = tag.name.getText();
      const comment = flattenComment(ts, tag.comment);
      text = comment ? `${paramName} ${comment}` : paramName;
    } else {
      text = reconstructTagText(ts, tag);
    }

    tags.push({ name: tagName, text });

    if (tagName === "see") {
      const link = parseSeeLink(text);
      if (link) see.push(link);
    }
  }

  const isPublicApi = tags.some((t) => t.name === "publicApi");

  return { doc, tags, see, isPublicApi };
}
