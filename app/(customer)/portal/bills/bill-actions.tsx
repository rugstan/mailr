"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBillStatus } from "./actions";

export function BillActions({ billId, status }: { billId: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  function update(next: "paid" | "dismissed") {
    startTransition(async () => {
      const result = await setBillStatus(billId, next);
      if (result.error) toast.error(result.error);
      else toast.success(next === "paid" ? "Marked as paid" : "Bill dismissed");
    });
  }

  return (
    <div className="flex gap-2">
      {status !== "paid" ? (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => update("paid")}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
          Mark paid
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => update("dismissed")}>
        <X />
        Dismiss
      </Button>
    </div>
  );
}
