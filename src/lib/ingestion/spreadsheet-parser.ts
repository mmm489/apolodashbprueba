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
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  const saleDate = extractSaleDate(rows) ?? fallbackDateFromFileName(fileName) ?? new Date().toISOString().slice(0, 10);
  const itemRows = rows
    .map((row) => row.map((cell) => (cell ?? "").toString().trim()))
    .filter((row) => row[0] && /^\d+$/.test(row[0]) && row[2] && row[4]);

  const productSales: ProductSaleRecord[] = itemRows.map((row) => ({
    id: randomUUID(),
    salesReportId: "",
    businessDate: saleDate,
    productCode: row[0],
    productName: row[2],
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
  const match = flat.join(" ").match(/Data\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
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

function toNumber(value: string) {
  return Number(value.replace(",", "."));
}
