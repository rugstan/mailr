import { timingSafeEqual } from "crypto";

/**
 * Verifies a Vercel Cron request: `Authorization: Bearer ${CRON_SECRET}`.
 * Timing-safe; returns false when the secret is unset, the header is missing,
 * or the values differ (including length mismatch).
 */
export function verifyCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
