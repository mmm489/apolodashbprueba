import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { listTimeClockSessions } from "@/lib/repositories";
import type { TimeClockSessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from"));
  const to = cleanDate(searchParams.get("to"));
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const sessions = await listTimeClockSessions(from, to);
  const rows = sessions.map(toExportRow);
  const suffix = from && to ? `${from}_${to}` : "control-horario";

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Control horario");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="control-horario-${suffix}.xlsx"`,
      },
    });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="control-horario-${suffix}.csv"`,
    },
  });
}

function toExportRow(session: TimeClockSessionRecord) {
  return {
    Empleado: session.employeeName,
    "Dia laboral": session.businessDate,
    Entrada: formatDateTime(session.clockInAt),
    Salida: session.clockOutAt ? formatDateTime(session.clockOutAt) : "",
    "Minutos trabajados": session.durationMinutes ?? "",
    "Horas trabajadas": session.durationMinutes == null ? "" : formatDuration(session.durationMinutes),
    Estado: session.status,
    Dispositivo: session.deviceName ?? session.source,
  };
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "Empleado,Dia laboral,Entrada,Salida,Minutos trabajados,Horas trabajadas,Estado,Dispositivo\r\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\r\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
