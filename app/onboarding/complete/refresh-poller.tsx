"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

/** Re-fetches the page every 3s (max 10 tries) while the Stripe webhook finalizes the mailbox. */
export function RefreshPoller() {
  const router = useRouter();
  const tries = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      tries.current += 1;
      if (tries.current > 10) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      Checking again automatically…
    </div>
  );
}
