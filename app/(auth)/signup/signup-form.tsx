"use client";

import { useActionState, useState } from "react";
import { CircleAlert, LoaderCircle, MailCheck, Check } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";
import { normalizeUsername, validateUsername, USERNAME_MIN, USERNAME_MAX } from "@/lib/username";
import { signUp, type SignupState } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signUp, {});
  const [username, setUsername] = useState("");

  const normalized = normalizeUsername(username);
  const usernameError = username ? validateUsername(username) : null;
  const usernameValid = username.length > 0 && usernameError === null;

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-6 py-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-brand/15">
          <MailCheck className="size-6 text-brand-emphasis" />
        </span>
        <h2 className="text-lg font-semibold">Check your email to confirm</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to your inbox. Click it to verify your address and finish setting up your
          mailbox.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" autoComplete="name" required placeholder="Marisol Reyes" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={usernameError ? true : undefined}
          placeholder="marisol_r"
        />
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            usernameError ? "text-destructive" : usernameValid ? "text-brand-emphasis" : "text-muted-foreground",
          )}
        >
          {usernameValid ? <Check className="size-3.5" /> : null}
          {usernameError ??
            (usernameValid
              ? `“${normalized}” looks good`
              : `${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, or _`)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground">(optional, for urgent-mail texts)</span>
        </Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+1 555 555 5555" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="At least 10 characters"
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Create account
      </Button>
    </form>
  );
}
