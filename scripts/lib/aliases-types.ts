// Mirrors SPEC.md §2 exactly. Build-time only, see ARCHITECTURE.md §3.
export type AliasFile = {
  version: 1;
  generatedAt: string;
  sourceCommit: string;
  urlToSlug: Record<string, string>;
};
