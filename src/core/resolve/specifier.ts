// Splits a module specifier into its package name and optional subpath: "@scope/pkg/a/b" -> "@scope/pkg" + "a/b", "pkg/a" -> "pkg" + "a".
export function splitModuleSpecifier(specifier: string): { packageName: string; subpath?: string } {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  const packageName = parts.slice(0, nameLength).join("/");
  const subpath = parts.slice(nameLength).join("/");
  return subpath.length > 0 ? { packageName, subpath } : { packageName };
}
