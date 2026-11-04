"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

/**
 * Continue-with-Google. Uses the browser client; on success Supabase redirects
 * to Google and back to /auth/callback. If the Google provider isn't enabled in
 * Supabase yet, we surface a calm fallback instead of a raw error.
 */
export function GoogleButton({ next = "/portal", label = "Continue with Google" }: { next?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
      if (error) {
        setError("Google sign-in isn't available yet — use your username or email below.");
        setLoading(false);
      }
      // On success the browser navigates away to Google; nothing more to do.
    } catch {
      setError("Couldn't start Google sign-in. Try again, or use your username or email.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2.5 font-medium"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleGlyph />}
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-center text-xs text-muted-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
