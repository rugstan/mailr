import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/safe-next";
import { provisionCustomer } from "@/lib/customer-provision";

/**
 * Supabase auth callback. Handles the email-confirmation / magic-link flow AND
 * Google OAuth: exchanges the code for a session, then guarantees a customers
 * row exists (covers confirm-email-first signup and first-time OAuth users).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/onboarding");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      const admin = createAdminClient();
      const meta = (user.user_metadata ?? {}) as {
        full_name?: string | null;
        name?: string | null;
        phone?: string | null;
        username?: string | null;
      };
      // Google sets `name`; our own signup sets `full_name`.
      const fullName =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        user.email?.split("@")[0] ||
        "New customer";
      await provisionCustomer(admin, user, {
        full_name: fullName,
        email: user.email ?? "",
        phone: typeof meta.phone === "string" && meta.phone.trim() ? meta.phone.trim() : null,
        username: typeof meta.username === "string" ? meta.username : null,
      });
    } catch (err) {
      console.error("customer provisioning at callback failed", err);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
