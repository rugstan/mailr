import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  secret: z.string().min(1),
  email: z.email(),
  password: z.string().min(12).max(200),
  full_name: z.string().trim().min(1).max(120),
});

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * One-time first-owner creation for the default location. Disabled unless
 * BOOTSTRAP_SECRET is set; refuses once an active owner exists (409).
 */
export async function POST(request: Request) {
  try {
    const bootstrapSecret = process.env.BOOTSTRAP_SECRET;
    if (!bootstrapSecret) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }

    // Fail-closed rate limit: this endpoint guards privileged account creation.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(`bootstrap:${ip}`, 5, 3600, true);
    if (!allowed) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    const { secret, email, password, full_name } = parsed.data;

    if (!secretsMatch(secret, bootstrapSecret)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Service role: bootstrap runs pre-auth and must create an auth user + staff row.
    const admin = createAdminClient();

    const slug = process.env.DEFAULT_LOCATION_SLUG ?? "";
    const { data: location, error: locErr } = await admin
      .from("locations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (locErr) {
      console.error("bootstrap location lookup failed", locErr);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
    if (!location) {
      console.error(`bootstrap: default location "${slug}" not found — run the seed migration`);
      return NextResponse.json({ error: "default location missing" }, { status: 500 });
    }

    const { data: owners, error: ownerErr } = await admin
      .from("staff_users")
      .select("id")
      .eq("location_id", location.id)
      .eq("role", "owner")
      .eq("active", true)
      .limit(1);
    if (ownerErr) {
      console.error("bootstrap owner check failed", ownerErr);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
    if (owners && owners.length > 0) {
      return NextResponse.json({ error: "already bootstrapped" }, { status: 409 });
    }

    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr || !created?.user) {
      console.error("bootstrap auth user creation failed", userErr);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }

    const { data: staff, error: staffErr } = await admin
      .from("staff_users")
      .insert({
        location_id: location.id,
        auth_user_id: created.user.id,
        full_name,
        role: "owner",
      })
      .select("id")
      .single();
    if (staffErr || !staff) {
      console.error("bootstrap staff insert failed", staffErr);
      // Best-effort rollback so bootstrap can be retried cleanly.
      await admin.auth.admin.deleteUser(created.user.id).catch((e) => {
        console.error("bootstrap rollback (deleteUser) failed", e);
      });
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }

    return NextResponse.json({ staff_id: staff.id }, { status: 201 });
  } catch (err) {
    console.error("bootstrap failed", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
