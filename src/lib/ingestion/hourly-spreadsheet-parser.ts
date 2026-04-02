import { randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import type { ExtractionResult, HourlyProductSale, HourlySalesEntry } from "@/lib/types";

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

  // Must be "RESUM HORES DETALLAT" format
  const allText = textRows.slice(0, 15).flat().map((c) => String(c ?? "").toUpperCase()).join(" ");
  const isDetailed = allText.includes("DETALLAT") || (allText.includes("HORA") && allText.includes("ARTICLE") && allText.includes("DESCRIP"));

  if (!isDetailed) {
    throw new Error(`Format no acceptat. Necessitem el "Resum Hores Detallat" (amb Article, Descripció, Unitats, Import per hora). El format antic "Resum Hores" ja no es suporta.`);
  }

  const saleDate =
    extractSaleDate(textRows) ??
    fallbackDateFromFileName(fileName) ??
    new Date().toISOString().slice(0, 10);
  validateDate(saleDate, fileName);

  const { entries, productDetails } = parseDetailedFormat(rawRows, textRows, saleDate);

  if (!entries.length) {
    throw new Error("No s'han trobat linies horàries vàlides a l'Excel.");
  }

  return {
    documentType: "hourly_report",
    confidence: 0.98,
    strategy: "native-text",
    summary: `Informe horari detallat de vendes del ${saleDate}`,
    normalizedData: entries,
    auxiliaryData: {
      hourlyProductSales: productDetails,
    },
  };
}

/* ---------- Detailed format: Hora | Article | Descripció | Unitats | Import ---------- */

function parseDetailedFormat(
  rawRows: Array<Array<string | number | null>>,
  textRows: Array<Array<string | number | null>>,
  saleDate: string,
): { entries: HourlySalesEntry[]; productDetails: HourlyProductSale[] } {
  // Find header row
  let horaCol = -1;
  let articleCol = -1;
  let descripcioCol = -1;
  let unitatsCol = -1;
  let importCol = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(textRows.length, 15); i++) {
    const row = textRows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").toUpperCase().trim();
      if (cell === "HORA") horaCol = j;
      else if (cell === "ARTICLE" || cell === "CODI") articleCol = j;
      else if (cell.startsWith("DESCRIP")) descripcioCol = j;
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

  // Parse rows: aggregate by hour + capture product details
  const hourMap = new Map<string, { sales: number; orderCount: number }>();
  const productDetails: HourlyProductSale[] = [];
  let currentHour = "";
  const hourPattern = /^\d{1,2}-\d{1,2}$/;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    const hourCell = String(row[horaCol] ?? "").trim();
    if (hourPattern.test(hourCell)) {
      currentHour = hourCell;
    }

    if (!currentHour || hourCell.toUpperCase() === "TOTAL") continue;

    const importVal = importCol >= 0 && row[importCol] != null && row[importCol] !== ""
      ? toNumber(row[importCol]!)
      : 0;
    const unitatsVal = unitatsCol >= 0 && row[unitatsCol] != null && row[unitatsCol] !== ""
      ? toNumber(row[unitatsCol]!)
      : 0;

    if (importVal === 0 && unitatsVal === 0) continue;

    // Aggregate hourly totals
    const existing = hourMap.get(currentHour);
    if (existing) {
      existing.sales += importVal;
      existing.orderCount += unitatsVal;
    } else {
      hourMap.set(currentHour, { sales: importVal, orderCount: unitatsVal });
    }

    // Capture product detail
    const productCode = articleCol >= 0 ? String(row[articleCol] ?? "").trim() : "";
    const productName = descripcioCol >= 0 ? String(row[descripcioCol] ?? "").trim() : "";
    if (productCode || productName) {
      productDetails.push({
        id: randomUUID(),
        businessDate: saleDate,
        hourLabel: normalizeHourRange(currentHour),
        productCode,
        productName,
        units: unitatsVal,
        amount: importVal,
      });
    }
  }

  const entries = [...hourMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, data]) => ({
      id: randomUUID(),
      businessDate: saleDate,
      hour: normalizeHourRange(hour),
      sales: data.sales,
      orderCount: data.orderCount,
    }));

  return { entries, productDetails };
}

/** Converts "10-11" to "10:00", passes through "10:00" as-is */
function normalizeHourRange(hour: string): string {
  if (hour.includes(":")) return hour;
  const start = hour.split("-")[0];
  return `${start}:00`;
}

