import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { listPosOrderLines } from "@/lib/repositories";
import type { PosOrderLineRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type ExportFormat = "csv" | "xlsx";
type ExportType = "detail" | "iva-summary";

const CSV_HEADERS = [
  "Factura simplificada",
  "Comanda",
  "Fecha laboral",
  "Hora",
  "Estado",
  "Metodo de pago",
  "Empleado",
  "Servicio",
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

const IVA_SUMMARY_HEADERS = ["DATA", "DOCUMENTS", "N.D.", "BASE", "% IVA", "IMPOR. IVA", "TOTAL"] as const;

type IvaSummaryRow = {
  businessDate: string;
  invoiceStart: string;
  invoiceEnd: string;
  documents: number;
  base: number;
  vatRate: number;
  vat: number;
  total: number;
};

type IvaRateTotal = {
  vatRate: number;
  base: number;
  vat: number;
  total: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from"));
  const to = cleanDate(searchParams.get("to"));
  const format: ExportFormat = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const type: ExportType = searchParams.get("type") === "iva-summary" ? "iva-summary" : "detail";
  const allLines = await listPosOrderLines(from, to);
  const suffix = from && to ? `${from}_${to}` : "comandes";

  if (type === "iva-summary") {
    return exportIvaSummary(allLines, from, to, format, suffix);
  }

  const lines = allLines.filter((line) => line.paymentMethod !== "aparcat");
  const rows = lines.map(toExportRow);

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
      { wch: 14 },
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

  const csv = toCsv(rows, CSV_HEADERS);
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
    Servicio: serviceLabel(line.serviceType),
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

function exportIvaSummary(
  lines: PosOrderLineRecord[],
  from: string | undefined,
  to: string | undefined,
  format: ExportFormat,
  suffix: string,
) {
  const summary = buildIvaSummary(lines);
  const filename = `vendes-iva-${suffix}`;

  if (format === "xlsx") {
    const workbook = buildIvaSummaryWorkbook(summary.rows, summary.rateTotals, from, to);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  const csv = toCsv(toIvaSummaryCsvRows(summary.rows, summary.rateTotals), IVA_SUMMARY_HEADERS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

function buildIvaSummary(lines: PosOrderLineRecord[]) {
  const orders = new Map<
    string,
    {
      businessDate: string;
      createdAt: string;
      invoiceNumber: string;
      base: number;
      vatRate: number;
      vat: number;
      total: number;
    }
  >();

  for (const line of lines) {
    if (!isIvaSummaryLine(line) || orders.has(line.orderId)) continue;
    orders.set(line.orderId, {
      businessDate: line.businessDate,
      createdAt: line.createdAt,
      invoiceNumber: line.invoiceNumber ?? "",
      base: line.orderBase,
      vatRate: line.vatRate,
      vat: line.orderVat,
      total: line.orderTotal,
    });
  }

  const groups = new Map<
    string,
    {
      businessDate: string;
      vatRate: number;
      orders: Array<{
        createdAt: string;
        invoiceNumber: string;
        base: number;
        vat: number;
        total: number;
      }>;
    }
  >();

  for (const order of orders.values()) {
    const key = `${order.businessDate}|${rateKey(order.vatRate)}`;
    const group =
      groups.get(key) ??
      {
        businessDate: order.businessDate,
        vatRate: order.vatRate,
        orders: [],
      };
    group.orders.push(order);
    groups.set(key, group);
  }

  const rows = [...groups.values()]
    .map((group) => {
      const sortedOrders = group.orders.sort((a, b) => {
        const byTime = a.createdAt.localeCompare(b.createdAt);
        return byTime || a.invoiceNumber.localeCompare(b.invoiceNumber);
      });
      return {
        businessDate: group.businessDate,
        invoiceStart: sortedOrders[0]?.invoiceNumber ?? "",
        invoiceEnd: sortedOrders[sortedOrders.length - 1]?.invoiceNumber ?? "",
        documents: sortedOrders.length,
        base: round(sortedOrders.reduce((sum, order) => sum + order.base, 0)),
        vatRate: round(group.vatRate),
        vat: round(sortedOrders.reduce((sum, order) => sum + order.vat, 0)),
        total: round(sortedOrders.reduce((sum, order) => sum + order.total, 0)),
      } satisfies IvaSummaryRow;
    })
    .sort((a, b) => {
      const byDate = a.businessDate.localeCompare(b.businessDate);
      return byDate || a.vatRate - b.vatRate;
    });

  const rateTotals = [...rows.reduce((map, row) => {
    const key = rateKey(row.vatRate);
    const total = map.get(key) ?? {
      vatRate: row.vatRate,
      base: 0,
      vat: 0,
      total: 0,
    };
    total.base += row.base;
    total.vat += row.vat;
    total.total += row.total;
    map.set(key, total);
    return map;
  }, new Map<string, IvaRateTotal>()).values()]
    .map((total) => ({
      vatRate: total.vatRate,
      base: round(total.base),
      vat: round(total.vat),
      total: round(total.total),
    }))
    .sort((a, b) => a.vatRate - b.vatRate);

  return { rows, rateTotals };
}

function isIvaSummaryLine(line: PosOrderLineRecord) {
  return line.paymentMethod !== "aparcat" && line.status !== "cancelled" && Boolean(line.invoiceNumber);
}

function buildIvaSummaryWorkbook(
  rows: IvaSummaryRow[],
  rateTotals: IvaRateTotal[],
  from: string | undefined,
  to: string | undefined,
) {
  const totalBase = round(rows.reduce((sum, row) => sum + row.base, 0));
  const totalVat = round(rows.reduce((sum, row) => sum + row.vat, 0));
  const totalAmount = round(rows.reduce((sum, row) => sum + row.total, 0));
  const worksheetRows: Array<Array<string | number>> = [
    ["Llistat  IVA General Agrupat (Tots els Documents)"],
    [],
    ["Terminal Inicial : 1-Terminal 1", "", "", "", "", "", "", "", "", "", "", "", "Data Inicial : ", formatReportDate(from)],
    ["Terminal Final : 1-Terminal 1", "", "", "", "", "", "", "", "", "", "", "", "Data Final : ", formatReportDate(to)],
    [],
    ["Torn : T"],
    [],
    [`DATA : ${formatMadridDate()}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Pagina 1 de 1"],
    [],
    buildIvaWorksheetRow({
      date: "DATA",
      documents: "DOCUMENTS",
      count: "N.D.",
      base: "BASE",
      rate: "% IVA",
      vat: "IMPOR.  IVA",
      total: "TOTAL",
    }),
    ...rows.map((row) =>
      buildIvaWorksheetRow({
        date: formatReportDate(row.businessDate),
        documents: invoiceRange(row),
        count: row.documents,
        base: row.base,
        rate: row.vatRate,
        vat: row.vat,
        total: row.total,
      }),
    ),
    [],
    buildIvaWorksheetRow({
      date: "TOTAL",
      documents: "",
      count: "",
      base: totalBase,
      rate: "",
      vat: totalVat,
      total: totalAmount,
    }),
    [],
    ...rateTotals.map((total) =>
      buildIvaWorksheetRow({
        date: `TOTAL ${formatRateLabel(total.vatRate)}%`,
        documents: "",
        count: "",
        base: total.base,
        rate: "",
        vat: total.vat,
        total: total.total,
      }),
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 3 },
    { wch: 24 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 8 },
    { wch: 4 },
    { wch: 12 },
    { wch: 4 },
    { wch: 4 },
    { wch: 9 },
    { wch: 4 },
    { wch: 12 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 12 },
  ];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 18 } },
    { s: { r: 7, c: 18 }, e: { r: 7, c: 19 } },
  ];

  applyIvaNumberFormats(worksheet, rows.length, rateTotals.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "IVA General Agrupat");
  return workbook;
}

function buildIvaWorksheetRow(values: {
  date: string;
  documents: string;
  count: string | number;
  base: string | number;
  rate: string | number;
  vat: string | number;
  total: string | number;
}) {
  const row: Array<string | number> = Array.from({ length: 19 }, () => "");
  row[0] = values.date;
  row[2] = values.documents;
  row[7] = values.count;
  row[9] = values.base;
  row[12] = values.rate;
  row[14] = values.vat;
  row[18] = values.total;
  return row;
}

function applyIvaNumberFormats(worksheet: XLSX.WorkSheet, dataRows: number, rateTotals: number) {
  const amountFormat = "#,##0.00";
  const countFormat = "0";
  const rateFormat = "0.00";
  const dataStart = 10;
  const dataEnd = dataStart + dataRows - 1;
  for (let row = dataStart; row <= dataEnd; row += 1) {
    setCellFormat(worksheet, row, 7, countFormat);
    setCellFormat(worksheet, row, 9, amountFormat);
    setCellFormat(worksheet, row, 12, rateFormat);
    setCellFormat(worksheet, row, 14, amountFormat);
    setCellFormat(worksheet, row, 18, amountFormat);
  }
  const totalRow = dataStart + dataRows + 1;
  [9, 14, 18].forEach((column) => setCellFormat(worksheet, totalRow, column, amountFormat));
  const rateTotalStart = totalRow + 2;
  for (let row = rateTotalStart; row < rateTotalStart + rateTotals; row += 1) {
    [9, 14, 18].forEach((column) => setCellFormat(worksheet, row, column, amountFormat));
  }
}

function setCellFormat(worksheet: XLSX.WorkSheet, row: number, column: number, format: string) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  if (worksheet[address]) {
    worksheet[address].z = format;
  }
}

function toIvaSummaryCsvRows(rows: IvaSummaryRow[], rateTotals: IvaRateTotal[]) {
  const totalBase = round(rows.reduce((sum, row) => sum + row.base, 0));
  const totalVat = round(rows.reduce((sum, row) => sum + row.vat, 0));
  const totalAmount = round(rows.reduce((sum, row) => sum + row.total, 0));
  const csvRows: Array<Record<(typeof IVA_SUMMARY_HEADERS)[number], string | number>> = rows.map((row) => ({
    DATA: formatReportDate(row.businessDate),
    DOCUMENTS: invoiceRange(row),
    "N.D.": row.documents,
    BASE: row.base,
    "% IVA": formatRateLabel(row.vatRate),
    "IMPOR. IVA": row.vat,
    TOTAL: row.total,
  }));
  csvRows.push({
    DATA: "TOTAL",
    DOCUMENTS: "",
    "N.D.": "",
    BASE: totalBase,
    "% IVA": "",
    "IMPOR. IVA": totalVat,
    TOTAL: totalAmount,
  });
  for (const total of rateTotals) {
    csvRows.push({
      DATA: `TOTAL ${formatRateLabel(total.vatRate)}%`,
      DOCUMENTS: "",
      "N.D.": "",
      BASE: total.base,
      "% IVA": "",
      "IMPOR. IVA": total.vat,
      TOTAL: total.total,
    });
  }
  return csvRows;
}

function invoiceRange(row: IvaSummaryRow) {
  if (!row.invoiceStart) return row.invoiceEnd;
  if (!row.invoiceEnd || row.invoiceStart === row.invoiceEnd) return row.invoiceStart;
  return `${row.invoiceStart}-${row.invoiceEnd}`;
}

function rateKey(rate: number) {
  return round(rate).toFixed(2);
}

function formatRateLabel(rate: number) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

function formatReportDate(date: string | undefined) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatMadridDate() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function toCsv(rows: Array<Record<string, unknown>>, headers: readonly string[]) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
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

function serviceLabel(serviceType: "dine_in" | "takeaway") {
  return serviceType === "takeaway" ? "Llevar" : "Aqui";
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
