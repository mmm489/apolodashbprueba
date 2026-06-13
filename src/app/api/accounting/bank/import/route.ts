import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { importBankTransactions } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedBankRow = {
  transactionDate: string;
  valueDate?: string | null;
  description: string;
  counterparty?: string | null;
  amount: number;
  externalSeed: string;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const accountName = String(formData.get("accountName") ?? "Banco principal");
    const iban = formData.get("iban") ? String(formData.get("iban")) : null;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo bancario obligatorio." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedRows = parseBankFile(file.name, buffer);
    const result = await importBankTransactions({ accountName, iban, rows: parsedRows });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Bank import failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error importando banco." }, { status: 500 });
  }
}

function parseBankFile(fileName: string, buffer: Buffer) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
    return rows.map((row, index) => normalizeRow(row, index)).filter(isParsedBankRow);
  }

  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const delimiter = text.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines[0], delimiter);
  return lines.slice(1)
    .map((line, index) => {
      const values = splitCsvLine(line, delimiter);
      const row: Record<string, unknown> = {};
      headers.forEach((header, i) => { row[header] = values[i] ?? ""; });
      return normalizeRow(row, index);
    })
    .filter(isParsedBankRow);
}

function normalizeRow(row: Record<string, unknown>, index: number): ParsedBankRow | null {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(cleanKey(key), value);
  }
  const transactionDate = parseDate(
    pick(normalized, ["fecha", "data", "date", "fecha operacion", "fecha operación", "operation date"]),
  );
  const valueDate = parseDate(pick(normalized, ["fecha valor", "value date", "data valor"]));
  const description = String(pick(normalized, ["descripcion", "descripción", "concepto", "detalle", "description", "movimiento"]) ?? "").trim();
  const counterparty = String(pick(normalized, ["contraparte", "beneficiario", "ordenante", "counterparty"]) ?? "").trim() || null;
  const amount = parseAmount(
    pick(normalized, ["importe", "amount", "monto", "euros"])
      ?? signedAmountFromDebitCredit(normalized),
  );
  if (!transactionDate || !description || amount == null) return null;
  return {
    transactionDate,
    valueDate,
    description,
    counterparty,
    amount,
    externalSeed: String(index),
  };
}

function isParsedBankRow(row: ParsedBankRow | null): row is ParsedBankRow {
  return row !== null;
}

function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((item) => item.trim());
}

function signedAmountFromDebitCredit(row: Map<string, unknown>) {
  const debit = parseAmount(pick(row, ["debe", "cargo", "debit"]));
  const credit = parseAmount(pick(row, ["haber", "abono", "credit"]));
  if (debit != null && debit !== 0) return -Math.abs(debit);
  if (credit != null && credit !== 0) return Math.abs(credit);
  return null;
}

function pick(row: Map<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row.has(cleanKey(key))) return row.get(cleanKey(key));
  }
  return null;
}

function parseDate(value: unknown) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const spanish = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (spanish) {
    const year = spanish[3].length === 2 ? `20${spanish[3]}` : spanish[3];
    return `${year}-${spanish[2].padStart(2, "0")}-${spanish[1].padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[€]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
