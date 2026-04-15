import { readFile } from "node:fs/promises";

import { parseHourlySpreadsheetReport, isHourlySpreadsheet } from "@/lib/ingestion/hourly-spreadsheet-parser";
import { listHourlySales } from "@/lib/repositories";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: tsx scripts/compare-hourly-file.ts <ruta_al_xls>");
    process.exit(1);
  }
  const buffer = await readFile(filePath);
  console.log(`\n=== Fichero: ${filePath} ===`);
  console.log(`isHourlySpreadsheet: ${isHourlySpreadsheet(buffer)}`);

  const fileName = filePath.split(/[\\/]/).pop() ?? "file.xls";
  const result = parseHourlySpreadsheetReport(fileName, buffer);
  const entries = result.normalizedData as Array<{ businessDate: string; hour: string; sales: number; orderCount: number }>;

  const saleDate = entries[0]?.businessDate;
  const totalFile = entries.reduce((s, e) => s + e.sales, 0);
  const unitsFile = entries.reduce((s, e) => s + e.orderCount, 0);
  console.log(`\nFecha en el fichero: ${saleDate}`);
  console.log(`Total ventas: ${totalFile.toFixed(2)} € | Total unidades: ${unitsFile}`);
  console.log(`Lineas horarias: ${entries.length}\n`);

  for (const e of entries) {
    console.log(`  ${e.hour}  →  ${e.sales.toFixed(2)} €  (${e.orderCount} u)`);
  }

  // Compare with DB
  if (saleDate) {
    console.log(`\n=== En BD para ${saleDate} ===`);
    const dbRows = await listHourlySales(saleDate, saleDate);
    const totalDb = dbRows.reduce((s, r) => s + r.sales, 0);
    const unitsDb = dbRows.reduce((s, r) => s + r.orderCount, 0);
    console.log(`Total ventas: ${totalDb.toFixed(2)} € | Total unidades: ${unitsDb}`);
    console.log(`Lineas horarias: ${dbRows.length}\n`);
    for (const r of dbRows) {
      console.log(`  ${r.hour}  →  ${r.sales.toFixed(2)} €  (${r.orderCount} u)`);
    }

    console.log(`\n=== Comparacion ===`);
    console.log(`Diferencia total ventas: ${(totalFile - totalDb).toFixed(2)} €`);
    console.log(`Diferencia unidades:     ${unitsFile - unitsDb}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
