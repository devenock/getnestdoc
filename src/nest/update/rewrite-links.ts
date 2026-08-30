import type { InternalLinkToken } from "./guides-types.ts";

// A guide's internal links appear in two forms in the real corpus: relative
// (`/fundamentals/injection-scopes`, the SPEC.md-documented form) and absolute
// (`https://docs.nestjs.com/providers#dependency-injection`) — both resolve
// through the same alias table plus a direct-slug fallback (a URL segment can
// already be a real slug with no distinct route path, e.g. `/guards`). Both
// forms resolve 100% against the real corpus (188/188 internal-looking hrefs),
// so both are worth turning into runnable `nest-doc <slug>` references rather
// than leaving the absolute form as a inert external-looking URL.
export function resolveInternalHref(
  href: string,
  urlToSlug: Record<string, string>,
  guideSlugs: Set<string>,
): { slug: string; anchor?: string } | undefined {
  let path: string;
  if (href.startsWith("https://docs.nestjs.com")) {
    path = href.slice("https://docs.nestjs.com".length);
  } else if (href.startsWith("/")) {
    path = href;
  } else {
    return undefined;
  }

  path = path.replace(/^\//, "");
  const hashIndex = path.indexOf("#");
  const anchor = hashIndex === -1 ? undefined : path.slice(hashIndex + 1);
  const urlPath = hashIndex === -1 ? path : path.slice(0, hashIndex);

  const slug = urlToSlug[urlPath] ?? (guideSlugs.has(urlPath) ? urlPath : undefined);
  if (!slug) return undefined;

  return anchor ? { slug, anchor } : { slug };
}

// Recursively walks a guide's token tree (or any value within it — marked
// nests inline tokens under `tokens`, list items under `items`, etc.) and
// replaces any `{ type: "link", href, text }` whose href resolves internally
// with an InternalLinkToken. Everything else passes through unchanged,
// mirroring guides-transform.ts's stripRaw.
export function rewriteInternalLinks(value: unknown, urlToSlug: Record<string, string>, guideSlugs: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteInternalLinks(item, urlToSlug, guideSlugs));
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (obj.type === "link" && typeof obj.href === "string") {
      const resolved = resolveInternalHref(obj.href, urlToSlug, guideSlugs);
      if (resolved) {
        const internalLink: InternalLinkToken = {
          type: "internalLink",
          text: typeof obj.text === "string" ? obj.text : "",
          slug: resolved.slug,
        };
        if (resolved.anchor) internalLink.anchor = resolved.anchor;
        return internalLink;
      }
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      out[key] = rewriteInternalLinks(val, urlToSlug, guideSlugs);
    }
    return out;
  }

  return value;
}
