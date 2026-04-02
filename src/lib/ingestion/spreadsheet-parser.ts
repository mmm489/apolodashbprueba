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

  // Validate format: must have expected headers (Codi, Descripció/Descripcio, Unitats, Import)
  const headerText = textRows.slice(0, 15).flat().map((c) => String(c ?? "").toUpperCase()).join(" ");
  const hasExpectedHeaders =
    (headerText.includes("CODI") || headerText.includes("CODIGO")) &&
    (headerText.includes("DESCRIP") || headerText.includes("PRODUCTO")) &&
    (headerText.includes("UNITAT") || headerText.includes("UNIDADES")) &&
    (headerText.includes("IMPORT") || headerText.includes("IMPORTE"));
  if (!hasExpectedHeaders) {
    throw new Error(`El format del fitxer "${fileName}" no es un Articles Venda valid. Falten capçaleres (Codi, Descripcio, Unitats, Import).`);
  }

  const saleDate = extractSaleDate(textRows) ?? fallbackDateFromFileName(fileName) ?? new Date().toISOString().slice(0, 10);
  validateDate(saleDate, fileName);
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

  // Cross-check with TOTAL row if present in the Excel
  const excelTotal = findTotalRow(rawRows, 6);
  if (excelTotal != null) {
    const diff = Math.abs(totalSales - excelTotal);
    if (diff > 0.5) {
      console.warn(`[articles-parser] Totals no quadren: calculat=${totalSales.toFixed(2)}, Excel=${excelTotal.toFixed(2)}, diff=${diff.toFixed(2)}`);
    }
  }

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

export function extractSaleDate(rows: Array<Array<string | number | null>>) {
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

export function fallbackDateFromFileName(fileName: string) {
  const match = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function validateDate(dateStr: string, fileName: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data invalida detectada a "${fileName}": ${dateStr}`);
  }
  if (date > now) {
    throw new Error(`La data ${dateStr} de "${fileName}" es futura. Comprova el fitxer.`);
  }
  if (date < oneYearAgo) {
    throw new Error(`La data ${dateStr} de "${fileName}" es de fa mes d'un any. Comprova el fitxer.`);
  }
}

function findTotalRow(rows: Array<Array<string | number | null>>, amountCol: number): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row) continue;
    const firstCell = String(row[0] ?? "").toUpperCase().trim();
    if (firstCell === "TOTAL" || firstCell === "TOTALS") {
      const val = row[amountCol];
      if (val != null && val !== "") {
        try {
          return toNumber(val);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function toNumber(value: string | number) {
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
