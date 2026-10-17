import assert from "node:assert/strict";
import { test } from "node:test";
import { cashClosingsQuery, mapCashClosing, effectiveCashClosing } from "../src/lib/cash-closing-reconciliation";

const original = {
  id: 1, z_number: 1, z_label: "Z-2026/000001", opened_at: "2026-01-01T02:00:00Z", closed_at: "2026-01-02T02:00:00Z",
  total_sales: "100.00", total_cash: "40.00", total_card: "60.00", ticket_count: 10, cash_count: 4, card_count: 6,
  cancelled_count: 1, total_refunded: "0", first_invoice: "S-2026/000001", last_invoice: "S-2026/000010",
  reconciled_sales: "111.75", reconciled_cash: "40.00", reconciled_card: "71.75", reconciled_tickets: 11,
};

test("original Z amounts and invoice range stay intact; difference is separate", () => {
  const result = mapCashClosing(original);
  assert.equal(result.totalSales, 100); assert.equal(result.ticketCount, 10);
  assert.equal(result.lastInvoice, "S-2026/000010");
  assert.equal(result.reconciliation.totalSales, 111.75); assert.equal(result.reconciliation.difference, 11.75);
  assert.equal(result.reconciliation.cashDifference, 0); assert.equal(result.reconciliation.cardDifference, 11.75);
  assert.equal(result.reconciliation.ticketDifference, 1); assert.equal(result.reconciliation.hasDifference, true);
});
test("matching totals do not hide a payment-method or ticket discrepancy", () => {
  const result = mapCashClosing({ ...original, reconciled_sales: original.total_sales });
  assert.equal(result.reconciliation.difference, 0); assert.equal(result.reconciliation.hasDifference, true);
});
test("matching and empty closings have no rounding differences", () => {
  for (const amount of [0, 0.1 + 0.2, 770.95]) {
    const result = mapCashClosing({ ...original, total_sales: amount, total_cash: amount, total_card: 0, ticket_count: 0,
      reconciled_sales: amount, reconciled_cash: amount, reconciled_card: 0, reconciled_tickets: 0 });
    assert.equal(result.reconciliation.hasDifference, false);
  }
});
test("missing synchronized sales are a visible negative difference, not a fallback", () => {
  const result = mapCashClosing({ ...original, reconciled_sales: 0, reconciled_cash: 0, reconciled_card: 0, reconciled_tickets: 0 });
  assert.equal(result.totalSales, 100); assert.equal(result.reconciliation.difference, -100);
});
test("date filters are parameterized and reconciliation is independent of KDS", () => {
  const query = cashClosingsQuery("2026-10-01", "2026-10-16");
  assert.deepEqual(query.params, ["2026-10-01", "2026-10-16"]);
  assert.match(query.text, /o\.created_at<c\.closed_at/);
  assert.match(query.text, /r\.completed_at<c\.closed_at/);
  assert.match(query.text, /o\.invoice_number IS NOT NULL/);
  assert.doesNotMatch(query.text, /o\.status[^\n]*pending/);
  assert.match(cashClosingsQuery().text, /LIMIT 200/);
  assert.deepEqual(cashClosingsQuery().params, []);
});

const adjusted = () => ({ ...original, recorded_adjustment: {
  id: "test-adjustment", recorded_at: "2026-01-03T12:00:00Z", recorded_by: "Test actor", reason: "Missing invoice",
  original_snapshot: { ...original }, corrected_snapshot: { total_sales: 111.75, total_cash: 40, total_card: 71.75,
    ticket_count: 11, first_invoice: original.first_invoice, last_invoice: "S-2026/000011" },
  evidence: [{ id: 11, invoice_number: "S-2026/000011", total: 11.75, payment_method: "card" }],
} });
test("recorded correction is the main figure while preserving the original for audit", () => {
  const c = mapCashClosing(adjusted()), e = effectiveCashClosing(c);
  assert.equal(c.totalSales, 100); assert.equal(c.lastInvoice, "S-2026/000010");
  assert.equal(e.totalSales, 111.75); assert.equal(e.ticketCount, 11); assert.equal(e.lastInvoice, "S-2026/000011");
  assert.equal(e.hasDifference, false); assert.equal(c.adjustment?.evidence[0].invoiceNumber, "S-2026/000011");
});
test("new differences remain visible after a recorded correction", () => {
  const c = mapCashClosing({ ...adjusted(), reconciled_sales: 115.75, reconciled_card: 75.75, reconciled_tickets: 12 });
  const e = effectiveCashClosing(c);
  assert.equal(e.totalSales, 111.75); assert.equal(e.difference, 4); assert.equal(e.ticketDifference, 1); assert.equal(e.hasDifference, true);
});
test("changed original snapshot is flagged and never silently receives an obsolete adjustment", () => {
  for (const changes of [{ total_sales: 99 }, { last_invoice: "different" }, { closed_at: "2026-01-02T03:00:00Z" }]) {
    const c = mapCashClosing({ ...adjusted(), ...changes });
    assert.equal(c.adjustment?.sourceMatches, false); assert.equal(effectiveCashClosing(c).hasDifference, true);
    assert.equal(effectiveCashClosing(c).totalSales, c.totalSales);
  }
});
test("unadjusted closings keep the stored main figure, not the current recalculation", () => {
  const e = effectiveCashClosing(mapCashClosing(original));
  assert.equal(e.totalSales, 100); assert.equal(e.difference, 11.75); assert.equal(e.hasDifference, true);
});
test("PostgreSQL Date objects preserve the millisecond cutoff when matching the saved snapshot", () => {
  const input = adjusted();
  const opened = "2026-01-01T02:00:00.123Z", closed = "2026-01-02T02:00:00.810Z";
  input.recorded_adjustment.original_snapshot.opened_at = opened;
  input.recorded_adjustment.original_snapshot.closed_at = closed;
  const c = mapCashClosing({ ...input, opened_at: new Date(opened), closed_at: new Date(closed) });
  assert.equal(c.adjustment?.sourceMatches, true); assert.equal(effectiveCashClosing(c).totalSales, 111.75);
  assert.equal(c.openedAt, opened); assert.equal(c.closedAt, closed);
});
