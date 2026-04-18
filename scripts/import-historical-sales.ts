/**
 * Imports historical daily sales totals from the CAIXES.xlsx file into the
 * sales_reports table.
 *
 * The file has one row per calendar day ("1-Jan", "30-Jun"...) and one column
 * per year (2020..2026). Each cell is the day's total sales formatted like
 * "1,888.20 €".
 *
 * IMPORTANT — VAT handling:
 *   The CAIXES values are GROSS (VAT-inclusive). By default this script
 *   divides each amount by 1.10 (10% hostaleria VAT) before inserting, so
 *   the rows match the net-of-VAT data that the Articles Venda TPV exports
 *   from 16 March 2026 onwards. Pass --gross to disable the conversion and
 *   store the raw amounts verbatim (not recommended — will skew YoY
 *   comparisons).
 *
 * Only total_sales is known from this source; order_count and average_ticket
 * stay at 0. Days that already have a sales_reports row (imported from an
 * Articles Venda spreadsheet with full detail) are LEFT ALONE — we never
 * overwrite richer data with a bulk historical row.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/import-historical-sales.ts <path> [--dry-run] [--gross]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { getSql } from "@/lib/db";

const IVA_DIVISOR = 1.10;

// Real Apolo data: 2023 onwards (earlier years not imported per owner).
const YEAR_COLUMNS: Record<number, number> = {
  2023: 4,
  2024: 5,
  2025: 9,
  2026: 10,
};

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseAmount(raw: string | number | Date | null): number | null {
  if (raw == null || raw === "") return null;
  const str = String(raw).trim();
  if (!str) return null;
  // "1,888.20 €" → 1888.20; "0.00 €" → 0
  const cleaned = str.replace(/[€\s]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseDate(label: string, year: number): string | null {
  const m = label.match(/^(\d{1,2})-([A-Za-z]{3})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = MONTH_MAP[m[2]];
  if (!month) return null;
  const iso = `${year}-${month}-${day}`;
  // Reject impossible dates (Feb 30, Feb 29 non-leap)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` !== iso) {
    return null;
  }
  return iso;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const gross = args.includes("--gross");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Usage: tsx scripts/import-historical-sales.ts <path> [--dry-run] [--gross]");
    process.exit(1);
  }
  if (gross) {
    console.warn("⚠️  --gross: els imports es guardaran BRUTS (amb IVA). No es recomana — trenca les comparatives YoY.");
  } else {
    console.log(`ℹ️  Els valors del CAIXES es dividiran per ${IVA_DIVISOR} per treure IVA 10%. Usa --gross per desactivar.`);
  }

  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  const sql = getSql();

  // Pre-fetch existing business_dates so we can skip them without hitting BD
  // once per row. Keeps the script fast even with ~1500 rows.
  console.log("Llegint dates existents a sales_reports...");
  const existingRows = await sql`SELECT business_date FROM sales_reports`;
  const existingDates = new Set<string>();
  for (const r of existingRows) {
    const raw = r.business_date;
    let iso: string;
    if (raw instanceof Date) {
      iso = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
    } else {
      iso = String(raw).slice(0, 10);
    }
    existingDates.add(iso);
  }
  console.log(`→ ${existingDates.size} dies ja existents a la BD (es protegeixen).\n`);

  // Walk the spreadsheet and build the list of inserts
  type Candidate = { date: string; year: number; amount: number };
  const toInsert: Candidate[] = [];
  const skippedExisting: Candidate[] = [];
  const perYear: Record<number, { candidates: number; skipped: number; zero: number }> = {};
  for (const yStr of Object.keys(YEAR_COLUMNS)) {
    perYear[Number(yStr)] = { candidates: 0, skipped: 0, zero: 0 };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const label = String(row[0] ?? "").trim();
    if (!label || !label.includes("-")) continue;

    for (const [yStr, col] of Object.entries(YEAR_COLUMNS)) {
      const year = Number(yStr);
      const amount = parseAmount(row[col] as string | null);
      if (amount === null) continue;

      // Safety: a gelateria realistically never takes >€10k in a single day.
      // Values above this threshold are accumulated totals that leaked into
      // the daily column (e.g. an "ACUM" cell copied into a daily slot).
      if (amount > 10000) {
        console.warn(`  Ignorat valor sospitos (${amount} €) a fila ${i + 1}, any ${year}, label "${label}"`);
        continue;
      }

      const iso = parseDate(label, year);
      if (!iso) continue;

      // Do not import dates in the future — those are placeholders
      const todayIso = new Date().toISOString().slice(0, 10);
      if (iso > todayIso) continue;

      perYear[year].candidates += 1;
      if (amount === 0) perYear[year].zero += 1;

      // Apply IVA reduction unless --gross was passed. Rounding matches the
      // remove-iva-historical.ts migration so both paths are numerically
      // consistent.
      const storedAmount = gross
        ? amount
        : Math.round((amount / IVA_DIVISOR) * 100) / 100;

      const candidate: Candidate = { date: iso, year, amount: storedAmount };

      if (existingDates.has(iso)) {
        perYear[year].skipped += 1;
        skippedExisting.push(candidate);
        continue;
      }
      toInsert.push(candidate);
    }
  }

  console.log("=== Resum per any ===");
  for (const year of Object.keys(perYear).sort()) {
    const p = perYear[Number(year)];
    console.log(`  ${year}: ${p.candidates} candidats  (${p.zero} amb 0€, ${p.skipped} ja existeixen i es preserven)`);
  }
  console.log(`\n=> ${toInsert.length} files a INSERTAR, ${skippedExisting.length} a protegir\n`);

  if (dryRun) {
    console.log("--dry-run especificat, no s'ha tocat la BD.");
    console.log("Exemples de primeres 5 inserts:");
    for (const c of toInsert.slice(0, 5)) {
      console.log(`  ${c.date}: ${c.amount.toFixed(2)} €`);
    }
    console.log("Exemples de primeres 5 protegides:");
    for (const c of skippedExisting.slice(0, 5)) {
      console.log(`  ${c.date}: ${c.amount.toFixed(2)} € (existent no tocat)`);
    }
    return;
  }

  // Actual import: one INSERT per row so a single bad date doesn't abort
  // everything. Good enough for ~1500 rows on Neon.
  let inserted = 0;
  for (const c of toInsert) {
    try {
      await sql`
        INSERT INTO sales_reports (id, document_id, business_date, total_sales, order_count, average_ticket, payment_mix)
        VALUES (${randomUUID()}, ${null}, ${c.date}, ${c.amount}, ${0}, ${0}, ${JSON.stringify({})})
      `;
      inserted += 1;
      if (inserted % 100 === 0) console.log(`  ... ${inserted} inserits`);
    } catch (error) {
      console.error(`Error a ${c.date}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n✓ Import complet: ${inserted} files afegides.`);
  console.log(`  ${skippedExisting.length} files existents preservades (dades detallades intactes).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
