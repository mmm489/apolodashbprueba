import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { buildLedger, buildProfitAndLoss, getAccountingWorkspace } from "@/lib/accounting";

export const dynamic = "force-dynamic";

type ExportKind = "journal" | "ledger" | "trial-balance" | "pnl" | "vat" | "bank";
type ExportFormat = "csv" | "xlsx";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from")) ?? monthStart();
  const to = cleanDate(searchParams.get("to")) ?? todayIso();
  const kind = cleanKind(searchParams.get("kind"));
  const format: ExportFormat = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const workspace = await getAccountingWorkspace(from, to);
  const rows = rowsForKind(kind, workspace);
  const suffix = `${kind}-${from}_${to}`;

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName(kind));
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contabilidad-${suffix}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contabilidad-${suffix}.csv"`,
    },
  });
}

function rowsForKind(kind: ExportKind, workspace: Awaited<ReturnType<typeof getAccountingWorkspace>>) {
  if (kind === "journal") {
    return workspace.entries.flatMap((entry) => entry.lines.map((line) => ({
      Fecha: entry.entryDate,
      Periodo: entry.period,
      Estado: entry.status,
      Origen: entry.sourceType,
      Documento: entry.sourceId,
      Descripcion: entry.description,
      Cuenta: line.accountCode,
      "Nombre cuenta": line.accountName,
      Debe: round(line.debit),
      Haber: round(line.credit),
      Memo: line.memo ?? "",
    })));
  }
  if (kind === "ledger" || kind === "trial-balance") {
    return buildLedger(workspace.entries).map((row) => ({
      Cuenta: row.accountCode,
      Nombre: row.accountName,
      Debe: round(row.debit),
      Haber: round(row.credit),
      Saldo: round(row.balance),
    }));
  }
  if (kind === "pnl") {
    const pnl = buildProfitAndLoss(workspace.entries);
    return [
      { Concepto: "Ingresos", Importe: round(pnl.income) },
      { Concepto: "Gastos", Importe: round(pnl.expenses) },
      { Concepto: "Resultado", Importe: round(pnl.result) },
    ];
  }
  if (kind === "vat") {
    return [
      { Concepto: "IVA repercutido", Importe: round(workspace.vatSummary.outputVat) },
      { Concepto: "IVA soportado", Importe: round(workspace.vatSummary.inputVat) },
      { Concepto: "IVA a pagar", Importe: round(workspace.vatSummary.payableVat) },
    ];
  }
  return workspace.bankTransactions.map((tx) => ({
    Fecha: tx.transactionDate,
    "Fecha valor": tx.valueDate ?? "",
    Descripcion: tx.description,
    Contraparte: tx.counterparty ?? "",
    Importe: round(tx.amount),
    Estado: tx.status,
  }));
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))];
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\r\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function cleanKind(value: string | null): ExportKind {
  if (value === "ledger" || value === "trial-balance" || value === "pnl" || value === "vat" || value === "bank") return value;
  return "journal";
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sheetName(kind: ExportKind) {
  return kind === "trial-balance" ? "Balance" : kind;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart() {
  return `${todayIso().slice(0, 8)}01`;
}
