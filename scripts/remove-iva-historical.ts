/**
 * One-time migration: remove 10% IVA from bulk-imported historical sales.
 *
 * The CAIXES.xlsx import (import-historical-sales.ts) put gross (VAT-inclusive)
 * totals into sales_reports.total_sales for days that only had a yearly-
 * column total and no order/ticket data. The detailed Articles Venda uploads
 * coming from the TPV from 16 March 2026 onwards are already net of VAT, so
 * YoY comparisons were mixing net-current vs gross-historical and inflating
 * anything by ~+10%.
 *
 * This script divides total_sales by 1.10 for rows where:
 *   - order_count = 0 AND average_ticket = 0
 *   - document_id IS NULL  (extra safety: bulk imports don't attach a document)
 *
 * Idempotent: writes a flag to sync_state ("iva_historical_removed") and
 * refuses to re-run after success.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/remove-iva-historical.ts [--dry-run] [--force]
 *
 *   --dry-run : show what would change, don't touch the DB.
 *   --force   : ignore the sync_state guard (use only to recover from a
 *               partial run; double-applying divides again by 1.10).
 */
import { getSql } from "@/lib/db";
import { getSyncState, setSyncState } from "@/lib/repositories";

const IVA_RATE = 0.10; // 10% hostaleria
const IVA_DIVISOR = 1 + IVA_RATE;
const SYNC_KEY = "iva_historical_removed";

interface YearRow {
  year: number;
  days: number;
  total_before: number;
  total_after: number;
  min_day_before: number;
  max_day_before: number;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  const sql = getSql();

  // Idempotency guard
  if (!force) {
    const existing = await getSyncState(SYNC_KEY);
    if (existing) {
      console.error(`❌ Aquesta migració ja s'ha aplicat (flag=${existing}).`);
      console.error(`   Si vols tornar-la a córrer (p.ex. després d'una restauració), passa --force.`);
      process.exit(1);
    }
  }

  console.log(`\n=== Migració: treure IVA ${(IVA_RATE * 100).toFixed(0)}% dels dies històrics ===\n`);

  // Preview current state per year for bulk-imported rows
  const beforeRows = (await sql`
    SELECT
      EXTRACT(YEAR FROM business_date)::int AS year,
      COUNT(*)::int AS days,
      SUM(total_sales)::numeric(12,2) AS total_before,
      MIN(total_sales)::numeric(12,2) AS min_day_before,
      MAX(total_sales)::numeric(12,2) AS max_day_before
    FROM sales_reports
    WHERE order_count = 0
      AND average_ticket = 0
      AND document_id IS NULL
    GROUP BY year
    ORDER BY year
  `) as Array<{ year: number; days: number; total_before: string; min_day_before: string; max_day_before: string }>;

  if (!beforeRows.length) {
    console.log("Cap fila compleix el criteri (order_count=0 AND average_ticket=0 AND document_id IS NULL). Res a fer.");
    if (!dryRun && !force) {
      await setSyncState(SYNC_KEY, `skipped_empty_${new Date().toISOString()}`);
    }
    return;
  }

  let grandBefore = 0;
  let grandAfter = 0;
  const yearTable: YearRow[] = beforeRows.map((r) => {
    const before = Number(r.total_before);
    const after = Math.round((before / IVA_DIVISOR) * 100) / 100;
    grandBefore += before;
    grandAfter += after;
    return {
      year: r.year,
      days: r.days,
      total_before: before,
      total_after: after,
      min_day_before: Number(r.min_day_before),
      max_day_before: Number(r.max_day_before),
    };
  });

  console.log("Abans de la migració (valors BRUTS amb IVA):");
  console.log("  any   dies   min_dia   max_dia   total_any");
  for (const r of yearTable) {
    console.log(
      `  ${r.year}  ${String(r.days).padStart(4)}  ${r.min_day_before.toFixed(2).padStart(8)}  ${r.max_day_before.toFixed(2).padStart(8)}  ${r.total_before.toFixed(2).padStart(12)} €`,
    );
  }
  console.log(`  TOTAL      ${grandBefore.toFixed(2).padStart(34)} €\n`);

  console.log("Després de la migració (valors NETS sense IVA):");
  console.log("  any   dies   total_any");
  for (const r of yearTable) {
    console.log(`  ${r.year}  ${String(r.days).padStart(4)}  ${r.total_after.toFixed(2).padStart(12)} €`);
  }
  console.log(`  TOTAL      ${grandAfter.toFixed(2).padStart(12)} €`);
  console.log(`  Reducció:  ${(grandBefore - grandAfter).toFixed(2)} €  (≈ ${(IVA_RATE * 100).toFixed(0)}% de l'IVA repercutit)\n`);

  if (dryRun) {
    console.log("--dry-run: no s'ha tocat la BD.");
    return;
  }

  // Apply the update in a single statement. Using ROUND keeps cents clean.
  const updateResult = await sql`
    UPDATE sales_reports
    SET total_sales = ROUND((total_sales / ${IVA_DIVISOR})::numeric, 2)
    WHERE order_count = 0
      AND average_ticket = 0
      AND document_id IS NULL
  `;
  // Neon driver returns array of rows; also exposes .rowCount on some setups.
  const updatedCount = (updateResult as unknown as { rowCount?: number }).rowCount ?? yearTable.reduce((s, r) => s + r.days, 0);

  // Verify post-update totals
  const afterRows = (await sql`
    SELECT
      EXTRACT(YEAR FROM business_date)::int AS year,
      COUNT(*)::int AS days,
      SUM(total_sales)::numeric(12,2) AS total_after
    FROM sales_reports
    WHERE order_count = 0
      AND average_ticket = 0
      AND document_id IS NULL
    GROUP BY year
    ORDER BY year
  `) as Array<{ year: number; days: number; total_after: string }>;

  console.log(`✓ ${updatedCount} files actualitzades.\n`);
  console.log("Verificació post-migració:");
  console.log("  any   dies   total_verificat   esperat   diferència_cèntims");
  for (const exp of yearTable) {
    const got = afterRows.find((r) => r.year === exp.year);
    const actual = got ? Number(got.total_after) : 0;
    const diffCents = Math.round((actual - exp.total_after) * 100);
    const ok = Math.abs(diffCents) <= exp.days; // allow ~1 cent of rounding per row
    console.log(
      `  ${exp.year}  ${String(exp.days).padStart(4)}  ${actual.toFixed(2).padStart(14)} €  ${exp.total_after.toFixed(2).padStart(9)}  ${ok ? "✓" : "⚠"} ${diffCents >= 0 ? "+" : ""}${diffCents}`,
    );
  }

  const flagValue = JSON.stringify({
    appliedAt: new Date().toISOString(),
    divisor: IVA_DIVISOR,
    rowsUpdated: updatedCount,
    yearBreakdown: yearTable.map((r) => ({ year: r.year, days: r.days, before: r.total_before, after: r.total_after })),
  });
  await setSyncState(SYNC_KEY, flagValue);

  console.log(`\n✓ Migració aplicada i registrada a sync_state (${SYNC_KEY}).`);
  console.log("  Si cal tornar-la a aplicar per alguna raó, usa --force.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
