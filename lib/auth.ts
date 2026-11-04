import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type Customer, type StaffRole, type StaffUser } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

/** Authenticated Supabase user or null. Always validated against the auth server. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Customer row for the signed-in user, or null (e.g. staff accounts). */
export async function getCustomer(): Promise<Customer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return (data as Customer) ?? null;
}

/** Staff row for the signed-in user, or null. */
export async function getStaff(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("staff_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  return (data as StaffUser) ?? null;
}

/** Redirects to /login unless a customer is signed in. */
export async function requireCustomer(): Promise<Customer> {
  const customer = await getCustomer();
  if (!customer) redirect("/login");
  return customer;
}

/**
 * Redirects unless the signed-in user is active staff with at least `minRole`.
 * Use at the top of every staff/admin server component and server action.
 */
export async function requireStaff(minRole: StaffRole = "counter"): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (ROLE_RANK[staff.role] < ROLE_RANK[minRole]) redirect("/staff");
  return staff;
}

export function hasRole(staff: StaffUser, minRole: StaffRole): boolean {
  return ROLE_RANK[staff.role] >= ROLE_RANK[minRole];
}
