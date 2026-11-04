"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { deleteRule, toggleRule } from "./actions";

export function RuleControls({
  ruleId,
  active,
  summary,
}: {
  ruleId: string;
  active: boolean;
  summary: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    startTransition(async () => {
      const result = await toggleRule(ruleId, next);
      if (result.error) toast.error(result.error);
      else toast.success(next ? "Rule enabled" : "Rule paused");
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteRule(ruleId);
      if (result.error) toast.error(result.error);
      else {
        setConfirmOpen(false);
        toast.success("Rule deleted");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} disabled={isPending} onCheckedChange={onToggle} aria-label="Rule active" />
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Delete rule">
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this rule?</DialogTitle>
            <DialogDescription>
              “{summary}” will stop applying to new mail. Items it already acted on are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep rule</Button>
            </DialogClose>
            <Button variant="destructive" disabled={isPending} onClick={onDelete}>
              {isPending ? <LoaderCircle className="animate-spin" /> : null}
              Delete rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
