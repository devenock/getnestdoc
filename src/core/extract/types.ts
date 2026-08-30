// Mirrors SPEC.md §3's SymbolRecord exactly; the CacheFile wrapper around it lives in core/cache/store.ts.
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
