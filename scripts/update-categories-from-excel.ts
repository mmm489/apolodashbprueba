/**
 * Sync product categories in product_costs with the "Articles per Departament
 * Venda" Excel export from the TPV.
 *
 * Excel format (one Sheet1):
 *   row 0..4 : title + filter info
 *   row N    : ["<num>", null, "<DEPT NAME>"]   ← department header
 *   row N+1  : ["Codi", null, "Descripció", null, "Unitats", null, "Import"]
 *   row N+2..: ["<product_code>", null, "<NAME>", null, "<units>", null, "<amount>"]
 *   ...
 *   row M    : ["TOTAL", null, null, null, "<units>", null, "<amount>"]
 *   then next department starts
 *
 * Behaviour:
 *   - Reads the Excel and builds a map product_code → category.
 *   - Normalises department names from ALL CAPS to Title Case (with a
 *     small dictionary of fixes for known typos / cases like "HI POP").
 *   - Updates product_costs.category only for product codes that already
 *     exist in our DB. Products from the Excel that we don't have rows for
 *     yet are reported but NOT inserted (avoids creating empty cost rows).
 *   - --dry-run shows what would change without touching the DB.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/update-categories-from-excel.ts <path> [--dry-run]
 */
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { getSql } from "@/lib/db";

/** Override map for department names that don't normalise cleanly. */
const NAME_OVERRIDES: Record<string, string> = {
  "HI POP": "Hi Pop",
  "ICE DRINKS": "Ice Drinks",
  "FROZZEN IOGURT": "Frozen Iogurt", // fix Excel typo
  "SALSAS I CREMES": "Salsas i Cremes",
};

/** Categories from the Excel that should be folded into a single "Toppings i
 * extres" bucket. The TPV splits toppings into 5 price-based buckets which
 * adds visual noise on the dashboard without giving useful information. */
const TOPPING_LIKE = new Set<string>([
  "Toppings",
  "Toppings 0,5€",
  "Topping 1€ Extra",
  "Topping Gelat 1 €",
  "Topping Gelat 2€",
]);

/** Categories whose products should be SKIPPED entirely from the sync.
 * Cosblanc is a separate supplier line the owner doesn't want classified
 * under our standard family taxonomy. */
function shouldSkipCategory(category: string): boolean {
  return /cosblanc/i.test(category);
}

function normaliseCategory(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (NAME_OVERRIDES[cleaned]) return NAME_OVERRIDES[cleaned];
  const titleCased = cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  if (TOPPING_LIKE.has(titleCased)) return "Toppings i extres";
  return titleCased;
}

function looksLikeDepartmentHeader(row: Array<string | number | Date | null>): boolean {
  const codeCell = String(row[0] ?? "").trim();
  const nameCell = String(row[2] ?? "").trim();
  const unitsCell = row[4];
  const amountCell = row[6];
  if (!/^\d+$/.test(codeCell)) return false;
  if (!nameCell) return false;
  if (nameCell !== nameCell.toUpperCase()) return false;
  if (nameCell === "CODI") return false;
  if (unitsCell != null && unitsCell !== "") return false;
  if (amountCell != null && amountCell !== "") return false;
  return true;
}

function looksLikeProductRow(row: Array<string | number | Date | null>): boolean {
  const codeCell = String(row[0] ?? "").trim();
  const nameCell = String(row[2] ?? "").trim();
  const unitsCell = row[4];
  if (!/^\d+$/.test(codeCell)) return false;
  if (!nameCell) return false;
  if (unitsCell == null || unitsCell === "") return false;
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Usage: tsx scripts/update-categories-from-excel.ts <path> [--dry-run]");
    process.exit(1);
  }

  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  // Walk the file. Each time we see a department header we update the
  // current category. Subsequent product rows inherit it until the next
  // header.
  const productToCategory = new Map<string, { name: string; category: string }>();
  let currentCategory: string | null = null;
  let departments = 0;

  let skippedCosblanc = 0;
  for (const row of rows) {
    if (!row) continue;
    if (looksLikeDepartmentHeader(row)) {
      const raw = String(row[2]).trim();
      currentCategory = normaliseCategory(raw);
      departments += 1;
      continue;
    }
    if (currentCategory && looksLikeProductRow(row)) {
      const code = String(row[0]).trim();
      const name = String(row[2]).trim();
      // Skip rows that are clearly subtotals or summaries
      if (code === "0") continue;
      // Owner wants the Cosblanc supplier line left alone — skip any of
      // its sub-departments.
      if (shouldSkipCategory(currentCategory) || shouldSkipCategory(String(row[2]))) {
        skippedCosblanc += 1;
        continue;
      }
      productToCategory.set(code, { name, category: currentCategory });
    }
  }
  if (skippedCosblanc > 0) {
    console.log(`(Excloent ${skippedCosblanc} productes de departaments Cosblanc.)`);
  }

  console.log(`\nLlegit ${departments} departaments i ${productToCategory.size} productes a l'Excel.\n`);

  // Per-category summary
  const byCategory = new Map<string, number>();
  for (const v of productToCategory.values()) {
    byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1);
  }
  console.log("Distribució per categoria:");
  for (const [cat, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(22)} ${count}`);
  }
  console.log();

  // Compare with DB
  const sql = getSql();
  const dbRows = await sql`SELECT product_code, product_name, category FROM product_costs`;
  const dbMap = new Map<string, { name: string; category: string }>();
  for (const r of dbRows) {
    dbMap.set(String(r.product_code), {
      name: String(r.product_name),
      category: String(r.category),
    });
  }

  let willChange = 0;
  let alreadyMatching = 0;
  let notInExcel = 0;
  let notInDb = 0;
  const changes: Array<{ code: string; name: string; from: string; to: string }> = [];

  for (const [code, excel] of productToCategory.entries()) {
    const db = dbMap.get(code);
    if (!db) {
      notInDb += 1;
      continue;
    }
    if (db.category === excel.category) {
      alreadyMatching += 1;
    } else {
      willChange += 1;
      changes.push({ code, name: db.name, from: db.category, to: excel.category });
    }
  }

  // Products in DB but not in Excel
  for (const code of dbMap.keys()) {
    if (!productToCategory.has(code)) notInExcel += 1;
  }

  console.log("=== Resum ===");
  console.log(`  Coincideixen ja:                 ${alreadyMatching}`);
  console.log(`  Es canviaran:                    ${willChange}`);
  console.log(`  Excel té però la BD no:          ${notInDb}  (no es tocaran)`);
  console.log(`  BD té però l'Excel no:           ${notInExcel}  (es deixen com estan)`);
  console.log();

  if (changes.length > 0) {
    console.log(`Exemples de canvis (primers 20):`);
    for (const c of changes.slice(0, 20)) {
      console.log(`  [${c.code}] ${c.name.padEnd(35)} ${c.from.padEnd(22)} → ${c.to}`);
    }
    if (changes.length > 20) console.log(`  ... i ${changes.length - 20} canvis més.`);
    console.log();
  }

  if (dryRun) {
    console.log("--dry-run: no s'ha tocat la BD.");
    return;
  }

  if (changes.length === 0) {
    console.log("✓ Cap canvi a aplicar.");
    return;
  }

  console.log(`Aplicant ${changes.length} actualitzacions...`);
  let updated = 0;
  for (const c of changes) {
    try {
      await sql`UPDATE product_costs SET category = ${c.to} WHERE product_code = ${c.code}`;
      updated += 1;
      if (updated % 50 === 0) console.log(`  ... ${updated} fets`);
    } catch (err) {
      console.error(`  Error a ${c.code}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\n✓ ${updated} categories actualitzades.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
