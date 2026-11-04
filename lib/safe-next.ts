/**
 * Validates a post-auth `next` redirect target. Returns a same-origin path
 * (pathname + search) or the fallback.
 *
 * Must reject more than `//` — browsers and the WHATWG URL parser treat `\`
 * as `/` for http(s), so `/\evil.com` resolves to an external origin. Control
 * chars are stripped by the parse-and-rebuild.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/portal"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  try {
    const u = new URL(next, "http://localhost");
    const path = u.pathname + u.search;
    return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}
