import { requireStaff } from "@/lib/auth";
import { IntakeWorkstation } from "./intake-workstation";

export default async function IntakePage() {
  await requireStaff("counter");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Intake</h1>
        <p className="text-muted-foreground">
          Scan or type the PMB, pick the recipient, print the label. Target: ≤35 seconds per
          item.
        </p>
      </div>
      <IntakeWorkstation />
    </div>
  );
}
