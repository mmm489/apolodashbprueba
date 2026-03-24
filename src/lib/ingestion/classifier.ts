import type { DocumentType } from "@/lib/types";

export function classifyDocument(fileName: string, text: string): DocumentType {
  const sample = `${fileName} ${text}`.toLowerCase();

  if (sample.includes("nomina")) {
    return "payroll";
  }

  if (sample.includes("extracto") || sample.includes("banco") || sample.includes("iban")) {
    return "bank_statement";
  }

  if (sample.includes("hora") || sample.includes("franja")) {
    return "hourly_report";
  }

  if (sample.includes("venta") || sample.includes("ticket medio") || sample.includes("tpv")) {
    return "sales_report";
  }

  if (sample.includes("factura") || sample.includes("iva") || sample.includes("proveedor")) {
    return "invoice";
  }

  return "unknown";
}
