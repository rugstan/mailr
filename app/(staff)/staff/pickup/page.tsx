import { requireStaff } from "@/lib/auth";
import { PickupClient } from "./pickup-client";

export default async function PickupPage() {
  await requireStaff("counter");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pickup</h1>
        <p className="text-muted-foreground">
          Scan an item barcode or look up a PMB, verify photo ID, capture a signature, release
          the mail.
        </p>
      </div>
      <PickupClient />
    </div>
  );
}
