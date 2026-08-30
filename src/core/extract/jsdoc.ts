import ts from "typescript";
import type { JsDocTag, SeeLink } from "./types.ts";

function flattenComment(comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string {
  if (comment === undefined) return "";
  if (typeof comment === "string") return comment;
  return comment
    .map((part) => {
      if (part.kind === ts.SyntaxKind.JSDocText) return part.text;
      // JSDocLink / JSDocLinkCode / JSDocLinkPlain: `{@link Name}` and
      // friends — render the linked name as inline code, matching the
      // backtick convention used for codespans elsewhere in this project.
      const raw = part.getText();
      const match = /\{@link(?:code|plain)?\s+([^}]+)\}/.exec(raw);
      return match ? `\`${match[1]!.trim()}\`` : raw;
    })
    .join("");
}

// TypeScript's JSDoc tag parser gives @see (and @param) tags a `.name`
// separate from `.comment` — for @param that's the parameter name,
// intentional. For @see it's a parsing quirk: a bare-URL `@see https://x`
// tokenises as if "https" were a {@link name}-style reference, leaving
// "://x" as the comment. Verified against the real corpus: 9 of 164 @see
// tags in @nestjs/common@12.0.1 hit this. Reconstructing name + comment
// recovers the original text for every tag shape, including this one.
function reconstructTagText(tag: ts.JSDocTag): string {
  const namePart = (tag as { name?: ts.EntityName | ts.JSDocMemberName }).name;
  return (namePart ? namePart.getText() : "") + flattenComment(tag.comment);
}

const SEE_BRACKET_LINK = /^\[([^\]]*)\]\(([^)]*)\)/;

function parseSeeLink(text: string): SeeLink | undefined {
  const bracketMatch = SEE_BRACKET_LINK.exec(text);
  if (bracketMatch) return { text: bracketMatch[1]!, url: bracketMatch[2]! };

  if (/^https?:\/\//.test(text)) {
    const url = text.split(/\s/)[0]!;
    return { text: url, url };
  }

  // e.g. `{ParseFilePipe}` — an internal symbol cross-reference, no URL to
  // extract. Still present in the raw `tags` array; just not in `see`.
  return undefined;
}

export type JsDocResult = {
  doc: string;
  tags: JsDocTag[];
  see: SeeLink[];
  isPublicApi: boolean;
};

const EMPTY_RESULT: JsDocResult = { doc: "", tags: [], see: [], isPublicApi: false };

// ARCHITECTURE.md §5.2: doc from `node.jsDoc.at(-1).comment`, tags from
// `.tags[].tagName.text`, see filtered from tags, isPublic from a `publicApi`
// tag's presence. `.jsDoc` isn't part of the public compiler API surface
// (hence the cast) but is populated at parse time and stable across the
// TypeScript versions this project has used.
export function extractJsDoc(node: ts.Node): JsDocResult {
  const jsDocNodes = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (!jsDocNodes || jsDocNodes.length === 0) return EMPTY_RESULT;

  const block = jsDocNodes[jsDocNodes.length - 1]!;
  const doc = flattenComment(block.comment);

  const tags: JsDocTag[] = [];
  const see: SeeLink[] = [];

  for (const tag of block.tags ?? []) {
    const tagName = tag.tagName.text;
    let text: string;

    if (ts.isJSDocParameterTag(tag) || ts.isJSDocPropertyTag(tag)) {
      const paramName = tag.name.getText();
      const comment = flattenComment(tag.comment);
      text = comment ? `${paramName} ${comment}` : paramName;
    } else {
      text = reconstructTagText(tag);
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
