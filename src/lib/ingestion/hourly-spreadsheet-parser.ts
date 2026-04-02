import { randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import type { ExtractionResult, HourlySalesEntry } from "@/lib/types";

import { extractSaleDate, fallbackDateFromFileName, toNumber, validateDate } from "./spreadsheet-parser";

/**
 * Detects if an Excel buffer contains an hourly sales report.
 * Supports both "RESUM HORES" (simple) and "RESUM HORES DETALLAT" (per-product).
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

    const headerRows = rows.slice(0, 15);
    const text = headerRows
      .flat()
      .map((cell) => String(cell ?? "").toUpperCase())
      .join(" ");

    // Match "RESUM HORES" or "RESUM HORES DETALLAT" + has HORA header
    return text.includes("HORA") && (text.includes("RESUM HORES") || text.includes("OPERACIONS") || text.includes("IMPORT"));
  } catch {
    return false;
  }
}

/**
 * Parses hourly Excel files into HourlySalesEntry records.
 * Supports two formats:
 *   - "RESUM HORES": HORA | OPERACIONS | IMPORT (aggregated per half-hour)
 *   - "RESUM HORES DETALLAT": Hora | Article | Descripció | Unitats | Import (per-product per hour)
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

  // Detect format by checking title/headers
  const allText = textRows.slice(0, 15).flat().map((c) => String(c ?? "").toUpperCase()).join(" ");
  const isDetailed = allText.includes("DETALLAT") || (allText.includes("HORA") && allText.includes("ARTICLE") && allText.includes("DESCRIP"));

  if (!allText.includes("HORA")) {
    throw new Error(`El format del fitxer "${fileName}" no es un Resum Hores valid. Falta la capçalera HORA.`);
  }

  const saleDate =
    extractSaleDate(textRows) ??
    fallbackDateFromFileName(fileName) ??
    new Date().toISOString().slice(0, 10);
  validateDate(saleDate, fileName);

  const entries = isDetailed
    ? parseDetailedFormat(rawRows, textRows, saleDate)
    : parseSimpleFormat(rawRows, textRows, saleDate);

  if (!entries.length) {
    throw new Error("No s'han trobat linies horàries vàlides a l'Excel.");
  }

  return {
    documentType: "hourly_report",
    confidence: 0.98,
    strategy: "native-text",
    summary: `Informe horari de vendes del ${saleDate}`,
    normalizedData: entries,
  };
}

/* ---------- Detailed format: Hora | Article | Descripció | Unitats | Import ---------- */

function parseDetailedFormat(
  rawRows: Array<Array<string | number | null>>,
  textRows: Array<Array<string | number | null>>,
  saleDate: string,
): HourlySalesEntry[] {
  // Find header row
  let horaCol = -1;
  let unitatsCol = -1;
  let importCol = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(textRows.length, 15); i++) {
    const row = textRows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").toUpperCase().trim();
      if (cell === "HORA") horaCol = j;
      else if (cell === "UNITATS") unitatsCol = j;
      else if (cell === "IMPORT") importCol = j;
    }
    if (horaCol >= 0 && importCol >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    throw new Error("No s'han trobat les capçaleres Hora/Import a l'Excel detallat.");
  }

  // Calibrate columns from first data row (merged cells can shift indices)
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    // Find a row with a time range pattern in horaCol
    const hourCell = String(row[horaCol] ?? "").trim();
    if (/^\d{1,2}-\d{1,2}$/.test(hourCell) || /^\d{1,2}:\d{2}/.test(hourCell)) {
      // Find numeric columns after horaCol for units and import
      const numCols: number[] = [];
      for (let j = horaCol + 1; j < row.length; j++) {
        if (row[j] != null && row[j] !== "" && typeof row[j] === "number") {
          numCols.push(j);
        }
      }
      if (numCols.length >= 2) {
        unitatsCol = numCols[numCols.length - 2];
        importCol = numCols[numCols.length - 1];
      } else if (numCols.length === 1) {
        importCol = numCols[0];
      }
      break;
    }
  }

  // Parse and aggregate by hour
  const hourMap = new Map<string, { sales: number; orderCount: number }>();
  let currentHour = "";
  const hourPattern = /^\d{1,2}-\d{1,2}$/;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    // Check if this row starts a new hour
    const hourCell = String(row[horaCol] ?? "").trim();
    if (hourPattern.test(hourCell)) {
      currentHour = hourCell;
    }

    // Skip rows without a current hour or TOTAL rows
    if (!currentHour || hourCell.toUpperCase() === "TOTAL") continue;

    // Get import value
    const importVal = importCol >= 0 && row[importCol] != null && row[importCol] !== ""
      ? toNumber(row[importCol]!)
      : 0;
    const unitatsVal = unitatsCol >= 0 && row[unitatsCol] != null && row[unitatsCol] !== ""
      ? toNumber(row[unitatsCol]!)
      : 0;

    if (importVal === 0 && unitatsVal === 0) continue;

    const existing = hourMap.get(currentHour);
    if (existing) {
      existing.sales += importVal;
      existing.orderCount += unitatsVal;
    } else {
      hourMap.set(currentHour, { sales: importVal, orderCount: unitatsVal });
    }
  }

  // Convert hour ranges "10-11" to "10:00" format
  return [...hourMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, data]) => ({
      id: randomUUID(),
      businessDate: saleDate,
      hour: normalizeHourRange(hour),
      sales: data.sales,
      orderCount: data.orderCount,
    }));
}

