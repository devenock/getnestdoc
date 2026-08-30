// Minimal TS/JS syntax highlighting via regex, not a parser (ADR-0003) — applied to every fence regardless of declared language; approximate for non-JS fences but harmless.
import { cyan, dim, green, magenta, hardWrapVisible, type RenderOptions } from "./ansi.ts";

const KEYWORDS = [
  "const", "let", "var", "function", "class", "interface", "type", "enum", "namespace",
  "export", "import", "from", "extends", "implements", "return", "if", "else", "for",
  "while", "do", "switch", "case", "break", "continue", "new", "this", "super", "async",
  "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of",
  "public", "private", "protected", "readonly", "static", "abstract", "as", "void",
  "null", "undefined", "true", "false", "get", "set", "yield", "delete", "default",
  "string", "number", "boolean", "any", "unknown", "never", "object", "symbol", "bigint",
];

const TOKEN_RE = new RegExp(
  [
    "(//[^\\n]*)", // 1: line comment
    "(/\\*[\\s\\S]*?\\*/)", // 2: block comment
    "('(?:\\\\.|[^'\\\\])*'|\"(?:\\\\.|[^\"\\\\])*\"|`(?:\\\\.|[^`\\\\])*`)", // 3: string
    "(@[A-Za-z_$][\\w$]*)", // 4: decorator
    `\\b(${KEYWORDS.join("|")})\\b`, // 5: keyword
  ].join("|"),
  "g",
);

function highlightCode(code: string, options: RenderOptions): string {
  if (!options.color) return code;

  return code.replace(TOKEN_RE, (match, lineComment, blockComment, string, decorator, keyword: string | undefined) => {
    if (lineComment !== undefined || blockComment !== undefined) return dim(match, options);
    if (string !== undefined) return green(match, options);
    if (decorator !== undefined) return magenta(match, options);
    if (keyword !== undefined) return cyan(match, options);
    return match;
  });
}

// Hard-wrapped, not word-wrapped — code indentation and alignment whitespace is meaningful.
export function renderCodeLines(code: string, options: RenderOptions): string[] {
  const highlighted = highlightCode(code, options);
  return highlighted.split("\n").flatMap((line) => hardWrapVisible(line, options.width));
}
