// CRD (USPS CMRA Registration Database) CSV formatter.
// Kept isolated so the column format can track USPS spec changes without
// touching the export route (see docs/SPEC.md §M7).

export interface CrdRow {
  pmb: number | null;
  recipient_name: string;
  business_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  recipient_status: string;
  id_verified_at: string | null;
  id_expires_on: string | null;
  form_1583_signed_at: string | null;
  form_1583_terminated_at: string | null;
}

/** e.g. 2026-06-12 → "2026-Q2" */
export function currentQuarter(date: Date = new Date()): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function csvEscape(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  // Neutralize spreadsheet formula injection: names are customer-controlled,
  // and this file gets opened in Excel by staff.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replaceAll('"', '""')}"` : s;
}

const HEADER = [
  "pmb",
  "recipient_name",
  "business_name",
  "customer_name",
  "customer_email",
  "recipient_status",
  "id_verified_at",
  "id_expires_on",
  "form_1583_signed_at",
  "form_1583_terminated_at",
] as const;

export function buildCrdCsv(rows: CrdRow[]): string {
  const lines = [HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.pmb,
        row.recipient_name,
        row.business_name,
        row.customer_name,
        row.customer_email,
        row.recipient_status,
        row.id_verified_at,
        row.id_expires_on,
        row.form_1583_signed_at,
        row.form_1583_terminated_at,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
