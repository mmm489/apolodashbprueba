import type { DocumentType } from "@/lib/types";

export function classifyDocument(fileName: string, text: string): DocumentType {
  const sample = `${fileName} ${text}`.toLowerCase();

  if (sample.includes("nomina") || sample.includes("nòmina")) {
    return "payroll";
  }

  if (sample.includes("extracto") || sample.includes("extracte") || sample.includes("banco") || sample.includes("banc") || sample.includes("iban")) {
    return "bank_statement";
  }

  if (sample.includes("hora") || sample.includes("franja")) {
    return "hourly_report";
  }

  if (sample.includes("venta") || sample.includes("venda") || sample.includes("ticket medio") || sample.includes("tpv")) {
    return "sales_report";
  }

  if (
    sample.includes("factura") ||
    sample.includes("invoice") ||
    sample.includes("iva") ||
    sample.includes("proveedor") || sample.includes("proveïdor") ||
    sample.includes("amazon") ||
    sample.includes("base imponible") || sample.includes("base imposable") ||
    sample.includes("importe total") || sample.includes("import total") ||
    sample.includes("total a pagar")
  ) {
    return "invoice";
  }

  return "unknown";
}