/** Converts "10-11" to "10:00", passes through "10:00" as-is */
function normalizeHourRange(hour: string): string {
  if (hour.includes(":")) return hour;
  const start = hour.split("-")[0];
  return `${start}:00`;
}

/* ---------- Simple format: HORA | OPERACIONS | IMPORT ---------- */

function parseSimpleFormat(
  rawRows: Array<Array<string | number | null>>,
  textRows: Array<Array<string | number | null>>,
  saleDate: string,
): HourlySalesEntry[] {
  // Find header row
  let horaCol = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(textRows.length, 15); i++) {
    const row = textRows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").toUpperCase().trim();
      if (cell === "HORA") horaCol = j;
    }
    if (horaCol >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0 || horaCol < 0) {
    throw new Error("No s'han trobat les capçaleres HORA a l'Excel.");
  }

  // Detect actual numeric columns from first data row
  let operacionsCol = -1;
  let importCol = -1;
  const timePattern = /^\d{1,2}:\d{2}$/;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    const hourCell = String(row[horaCol] ?? "").trim();
    if (!timePattern.test(hourCell)) continue;

    const numericCols: number[] = [];
    for (let j = horaCol + 1; j < row.length; j++) {
      if (row[j] != null && row[j] !== "" && typeof row[j] === "number" && Number.isFinite(row[j] as number)) {
        numericCols.push(j);
      }
    }
    if (numericCols.length >= 2) {
      operacionsCol = numericCols[0];
      importCol = numericCols[1];
    } else if (numericCols.length === 1) {
      importCol = numericCols[0];
    }
    break;
  }

  // Parse data rows
  const entries: HourlySalesEntry[] = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    const hourCell = String(row[horaCol] ?? "").trim();
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

  // Cross-check with TOTAL row
  for (let i = rawRows.length - 1; i > headerRowIdx; i--) {
    const row = rawRows[i];
    if (!row) continue;
    const cell = String(row[horaCol] ?? "").toUpperCase().trim();
    if (cell === "TOTAL" && importCol >= 0 && row[importCol] != null && row[importCol] !== "") {
      const excelTotal = toNumber(row[importCol]!);
      const calcTotal = entries.reduce((s, e) => s + e.sales, 0);
      const diff = Math.abs(calcTotal - excelTotal);
      if (diff > 0.5) {
        console.warn(`[hourly-parser] Totals no quadren: calculat=${calcTotal.toFixed(2)}, Excel=${excelTotal.toFixed(2)}, diff=${diff.toFixed(2)}`);
      }
      break;
    }
  }

  return entries;
}
