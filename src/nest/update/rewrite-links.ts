import type { InternalLinkToken } from "../../core/render/types.ts";

// Internal links appear as both relative and absolute (docs.nestjs.com) URLs in the real corpus — both resolve through the same alias table plus a direct-slug fallback, 100% (188/188 real internal-looking hrefs).
function resolveInternalHref(
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

// Recursively walks a guide's token tree, replacing any link token whose href resolves internally with an InternalLinkToken.
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
