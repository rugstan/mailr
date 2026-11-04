"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setNotificationPref } from "./actions";

type PrefKey = "urgent_sms" | "scan_ready_email" | "bill_reminders";

const PREFS: { key: PrefKey; label: string; description: string }[] = [
  {
    key: "urgent_sms",
    label: "Urgent mail texts",
    description: "SMS when government or urgency-3 mail arrives.",
  },
  {
    key: "scan_ready_email",
    label: "Scan-ready emails",
    description: "Email the moment a requested scan is available.",
  },
  {
    key: "bill_reminders",
    label: "Bill reminders",
    description: "Reminders before due dates found in your scanned bills.",
  },
];

export function NotificationPrefs({ prefs }: { prefs: Record<string, unknown> }) {
  const [values, setValues] = useState<Record<PrefKey, boolean>>({
    urgent_sms: prefs.urgent_sms !== false,
    scan_ready_email: prefs.scan_ready_email !== false,
    bill_reminders: prefs.bill_reminders !== false,
  });
  const [isPending, startTransition] = useTransition();

  function toggle(key: PrefKey, next: boolean) {
    const previous = values[key];
    setValues((v) => ({ ...v, [key]: next }));
    startTransition(async () => {
      const result = await setNotificationPref(key, next);
      if (result.error) {
        setValues((v) => ({ ...v, [key]: previous }));
        toast.error(result.error);
      } else {
        toast.success("Preference saved");
      }
    });
  }

  return (
    <div className="space-y-4">
      {PREFS.map((pref) => (
        <div key={pref.key} className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor={`pref-${pref.key}`}>{pref.label}</Label>
            <p className="text-sm text-muted-foreground">{pref.description}</p>
          </div>
          <Switch
            id={`pref-${pref.key}`}
            checked={values[pref.key]}
            disabled={isPending}
            onCheckedChange={(next) => toggle(pref.key, next)}
          />
        </div>
      ))}
    </div>
  );
}
