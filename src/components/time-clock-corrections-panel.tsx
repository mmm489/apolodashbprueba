"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatDashboardDate, formatDashboardTime } from "@/lib/timezone";
import type { TimeClockCorrectionRequest } from "@/lib/types";

export function TimeClockCorrectionsPanel({
  requests,
}: {
  requests: TimeClockCorrectionRequest[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = requests.filter((item) => item.status === "pending");
  const reviewed = requests.filter((item) => item.status !== "pending").slice(0, 8);

  async function review(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/time-clock/corrections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          reviewNote: notes[id] ?? "",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se ha podido guardar.");
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "No se ha podido guardar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Solicitudes de correccion
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enviadas por empleados desde su enlace personal. Al aprobarlas, el POS las aplicara en el siguiente sync.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${
          pending.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
        }`}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {pending.length === 0 ? (
        <div className="px-5 py-6 text-sm font-semibold text-slate-500">
          No hay solicitudes pendientes.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {pending.map((item) => (
            <article key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr_1.4fr_auto] lg:items-center">
              <div>
                <p className="font-black text-slate-950">{item.employeeName}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {formatDate(item.businessDate)} - {typeLabel(item)}
                </p>
              </div>
              <div className="text-sm font-bold text-slate-800">
                {timeRange(item)}
              </div>
              <div>
                <p className="text-sm text-slate-700">{item.reason}</p>
                <input
                  value={notes[item.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="Nota de revision (opcional)"
                  className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => review(item.id, "rejected")}
                  className="h-10 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => review(item.id, "approved")}
                  className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  Aprobar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="border-t border-[var(--line)] bg-slate-50 px-5 py-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">
            Ultimas revisadas
          </p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {reviewed.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.employeeName}</p>
                    <p className="text-xs font-semibold text-slate-500">{formatDate(item.businessDate)} - {timeRange(item)}</p>
                  </div>
                  <Status status={item.status} />
                </div>
                {item.applyError && <p className="mt-2 text-xs font-semibold text-rose-600">{item.applyError}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Status({ status }: { status: TimeClockCorrectionRequest["status"] }) {
  const styles = status === "applied"
    ? "bg-emerald-100 text-emerald-700"
    : status === "approved"
      ? "bg-blue-100 text-blue-700"
      : status === "failed"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-100 text-slate-600";
  const labels: Record<TimeClockCorrectionRequest["status"], string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    applied: "Aplicada",
    failed: "Error",
  };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${styles}`}>{labels[status]}</span>;
}

function typeLabel(item: TimeClockCorrectionRequest) {
  if (item.requestType === "clock_in") return "Entrada";
  if (item.requestType === "clock_out") return "Salida";
  return "Jornada completa";
}

function timeRange(item: TimeClockCorrectionRequest) {
  const start = item.requestedClockInAt ? formatDashboardTime(item.requestedClockInAt, "es-ES") : null;
  const end = item.requestedClockOutAt ? formatDashboardTime(item.requestedClockOutAt, "es-ES") : null;
  return [start, end].filter(Boolean).join(" - ") || "-";
}

function formatDate(value: string) {
  return formatDashboardDate(value, "es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
