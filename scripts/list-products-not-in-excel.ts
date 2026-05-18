import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { getSql } from "@/lib/db";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/list-products-not-in-excel.ts <xls path>");
    process.exit(1);
  }
  const buffer = readFileSync(path);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  // Collect all codes present in the Excel
  const excelCodes = new Set<string>();
  for (const row of rows) {
    if (!row) continue;
    const codeCell = String(row[0] ?? "").trim();
    const nameCell = String(row[2] ?? "").trim();
    const unitsCell = row[4];
    // Product rows: numeric code + name + units present
    if (/^\d+$/.test(codeCell) && nameCell && unitsCell != null && unitsCell !== "") {
      excelCodes.add(codeCell);
    }
  }

  const sql = getSql();
  // Fetch all products + their total sales (to see if they're still active)
  const result = await sql`
    SELECT
      pc.product_code,
      pc.product_name,
      pc.category,
      COALESCE(SUM(ps.units), 0) AS total_units,
      COALESCE(SUM(ps.amount), 0) AS total_amount,
      MAX(ps.business_date) AS last_sale_date
    FROM product_costs pc
    LEFT JOIN product_sales ps ON ps.product_code = pc.product_code
    GROUP BY pc.product_code, pc.product_name, pc.category
    ORDER BY total_amount DESC
  `;

  const orphans = result
    .map((r) => ({
      code: String(r.product_code),
      name: String(r.product_name),
      category: String(r.category),
      units: Number(r.total_units ?? 0),
      amount: Number(r.total_amount ?? 0),
      lastSale: r.last_sale_date ? String(r.last_sale_date).slice(0, 10) : null,
    }))
    .filter((r) => !excelCodes.has(r.code));

  console.log(`\n=== ${orphans.length} productes a BD que NO surten a l'Excel ===\n`);
  console.log("CODI    NOM                                            CAT.ACTUAL          UNITATS    IMPORT    ÚLTIMA VENDA");
  for (const o of orphans) {
    console.log(
      `${o.code.padEnd(7)} ${o.name.slice(0, 44).padEnd(45)} ${o.category.slice(0, 18).padEnd(19)} ${String(o.units).padStart(8)}  ${o.amount.toFixed(2).padStart(8)} €  ${o.lastSale ?? "(mai venut)"}`
    );
  }

  const totalAmount = orphans.reduce((s, o) => s + o.amount, 0);
  console.log(`\nTotal en vendes d'aquests productes: ${totalAmount.toFixed(2)} €`);
  const neverSold = orphans.filter((o) => o.amount === 0).length;
  console.log(`Dels quals mai venuts: ${neverSold}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
