// SymbolRecord.doc is raw markdown prose with embedded newlines from the source .d.ts's own wrapping and inline markup — collapses whitespace and reduces markup to plain text. Block structure isn't preserved; full markdown rendering is core/render/markdown.ts's job for guides, not this much simpler prose.
export function plainText(doc: string): string {
  return doc
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1");
}
