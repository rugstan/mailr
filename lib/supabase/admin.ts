import "server-only";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES RLS — never import from client components
 * (the "server-only" import makes that a build error). Every call site must
 * perform its own authorization check first (see lib/auth.ts).
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
