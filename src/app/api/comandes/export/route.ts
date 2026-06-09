import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { listPosOrderLines } from "@/lib/repositories";
import type { PosOrderLineRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type ExportFormat = "csv" | "xlsx";

const CSV_HEADERS = [
  "Factura simplificada",
  "Comanda",
  "Fecha laboral",
  "Hora",
  "Estado",
  "Metodo de pago",
  "Empleado",
  "Mesa",
  "Tipo linea",
  "Producto padre",
  "Producto",
  "Categoria",
  "Cantidad",
  "Precio unitario",
  "Base imponible",
  "IVA %",
  "Cuota IVA",
  "Total linea",
  "Total ticket",
  "Notas visibles",
] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from"));
  const to = cleanDate(searchParams.get("to"));
  const format: ExportFormat = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const lines = (await listPosOrderLines(from, to)).filter((line) => line.paymentMethod !== "aparcat");
  const rows = lines.map(toExportRow);
  const suffix = from && to ? `${from}_${to}` : "comandes";

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...CSV_HEADERS] });
    worksheet["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 8 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 10 },
      { wch: 14 },
      { wch: 26 },
      { wch: 30 },
      { wch: 18 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 36 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Factures simplificades");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="factures-simplificades-${suffix}.xlsx"`,
      },
    });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="factures-simplificades-${suffix}.csv"`,
    },
  });
}

function toExportRow(line: PosOrderLineRecord) {
  const parent = modifierParent(line.notes);
  return {
    "Factura simplificada": line.invoiceNumber ?? "",
    Comanda: line.orderNumber,
    "Fecha laboral": line.businessDate,
    Hora: line.orderTime,
    Estado: statusLabel(line.status),
    "Metodo de pago": paymentLabel(line.paymentMethod),
    Empleado: line.employeeName ?? "",
    Mesa: line.tableNumber ?? "",
    "Tipo linea": parent ? "Complemento" : "Producto",
    "Producto padre": parent ?? "",
    Producto: displayLineName(line),
    Categoria: line.categoryName ?? "",
    Cantidad: round(line.qty),
    "Precio unitario": round(line.unitPrice),
    "Base imponible": round(line.lineBase),
    "IVA %": round(line.vatRate),
    "Cuota IVA": round(line.lineVat),
    "Total linea": round(line.lineTotal),
    "Total ticket": round(line.orderTotal),
    "Notas visibles": visibleNote(line.notes) ?? "",
  } satisfies Record<(typeof CSV_HEADERS)[number], string | number>;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvCell(row[header])).join(",")),
  ];
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\r\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function displayLineName(line: PosOrderLineRecord) {
  const display = noteDisplayName(line.notes);
  return display || line.productName;
}

function modifierParent(notes: string | null) {
  const first = notes?.split(/\r?\n/, 1)[0]?.trim() || "";
  return first.toLowerCase().startsWith("per ") ? first.slice(4).trim() : null;
}

function noteDisplayName(notes: string | null) {
  return (
    notes
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith("nom:"))
      ?.slice(4)
      .trim() || null
  );
}

function visibleNote(notes: string | null) {
  const hasParent = Boolean(modifierParent(notes));
  const visible = notes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index) => {
      if (!line) return false;
      if (index === 0 && hasParent) return false;
      if (/^HC[-_\s]*(PARENT[-_\s]*)?LINE\s*:?\s*/i.test(line)) return false;
      if (line.toLowerCase().startsWith("nom:")) return false;
      return true;
    })
    .join("\n")
    .trim();
  return visible || null;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    preparing: "Preparando",
    ready: "Lista",
    completed: "Completada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    manual: "Tarjeta",
    cash: "Efectivo",
    card: "Tarjeta",
  };
  return labels[method] ?? method;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
