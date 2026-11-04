import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { GoogleButton } from "../oauth-buttons";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next, "") || undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Get a real address and run your mail from anywhere.</p>

      <div className="mt-6 space-y-4">
        <GoogleButton next={safeNext ?? "/onboarding"} label="Sign up with Google" />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <SignupForm />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}
          className="font-medium text-brand-emphasis underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By continuing you agree to complete USPS Form 1583 verification in store.
      </p>
    </div>
  );
}
