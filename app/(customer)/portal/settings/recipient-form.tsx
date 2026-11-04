"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { CircleAlert, LoaderCircle, UserPlus } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addRecipient, type SettingsResult } from "./actions";

export function RecipientForm() {
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(addRecipient, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Recipient added — visit the store to verify their ID");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rcpt-name">Full name</Label>
          <Input id="rcpt-name" name="full_name" required placeholder="Alex Doe" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rcpt-business">
            Business name <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="rcpt-business" name="business_name" placeholder="Acme LLC" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="rcpt-minor" name="is_minor" />
        <Label htmlFor="rcpt-minor" className="font-normal">
          This recipient is a minor (covered by my Form 1583)
        </Label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
        Add recipient
      </Button>
    </form>
  );
}
