"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomer, getStaff } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { safeNextPath } from "@/lib/safe-next";
import { normalizeUsername, USERNAME_REGEX } from "@/lib/username";

export interface LoginState {
  error?: string;
}

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email.").max(255),
  password: z.string().min(1),
  next: z.string().max(500).optional(),
});

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // 1. Validate input.
  const parsed = schema.safeParse({
    identifier: String(formData.get("identifier") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Enter your username or email and password." };

  // 2. Rate limit (fail closed — this is an unauthenticated endpoint).
  //    SECURITY: relies on the platform setting a trustworthy x-forwarded-for.
  //    On Vercel the client-supplied header is overwritten with the real client
  //    IP, so it can't be spoofed. If self-hosting behind a different proxy, pin
  //    the real-IP source (e.g. x-real-ip) before trusting this for rate limits.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`login:${ip}`, 10, 900, true))) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  // 3. Resolve identifier → email. Email logs in directly; a username is looked
  //    up server-side with the service role (RLS hides other users' rows, so a
  //    username is never resolvable from the browser). All failures return the
  //    same generic message to avoid account enumeration.
  let email = parsed.data.identifier;
  if (!email.includes("@")) {
    const username = normalizeUsername(parsed.data.identifier);
    if (!USERNAME_REGEX.test(username)) {
      return { error: "Invalid username or password." };
    }
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("customers")
      .select("email")
      .eq("username", username)
      .maybeSingle();
    if (!row?.email) return { error: "Invalid username or password." };
    email = (row as { email: string }).email;
  }

  // 4. Authenticate with the user-context client (sets the session cookie).
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) return { error: "Invalid username or password." };

  // 5. Route by role.
  if (await getStaff()) redirect("/staff");
  if (await getCustomer()) {
    redirect(safeNextPath(parsed.data.next, "/portal"));
  }
  redirect("/onboarding");
}
