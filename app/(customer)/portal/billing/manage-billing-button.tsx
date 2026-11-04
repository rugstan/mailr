"use client";

import { useActionState } from "react";
import { CircleAlert, CreditCard, LoaderCircle } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { openBillingPortal, type PortalState } from "./actions";

export function ManageBillingButton() {
  const [state, formAction, pending] = useActionState<PortalState, FormData>(openBillingPortal, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <CreditCard />}
        Manage payment method &amp; invoices
      </Button>
    </form>
  );
}
