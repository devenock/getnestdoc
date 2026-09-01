// Collapses whitespace and reduces inline markdown markup to plain text; block structure isn't preserved, unlike full guide rendering.
export function plainText(doc: string): string {
  return doc
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1");
}
