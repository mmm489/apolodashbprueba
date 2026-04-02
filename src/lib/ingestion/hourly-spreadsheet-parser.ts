import { randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import type { ExtractionResult, HourlySalesEntry } from "@/lib/types";

import { extractSaleDate, fallbackDateFromFileName, toNumber, validateDate } from "./spreadsheet-parser";

/**
 * Detects if an Excel buffer contains an hourly sales report ("Resum Hores").
 * Checks the first 15 rows for header cells containing "HORA" and "OPERACIONS" or "IMPORT".
 */
export function isHourlySpreadsheet(buffer: Buffer): boolean {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return false;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return false;

    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    // Check first 15 rows for hourly report headers
    const headerRows = rows.slice(0, 15);
    const text = headerRows
      .flat()
      .map((cell) => String(cell ?? "").toUpperCase())
      .join(" ");

    return text.includes("HORA") && (text.includes("OPERACIONS") || text.includes("IMPORT"));
  } catch {
    return false;
  }
}

/**
 * Parses a "Resum Hores" Excel file into HourlySalesEntry records.
 */
export function parseHourlySpreadsheetReport(fileName: string, buffer: Buffer): ExtractionResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("L'Excel no conté cap full.");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("No s'ha pogut llegir el full principal de l'Excel.");

  const textRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  const rawRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });

  const saleDate =
    extractSaleDate(textRows) ??
    fallbackDateFromFileName(fileName) ??
    new Date().toISOString().slice(0, 10);
  validateDate(saleDate, fileName);

  // Find header row with HORA column to determine column indices
  let horaCol = -1;
  let operacionsCol = -1;
  let importCol = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(textRows.length, 15); i++) {
    const row = textRows[i];
    if (!row) continue;

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").toUpperCase().trim();
      if (cell === "HORA") horaCol = j;
      else if (cell === "OPERACIONS") operacionsCol = j;
      else if (cell === "IMPORT") importCol = j;
    }

    if (horaCol >= 0 && (operacionsCol >= 0 || importCol >= 0)) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0 || horaCol < 0) {
    throw new Error("No s'han trobat les capçaleres HORA/OPERACIONS/IMPORT a l'Excel.");
  }

  // Parse data rows after the header
  const entries: HourlySalesEntry[] = [];
  const timePattern = /^\d{1,2}:\d{2}$/;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    const hourCell = String(row[horaCol] ?? "").trim();

    // Skip TOTAL row and non-time rows
    if (hourCell.toUpperCase() === "TOTAL" || !timePattern.test(hourCell)) continue;

    const orderCount = operacionsCol >= 0 ? toNumber(row[operacionsCol] ?? 0) : 0;
    const sales = importCol >= 0 ? toNumber(row[importCol] ?? 0) : 0;

    entries.push({
      id: randomUUID(),
      businessDate: saleDate,
      hour: hourCell,
      sales,
      orderCount,
    });
  }

  if (!entries.length) {
    throw new Error("No s'han trobat linies horàries vàlides a l'Excel.");
  }

  // Cross-check with TOTAL row if present
  for (let i = rawRows.length - 1; i > headerRowIdx; i--) {
    const row = rawRows[i];
    if (!row) continue;
    const cell = String(row[horaCol] ?? "").toUpperCase().trim();
    if (cell === "TOTAL") {
      if (importCol >= 0 && row[importCol] != null && row[importCol] !== "") {
        const excelTotal = toNumber(row[importCol]!);
        const calcTotal = entries.reduce((s, e) => s + e.sales, 0);
        const diff = Math.abs(calcTotal - excelTotal);
        if (diff > 0.5) {
          console.warn(`[hourly-parser] Totals no quadren: calculat=${calcTotal.toFixed(2)}, Excel=${excelTotal.toFixed(2)}, diff=${diff.toFixed(2)}`);
        }
      }
      break;
    }
  }

  return {
    documentType: "hourly_report",
    confidence: 0.98,
    strategy: "native-text",
    summary: `Informe horari de vendes del ${saleDate}`,
    normalizedData: entries,
  };
}
