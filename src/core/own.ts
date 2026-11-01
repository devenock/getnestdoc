// Own-property lookup for JSON-loaded dictionaries — a plain `record[key]` also resolves Object.prototype members such as "constructor".
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
