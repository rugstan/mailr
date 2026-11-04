"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type SettingsResult } from "./actions";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(updateProfile, {});

  useEffect(() => {
    if (state.success) toast.success("Profile saved");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full name</Label>
        <Input id="profile-name" name="full_name" defaultValue={fullName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-phone">Phone</Label>
        <Input id="profile-phone" name="phone" type="tel" defaultValue={phone ?? ""} placeholder="+1 555 555 5555" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Save profile
      </Button>
    </form>
  );
}
