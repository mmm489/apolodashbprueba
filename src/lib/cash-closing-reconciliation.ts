import type { CashClosingRecord } from "./types";

export function cashClosingsQuery(from?: string, to?: string) {
  const filtered = Boolean(from && to);
  return {
    params: filtered ? [from!, to!] : [],
    text: `SELECT c.id,c.z_number,c.z_label,c.opened_at,c.closed_at,
      c.total_cash,c.total_card,c.total_sales,c.ticket_count,c.cash_count,c.card_count,
      c.cancelled_count,c.total_refunded,c.first_invoice,c.last_invoice,e.name AS employee_name,
      payments.total_cash-refunds.cash_amount AS reconciled_cash,
      payments.total_card-refunds.card_amount AS reconciled_card,
      payments.total_sales-refunds.amount AS reconciled_sales,
      payments.ticket_count AS reconciled_tickets
      FROM pos.cash_closings c
      LEFT JOIN pos.employees e ON e.id=c.employee_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(o.total),0) AS total_sales,
          COALESCE(SUM(o.total) FILTER (WHERE o.payment_method='cash'),0) AS total_cash,
          COALESCE(SUM(o.total) FILTER (WHERE o.payment_method IN ('card','manual')),0) AS total_card,
          COUNT(*)::int AS ticket_count
        FROM pos.orders o
        WHERE o.created_at>=c.opened_at AND o.created_at<c.closed_at
          AND o.invoice_number IS NOT NULL AND o.status<>'cancelled'
          AND o.payment_method IN ('cash','card','manual')
          AND COALESCE(o.business_unit,'hicream')='hicream'
      ) payments ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(r.amount),0) AS amount,
          COALESCE(SUM(r.amount) FILTER (WHERE o.payment_method='cash'),0) AS cash_amount,
          COALESCE(SUM(r.amount) FILTER (WHERE o.payment_method IN ('card','manual')),0) AS card_amount
        FROM pos.refunds r JOIN pos.orders o ON o.id=r.order_id
        WHERE r.status='completed' AND r.completed_at>=c.opened_at AND r.completed_at<c.closed_at
          AND COALESCE(o.business_unit,'hicream')='hicream'
      ) refunds ON TRUE
      ${filtered ? "WHERE ((c.closed_at AT TIME ZONE 'Europe/Madrid')-INTERVAL '4 hours')::date >= $1::date AND ((c.closed_at AT TIME ZONE 'Europe/Madrid')-INTERVAL '4 hours')::date <= $2::date" : ""}
      ORDER BY c.closed_at DESC ${filtered ? "" : "LIMIT 200"}`,
  };
}

const moneyDifference = (current: number, saved: number) =>
  (Math.round(current * 100) - Math.round(saved * 100)) / 100;

export function mapCashClosing(row: Record<string, unknown>): CashClosingRecord {
  const totalSales = Number(row.total_sales ?? 0);
  const totalCash = Number(row.total_cash ?? 0);
  const totalCard = Number(row.total_card ?? 0);
  const ticketCount = Number(row.ticket_count ?? 0);
  const reconciledSales = Number(row.reconciled_sales ?? 0);
  const reconciledCash = Number(row.reconciled_cash ?? 0);
  const reconciledCard = Number(row.reconciled_card ?? 0);
  const reconciledTickets = Number(row.reconciled_tickets ?? 0);
  const difference = moneyDifference(reconciledSales, totalSales);
  const cashDifference = moneyDifference(reconciledCash, totalCash);
  const cardDifference = moneyDifference(reconciledCard, totalCard);
  const ticketDifference = reconciledTickets - ticketCount;

  // The original Z is immutable; current sales are a separate comparison, never a replacement.
  return {
    id: String(row.id), zNumber: row.z_number == null ? null : Number(row.z_number),
    zLabel: row.z_label ? String(row.z_label) : `Tancament ${row.id}`,
    openedAt: new Date(String(row.opened_at)).toISOString(),
    closedAt: new Date(String(row.closed_at)).toISOString(),
    totalSales, totalCash, totalCard, ticketCount,
    cashCount: Number(row.cash_count ?? 0), cardCount: Number(row.card_count ?? 0),
    cancelledCount: Number(row.cancelled_count ?? 0), totalRefunded: Number(row.total_refunded ?? 0),
    firstInvoice: row.first_invoice ? String(row.first_invoice) : null,
    lastInvoice: row.last_invoice ? String(row.last_invoice) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
    reconciliation: {
      totalSales: reconciledSales, totalCash: reconciledCash, totalCard: reconciledCard,
      ticketCount: reconciledTickets, difference, cashDifference, cardDifference, ticketDifference,
      hasDifference: difference !== 0 || cashDifference !== 0 || cardDifference !== 0 || ticketDifference !== 0,
    },
  };
}
