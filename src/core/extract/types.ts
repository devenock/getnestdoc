// The shape of one extracted symbol's kind — a function, class, interface, and so on.
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
