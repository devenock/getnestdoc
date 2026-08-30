// Shared by render-symbol.ts and render-package-index.ts. SymbolRecord.doc
// is raw markdown prose (core/extract's contract) and real bodies carry both
// embedded newlines from the source .d.ts's own wrapping (verified: Inject,
// Optional, SetMetadata, UseGuards et al. in @nestjs/common@12.0.1) and
// inline markdown — links, emphasis, code spans (Injectable's
// "[provider](...)", HttpException's "*Bad Gateway*", CanActivate's
// "`canActivate()`"). Neither belongs in flowed terminal text: this collapses
// whitespace to single spaces and reduces markup to its plain display text.
// Block structure (paragraphs, lists) is intentionally not preserved — full
// markdown rendering of JSDoc bodies is core/render/markdown.ts's job for
// guides, not a second implementation here for the much simpler prose a
// SymbolRecord carries.
export function plainText(doc: string): string {
  return doc
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1");
}
