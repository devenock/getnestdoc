// Hand-written Levenshtein distance for "did you mean?" suggestions over any candidate string list.

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let previous = Array.from({ length: n + 1 }, (_, i) => i);
  let current = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    current[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1, // deletion
        current[j - 1]! + 1, // insertion
        previous[j - 1]! + cost, // substitution
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[n]!;
}

// Scales with query length: a short query needs a near-exact match, a long one tolerates a few edits.
function maxDistanceFor(query: string): number {
  return Math.max(2, Math.floor(query.length * 0.34));
}

export function suggest(query: string, candidates: Iterable<string>, limit = 3): string[] {
  const threshold = maxDistanceFor(query);
  const scored: { candidate: string; distance: number }[] = [];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const distance = levenshtein(query, candidate);
    if (distance <= threshold) scored.push({ candidate, distance });
  }

  scored.sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  return scored.slice(0, limit).map((s) => s.candidate);
}
