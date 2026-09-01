// Matches every C0 control byte except \t and \n, which stay for the renderer's own line wrapping.
// eslint-disable-next-line no-control-regex -- stripping control bytes is the point
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Strips raw control/escape bytes from third-party JSDoc text before it's cached or printed.
export function sanitizeExtractedText(text: string): string {
  return text.replace(CONTROL_CHARS_RE, "");
}
