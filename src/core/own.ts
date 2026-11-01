// Own-property lookup for JSON-loaded dictionaries — a plain `record[key]` resolves inherited keys too, so a query of
// "constructor" or "toString" would otherwise return Object.prototype members instead of a miss.
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
