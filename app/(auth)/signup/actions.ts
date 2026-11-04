"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { provisionCustomer } from "@/lib/customer-provision";

export interface SignupState {
  error?: string;
  success?: boolean;
}

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(120),
  username: z.string().trim().min(1, "Choose a username."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(10, "Password must be at least 10 characters."),
});

export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  // 1. Validate input.
  const parsed = schema.safeParse({
    full_name: String(formData.get("full_name") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { full_name, email, phone, password } = parsed.data;
  const username = normalizeUsername(parsed.data.username);
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  // 2. Rate limit (fail closed — unauthenticated endpoint).
  //    SECURITY: trusts the platform's x-forwarded-for. Vercel overwrites the
  //    client-supplied header with the real IP (not spoofable); pin a real-IP
  //    source if self-hosting behind a different proxy.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`signup:${ip}`, 5, 3600, true))) {
    return { error: "Too many signups from this network. Please try again later." };
  }

  const admin = createAdminClient();

  // 3. Friendly pre-check for an already-taken username (the unique index is the
  //    real guard; provisionCustomer degrades gracefully on a race).
  const { data: taken } = await admin
    .from("customers")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken) return { error: "That username is taken. Try another." };

  // 4. Create the auth user; metadata feeds the /auth/callback provisioning.
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding`,
      data: { full_name, phone: phone ?? null, username },
    },
  });
  if (error) {
    // Don't forward the raw GoTrue error to the client — it's config-fragile
    // (e.g. could leak "User already registered" if confirmations were disabled).
    console.error("signup signUp failed", error);
    return { error: "We couldn't create that account. Check your details and try again." };
  }

  // 5. Provision the customer row + reserve the username now (idempotent; the
  //    callback repeats this for the confirm-email-first flow).
  if (data.user) {
    try {
      await provisionCustomer(admin, data.user, { full_name, email, phone, username });
    } catch (err) {
      // Recoverable: /auth/callback retries. Don't block the signup.
      console.error("customer provisioning at signup failed", err);
    }
  }

  if (data.session) redirect("/onboarding");
  return { success: true };
}
