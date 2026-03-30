import { randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import type { ExtractionResult, ProductSaleRecord, SalesReport } from "@/lib/types";

export function isSpreadsheetFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xls") || lower.endsWith(".xlsx");
}

export function parseSpreadsheetSalesReport(fileName: string, buffer: Buffer): ExtractionResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El Excel no contiene ninguna hoja.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("No se pudo leer la hoja principal del Excel.");
  }

  // Read formatted text for date extraction
  const textRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  // Read raw values so numeric cells arrive as JS numbers (avoids locale comma/dot issues)
  const rawRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });

  const saleDate = extractSaleDate(textRows) ?? fallbackDateFromFileName(fileName) ?? new Date().toISOString().slice(0, 10);
  const itemRows = rawRows
    .map((row) => row.map((cell) => cell ?? ""))
    .filter((row) => {
      const code = String(row[0]).trim();
      return code && /^\d+$/.test(code) && row[2] && row[4] !== "" && row[6] !== "";
    });

  if (!itemRows.length) {
    throw new Error("No se encontraron lineas de venta validas en el Excel.");
  }

  const productSales: ProductSaleRecord[] = itemRows.map((row) => ({
    id: randomUUID(),
    salesReportId: "",
    businessDate: saleDate,
    productCode: String(row[0]).trim(),
    productName: String(row[2]).trim(),
    units: toNumber(row[4]),
    amount: toNumber(row[6]),
  }));

  const totalSales = productSales.reduce((sum, item) => sum + item.amount, 0);
  const totalUnits = productSales.reduce((sum, item) => sum + item.units, 0);
  const salesReportId = randomUUID();
  const normalizedData: SalesReport = {
    id: salesReportId,
    businessDate: saleDate,
    totalSales,
    orderCount: totalUnits,
    averageTicket: totalUnits > 0 ? totalSales / totalUnits : 0,
    paymentMix: {},
  };

  return {
    documentType: "sales_report",
    confidence: 0.98,
    strategy: "native-text",
    summary: `Informe de ventas por articulos del ${saleDate}`,
    normalizedData,
    auxiliaryData: {
      productSales: productSales.map((item) => ({
        ...item,
        salesReportId,
      })),
    },
  };
}

function extractSaleDate(rows: Array<Array<string | number | null>>) {
  const flat = rows.flat().map((cell) => (cell ?? "").toString());
  const text = flat.join(" ");

  // Prefer "Data Inicial" (business date) over bare "Data" (report generation date)
  const match =
    text.match(/Data\s+Inicial\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) ??
    text.match(/Data\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);

  if (!match) {
    return null;
  }

  const [day, month, year] = match[1].split("/");
  return `${year}-${month}-${day}`;
}

function fallbackDateFromFileName(fileName: string) {
  const match = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function toNumber(value: string | number) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Valor numerico no valido: ${value}`);
    }
    return value;
  }

  const normalized = String(value).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`No se pudo convertir el valor numerico "${value}".`);
  }

  return parsed;
}
