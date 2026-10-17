// A single SELECT over the saved Z. Never join orders, reconstruct VAT or run DDL.
// Numeric amounts remain decimal strings. No staff, payment credentials or bank data.
export const STORED_CLOSINGS_SQL = `
SELECT c.id::text AS source_id, c.z_number, c.z_label,
       c.opened_at, c.closed_at,
       (((c.closed_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date)::text AS operating_date,
       c.total_cash::text, c.total_card::text, c.total_sales::text,
       c.total_base::text, c.total_vat::text, c.vat_breakdown,
       c.ticket_count, c.cash_count, c.card_count, c.cancelled_count,
       c.total_refunded::text, c.first_invoice, c.last_invoice,
       jsonb_build_object('name', c.business_snapshot->>'name', 'nif', c.business_snapshot->>'nif') AS business,
       c.supplier_payments_total::text, c.supplier_payments_count,
       c.expected_cash_after_supplier_payments::text
FROM pos.cash_closings c
WHERE ((c.closed_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date BETWEEN $1::date AND $2::date
  AND c.closed_at <= NOW()
ORDER BY c.closed_at, c.id
LIMIT 1001`;

export function hasApoloIdentity(row: Record<string, unknown>): boolean {
  const business = row.business as { nif?: string } | null;
  return String(business?.nif ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ES/, "") === "B55775068";
}
