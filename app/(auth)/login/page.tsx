import Link from "next/link";
import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { LoginForm } from "./login-form";
import { GoogleButton } from "../oauth-buttons";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = safeNextPath(next, "") || undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to manage your mailbox.</p>

      {error ? (
        <Alert variant="destructive" className="mt-5">
          <CircleAlert />
          <AlertTitle>That sign-in link was invalid or expired. Sign in below.</AlertTitle>
        </Alert>
      ) : null}

      <div className="mt-6 space-y-4">
        <GoogleButton next={safeNext ?? "/portal"} label="Sign in with Google" />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <LoginForm next={safeNext} />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href={safeNext ? `/signup?next=${encodeURIComponent(safeNext)}` : "/signup"}
          className="font-medium text-brand-emphasis underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
