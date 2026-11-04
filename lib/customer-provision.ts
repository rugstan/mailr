import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

interface ProvisionMeta {
  full_name: string;
  email: string;
  phone?: string | null;
  username?: string | null;
}

/**
 * Ensure a `customers` row exists for an auth user. Called from signup AND the
 * /auth/callback route (email-confirm + Google OAuth), so it must be idempotent.
 *
 * Uses the service-role admin client (customers has no end-user INSERT grant).
 * Safety guarantees:
 *  - never creates duplicates (checks auth_user_id first);
 *  - never loses the account to a username collision: on a unique-violation it
 *    retries WITHOUT the username, so the user is provisioned and can pick a
 *    handle later;
 *  - backfills a username onto an existing row only when that row has none and
 *    the requested handle is free (covers OAuth users who set one post-signup).
 */
export async function provisionCustomer(
  admin: SupabaseClient,
  user: User,
  meta: ProvisionMeta,
): Promise<void> {
  const username = meta.username?.trim().toLowerCase() || null;

  const { data: existing } = await admin
    .from("customers")
    .select("id, username")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; username: string | null };
    if (!row.username && username) {
      const { data: taken } = await admin
        .from("customers")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (!taken) {
        await admin.from("customers").update({ username }).eq("id", row.id);
      }
    }
    return;
  }

  const slug = process.env.DEFAULT_LOCATION_SLUG ?? "postalannex-main";
  const { data: location } = await admin
    .from("locations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!location) return;

  const base = {
    location_id: (location as { id: string }).id,
    auth_user_id: user.id,
    full_name: meta.full_name,
    email: meta.email,
    phone: meta.phone ?? null,
  };

  const { error } = await admin.from("customers").insert({ ...base, username });
  if (error) {
    // 23505 = unique violation → almost certainly a username race. Create the
    // account anyway, without a handle, rather than failing the signup.
    if (error.code === "23505" && username) {
      const { error: retryError } = await admin.from("customers").insert(base);
      if (retryError) throw retryError;
      return;
    }
    throw error;
  }
}
