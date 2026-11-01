// Matches every C0 control byte except \t and \n, which stay for the renderer's own line wrapping.
import type { SymbolRecord } from "./types.ts";

// eslint-disable-next-line no-control-regex -- stripping control bytes is the point
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Strips raw control/escape bytes from third-party JSDoc text before it's cached or printed.
export function sanitizeExtractedText(text: string): string {
  return text.replace(CONTROL_CHARS_RE, "");
}

// Sanitizes every string field of a record, shared by extraction and cache reads so a new field is added in one place.
export function sanitizeSymbolRecord(symbol: SymbolRecord): SymbolRecord {
  return {
    ...symbol,
    name: sanitizeExtractedText(symbol.name),
    signature: sanitizeExtractedText(symbol.signature),
    doc: sanitizeExtractedText(symbol.doc),
    tags: symbol.tags.map((tag) => ({ name: sanitizeExtractedText(tag.name), text: sanitizeExtractedText(tag.text) })),
    see: symbol.see.map((link) => ({ text: sanitizeExtractedText(link.text), url: sanitizeExtractedText(link.url) })),
    file: sanitizeExtractedText(symbol.file),
  };
}
