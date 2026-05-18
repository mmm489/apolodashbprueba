import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const path = process.argv[2];
if (!path) {
  console.error("Uso: tsx scripts/inspect-departaments.ts <path>");
  process.exit(1);
}

const buffer = readFileSync(path);
const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

console.log(`\nFitxer: ${path}`);
console.log(`Sheets: ${workbook.SheetNames.join(", ")}\n`);

for (const name of workbook.SheetNames) {
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });
  console.log(`=== Sheet: ${name}  (${rows.length} rows) ===`);
  // Show first 25 rows
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    console.log(`  row ${i}: ${JSON.stringify(rows[i])}`);
  }
  if (rows.length > 25) console.log(`  ... and ${rows.length - 25} more rows`);
  console.log();
}
