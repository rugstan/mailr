import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side fixed-window rate limiter backed by Postgres
 * (works across serverless instances, unlike in-memory counters).
 *
 * @param failClosed when true, a database error counts as "limited"
 *                   (use for unauthenticated/sensitive endpoints).
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  failClosed = false
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("take_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    console.error("rate limit check failed", err);
    return !failClosed;
  }
}
