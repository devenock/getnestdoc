// Mirrors SPEC.md §3's SymbolRecord exactly. The CacheFile wrapper (version,
// package, packageVersion, entryFile, extractedAt, symbols) is Phase 7's
// concern — this phase only produces the records themselves.
export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "const" | "variable";

export type JsDocTag = {
  name: string;
  text: string;
};

export type SeeLink = {
  text: string;
  url: string;
};

export type SymbolRecord = {
  name: string;
  kind: SymbolKind;
  signature: string;
  doc: string;
  tags: JsDocTag[];
  see: SeeLink[];
  isPublicApi: boolean;
  file: string;
  line: number;
};
