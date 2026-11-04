import { cn } from "@/lib/utils";

/** MailboxOS wordmark + mark. Plain (no client/server APIs) so it works in both trees. */
export function Logo({
  className,
  showWord = true,
  tone = "default",
}: {
  className?: string;
  showWord?: boolean;
  tone?: "default" | "invert";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-8 place-items-center rounded-[0.6rem] bg-brand text-brand-foreground shadow-[0_4px_14px_-4px] shadow-brand/50">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M3 9.5h18" />
          <path d="M8 14h4" />
        </svg>
      </span>
      {showWord ? (
        <span className={cn("text-[15px] font-semibold tracking-tight", tone === "invert" ? "text-white" : "text-foreground")}>
          MailboxOS
        </span>
      ) : null}
    </span>
  );
}
