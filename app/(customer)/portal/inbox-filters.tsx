"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InboxFiltersProps {
  status?: string;
  category?: string;
  statuses: readonly string[];
  categories: readonly string[];
}

function pretty(value: string): string {
  return value.replaceAll("_", " ");
}

export function InboxFilters({ status, category, statuses, categories }: InboxFiltersProps) {
  const router = useRouter();

  function apply(nextStatus: string | undefined, nextCategory: string | undefined) {
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (nextCategory) params.set("category", nextCategory);
    const qs = params.toString();
    router.push(qs ? `/portal?${qs}` : "/portal");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status ?? "all"} onValueChange={(v) => apply(v === "all" ? undefined : v, category)}>
        <SelectTrigger size="sm" className="w-[160px] capitalize">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {pretty(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={category ?? "all"} onValueChange={(v) => apply(status, v === "all" ? undefined : v)}>
        <SelectTrigger size="sm" className="w-[160px] capitalize">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c} className="capitalize">
              {pretty(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status || category ? (
        <Link href="/portal" className="text-sm text-muted-foreground underline underline-offset-4">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
