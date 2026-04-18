import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const path = process.argv[2];
const buffer = readFileSync(path);
const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(sheet, {
  header: 1,
  blankrows: false,
  raw: false,
});

// Show header
console.log("HEADER:");
rows[0].forEach((cell, i) => console.log(`  col ${i}: ${JSON.stringify(cell)}`));

// Show rows from different parts of the year
console.log("\n--- FEB (rows 32-35) ---");
for (let i = 32; i < 36 && i < rows.length; i++) {
  console.log(`row ${i}: ${JSON.stringify(rows[i])}`);
}
console.log("\n--- JUL (rows 182-186) ---");
for (let i = 182; i < 187 && i < rows.length; i++) {
  console.log(`row ${i}: ${JSON.stringify(rows[i])}`);
}
console.log("\n--- AUG (rows 213-217) ---");
for (let i = 213; i < 218 && i < rows.length; i++) {
  console.log(`row ${i}: ${JSON.stringify(rows[i])}`);
}
console.log("\n--- SEP (rows 244-248) ---");
for (let i = 244; i < 249 && i < rows.length; i++) {
  console.log(`row ${i}: ${JSON.stringify(rows[i])}`);
}

// Check how many rows have values in 2025 (col 9) vs 2026 (col 10)
let count2025 = 0, count2026 = 0;
const nonNull2025: number[] = [];
const nonNull2026: number[] = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (row[9] != null && row[9] !== "" && row[9] !== "0.00 €") { count2025++; nonNull2025.push(i); }
  if (row[10] != null && row[10] !== "" && row[10] !== "0.00 €") { count2026++; nonNull2026.push(i); }
}
console.log(`\n2025 non-zero rows: ${count2025}`);
console.log(`2026 non-zero rows: ${count2026}`);
console.log(`2025 row range: ${nonNull2025[0]} - ${nonNull2025[nonNull2025.length - 1]}`);
console.log(`2026 row range: ${nonNull2026[0]} - ${nonNull2026[nonNull2026.length - 1]}`);
