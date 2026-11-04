"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { LoaderCircle, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRule } from "./actions";

export interface PreviewItem {
  category: string;
  sender_name: string | null;
}

const CATEGORIES = [
  "bill", "government", "legal", "financial", "check", "personal", "marketing",
  "package_contents", "unknown",
] as const;

const ACTIONS = [
  { value: "open_scan", label: "Open & Scan" },
  { value: "shred", label: "Shred" },
  { value: "recycle", label: "Recycle" },
] as const;

type RuleAction = (typeof ACTIONS)[number]["value"];

/** Mirrors lib/mail ruleMatches: category equality / case-insensitive sender substring. */
function draftMatches(
  item: PreviewItem,
  matchType: "category" | "sender",
  category: string,
  sender: string
): boolean {
  if (matchType === "category") {
    return Boolean(category) && item.category === category;
  }
  const needle = sender.trim().toLowerCase();
  if (!needle) return false;
  return (item.sender_name ?? "").toLowerCase().includes(needle);
}

export function RuleForm({ recentItems }: { recentItems: PreviewItem[] }) {
  const [matchType, setMatchType] = useState<"category" | "sender">("category");
  const [category, setCategory] = useState<string>("marketing");
  const [sender, setSender] = useState("");
  const [action, setAction] = useState<RuleAction>("shred");
  const [priority, setPriority] = useState("100");
  const [isPending, startTransition] = useTransition();

  const matchCount = useMemo(
    () => recentItems.filter((item) => draftMatches(item, matchType, category, sender)).length,
    [recentItems, matchType, category, sender]
  );
  const draftReady = matchType === "category" ? Boolean(category) : sender.trim().length >= 2;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createRule({
        matchType,
        category: matchType === "category" ? category : undefined,
        sender: matchType === "sender" ? sender.trim() : undefined,
        action,
        priority: Number(priority) || 100,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Rule created");
        setSender("");
        setPriority("100");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>When</Label>
          <Select value={matchType} onValueChange={(v) => setMatchType(v as "category" | "sender")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Category is…</SelectItem>
              <SelectItem value="sender">Sender contains…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          {matchType === "category" ? (
            <>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <>
              <Label htmlFor="rule-sender">Sender contains</Label>
              <Input
                id="rule-sender"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="e.g. PG&E"
              />
            </>
          )}
        </div>
        <div className="space-y-2">
          <Label>Then</Label>
          <Select value={action} onValueChange={(v) => setAction(v as RuleAction)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-priority">Priority (lower runs first)</Label>
          <Input
            id="rule-priority"
            type="number"
            min={1}
            max={9999}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Sparkles className="size-4" />
          {draftReady
            ? `Would have matched ${matchCount} of your last ${recentItems.length} items`
            : "Fill in the match to preview against your recent mail"}
        </span>
        <Button type="submit" size="sm" disabled={isPending || !draftReady}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Create rule
        </Button>
      </div>
    </form>
  );
}
