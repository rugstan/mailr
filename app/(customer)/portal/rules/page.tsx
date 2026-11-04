import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTION_LABELS } from "@/lib/mail";
import { cn } from "@/lib/utils";
import type { StandingRule } from "@/lib/types";
import { RuleForm, type PreviewItem } from "./rule-form";
import { RuleControls } from "./rule-controls";

export const metadata: Metadata = { title: "Rules" };

function summarize(rule: StandingRule): string {
  const condition = rule.match.category
    ? `category is ${rule.match.category.replaceAll("_", " ")}`
    : rule.match.sender_contains
      ? `sender contains “${rule.match.sender_contains}”`
      : "anything arrives";
  return `When ${condition} → ${ACTION_LABELS[rule.action]}`;
}

export default async function RulesPage() {
  const customer = await requireCustomer();
  const supabase = await createClient();

  const [{ data: ruleRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("standing_rules")
      .select("*")
      .eq("customer_id", customer.id)
      .order("priority", { ascending: true }),
    // Latest 50 items, used client-side to preview what a draft rule would match.
    supabase
      .from("mail_items")
      .select("category, sender_name")
      .order("received_at", { ascending: false })
      .limit(50),
  ]);

  const rules = (ruleRows ?? []) as StandingRule[];
  const recentItems = (itemRows ?? []) as PreviewItem[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Standing rules</h1>
        <p className="text-muted-foreground">
          Automate your mail: rules run at check-in, in priority order, and the first match wins. An
          open-and-scan rule counts as your recorded consent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a rule</CardTitle>
          <CardDescription>“When category is marketing → Shred” is the classic.</CardDescription>
        </CardHeader>
        <CardContent>
          <RuleForm recentItems={recentItems} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your rules</CardTitle>
          <CardDescription>
            {rules.length === 0
              ? "No rules yet."
              : `${rules.length} rule${rules.length === 1 ? "" : "s"}, applied top to bottom.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <SlidersHorizontal className="size-8" />
              <p className="text-sm">Create your first rule above — your future self will thank you.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant="outline" className="shrink-0 font-mono">
                      {rule.priority}
                    </Badge>
                    <p className={cn("truncate text-sm", !rule.active && "text-muted-foreground line-through")}>
                      {summarize(rule)}
                    </p>
                  </div>
                  <RuleControls ruleId={rule.id} active={rule.active} summary={summarize(rule)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
