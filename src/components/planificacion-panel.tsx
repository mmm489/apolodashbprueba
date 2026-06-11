"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Euro,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";

import type { Employee, EmployeeScheduleShift, TimeClockSessionRecord } from "@/lib/types";

type EditorState = {
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
  existing: boolean;
};

export function PlanificacionPanel({
  employees,
  initialShifts,
  timeClockSessions,
  weekStart,
  weekEnd,
}: {
  employees: Employee[];
  initialShifts: EmployeeScheduleShift[];
  timeClockSessions: TimeClockSessionRecord[];
  weekStart: string;
  weekEnd: string;
}) {
  const router = useRouter();
  const [shifts, setShifts] = useState(initialShifts);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setShifts(initialShifts);
  }, [initialShifts]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index)),
    [weekStart],
  );
  const shiftMap = useMemo(() => {
    const map = new Map<string, EmployeeScheduleShift>();
    for (const shift of shifts) map.set(shiftKey(shift.employeeId, shift.businessDate), shift);
    return map;
  }, [shifts]);
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const realMinutesByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of timeClockSessions) {
      map.set(session.employeeId, (map.get(session.employeeId) ?? 0) + (session.durationMinutes ?? 0));
    }
    return map;
  }, [timeClockSessions]);

  const stats = useMemo(() => {
    const plannedMinutes = shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
    const realMinutes = timeClockSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
    const plannedCost = shifts.reduce((sum, shift) => {
      const employee = employeeMap.get(shift.employeeId);
      return sum + (shiftMinutes(shift.shiftStart, shift.shiftEnd) / 60) * (employee?.hourlyCost ?? 0);
    }, 0);

    return {
      employees: employees.length,
      shifts: shifts.length,
      plannedMinutes,
      realMinutes,
      plannedCost,
      openSessions: timeClockSessions.filter((session) => session.status === "open").length,
    };
  }, [employeeMap, employees.length, shifts, timeClockSessions]);

  const previousWeek = addDaysIso(weekStart, -7);
  const previousWeekEnd = addDaysIso(weekEnd, -7);
  const nextWeek = addDaysIso(weekStart, 7);

  function openEditor(employee: Employee, businessDate: string) {
    const current = shiftMap.get(shiftKey(employee.id, businessDate));
    setMessage(null);
    setError(null);
    setEditor({
      employeeId: employee.id,
      employeeName: employee.name,
      businessDate,
      shiftStart: current?.shiftStart ?? defaultStart(employee),
      shiftEnd: current?.shiftEnd ?? defaultEnd(employee),
      existing: Boolean(current),
    });
  }

  async function saveShift() {
    if (!editor) return;
    setMessage(null);
    setError(null);

    if (shiftMinutes(editor.shiftStart, editor.shiftEnd) <= 0) {
      setError("La hora fin debe ser posterior a la hora inicio.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se ha podido guardar el turno.");
        return;
      }

      const now = new Date().toISOString();
      const nextShift: EmployeeScheduleShift = {
        id: shiftMap.get(shiftKey(editor.employeeId, editor.businessDate))?.id ?? `${editor.employeeId}-${editor.businessDate}`,
        employeeId: editor.employeeId,
        employeeName: editor.employeeName,
        businessDate: editor.businessDate,
        shiftStart: editor.shiftStart,
        shiftEnd: editor.shiftEnd,
        createdAt: now,
        updatedAt: now,
      };

      setShifts((current) => upsertLocalShift(current, nextShift));
      setEditor(null);
      setMessage("Turno guardado.");
      router.refresh();
    });
  }

  async function deleteShift() {
    if (!editor) return;
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/scheduling", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: editor.employeeId, businessDate: editor.businessDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se ha podido eliminar el turno.");
        return;
      }

      setShifts((current) => current.filter((shift) => shiftKey(shift.employeeId, shift.businessDate) !== shiftKey(editor.employeeId, editor.businessDate)));
      setEditor(null);
      setMessage("Turno eliminado.");
      router.refresh();
    });
  }

  async function copyPreviousWeek() {
    setMessage(null);
    setError(null);
    if (shifts.length > 0 && !confirm("Esta semana ya tiene turnos. ¿Quieres sobrescribir los dias que coincidan?")) {
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/scheduling?from=${previousWeek}&to=${previousWeekEnd}`);
      const previous = await res.json().catch(() => []) as EmployeeScheduleShift[];
      if (!res.ok || !Array.isArray(previous)) {
        setError("No se ha podido cargar la semana anterior.");
        return;
      }
      if (previous.length === 0) {
        setMessage("La semana anterior no tiene turnos para copiar.");
        return;
      }

      const employeeIds = new Set(employees.map((employee) => employee.id));
      const copied = previous
        .filter((shift) => employeeIds.has(shift.employeeId))
        .map((shift) => ({
          employeeId: shift.employeeId,
          businessDate: addDaysIso(shift.businessDate, 7),
          shiftStart: shift.shiftStart,
          shiftEnd: shift.shiftEnd,
        }));

      if (copied.length === 0) {
        setMessage("No hay turnos copiables para empleados activos.");
        return;
      }

      const post = await fetch("/api/scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: copied }),
      });
      const data = await post.json().catch(() => ({}));
      if (!post.ok) {
        setError(data.error || "No se ha podido copiar la semana anterior.");
        return;
      }

      const now = new Date().toISOString();
      const copiedShifts: EmployeeScheduleShift[] = copied.map((shift) => ({
        id: `${shift.employeeId}-${shift.businessDate}`,
        employeeId: shift.employeeId,
        employeeName: employeeMap.get(shift.employeeId)?.name ?? shift.employeeId,
        businessDate: shift.businessDate,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        createdAt: now,
        updatedAt: now,
      }));

      setShifts((current) => {
        let next = current;
        for (const shift of copiedShifts) next = upsertLocalShift(next, shift);
        return next;
      });
      setMessage(`Semana anterior copiada: ${copied.length} turno${copied.length === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Semana planificada</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {formatDate(weekStart)} - {formatDate(weekEnd)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Un turno por empleado y dia. Los fichajes reales solo se muestran para comparar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/planificacion?week=${previousWeek}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Link>
            <Link
              href={`/planificacion?week=${todayIso()}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <CalendarDays className="size-4" />
              Hoy
            </Link>
            <Link
              href={`/planificacion?week=${nextWeek}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Link>
            <button
              type="button"
              onClick={copyPreviousWeek}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              <Copy className="size-4" />
              Copiar semana anterior
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={<Users className="size-5" />} label="Empleados activos" value={fmtNum(stats.employees)} />
        <Metric icon={<CalendarDays className="size-5" />} label="Turnos" value={fmtNum(stats.shifts)} />
        <Metric icon={<Clock className="size-5" />} label="Horas previstas" value={formatDuration(stats.plannedMinutes)} />
        <Metric icon={<Clock className="size-5" />} label="Horas reales" value={formatDuration(stats.realMinutes)} />
        <Metric icon={<Euro className="size-5" />} label="Coste previsto" value={formatMoney(stats.plannedCost)} />
      </section>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-black tracking-tight text-slate-950">Parrilla semanal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Toca una celda para crear o editar el turno. La columna real compara con los fichajes sincronizados.
          </p>
        </div>

        {employees.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-lg font-bold text-slate-950">No hay empleados activos</p>
            <p className="mt-2 text-sm text-slate-500">Crea o activa empleados desde el apartado Empleats.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[220px_repeat(7,minmax(120px,1fr))_130px] border-b border-[var(--line)] bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                <div className="px-4 py-3">Empleado</div>
                {days.map((day) => (
                  <div key={day} className="px-3 py-3 text-center">
                    <div>{formatWeekday(day)}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-400">{formatShortDate(day)}</div>
                  </div>
                ))}
                <div className="px-4 py-3 text-right">Real</div>
              </div>

              <div className="divide-y divide-slate-100">
                {employees.map((employee) => {
                  const planned = days.reduce((sum, day) => {
                    const shift = shiftMap.get(shiftKey(employee.id, day));
                    return sum + (shift ? shiftMinutes(shift.shiftStart, shift.shiftEnd) : 0);
                  }, 0);
                  const real = realMinutesByEmployee.get(employee.id) ?? 0;
                  const diff = real - planned;

                  return (
                    <div
                      key={employee.id}
                      className="grid grid-cols-[220px_repeat(7,minmax(120px,1fr))_130px] items-stretch"
                    >
                      <div className="flex flex-col justify-center px-4 py-3">
                        <p className="truncate text-sm font-black text-slate-950">{employee.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {formatDuration(planned)} previstos
                        </p>
                      </div>

                      {days.map((day) => {
                        const shift = shiftMap.get(shiftKey(employee.id, day));
                        return (
                          <button
                            key={`${employee.id}-${day}`}
                            type="button"
                            onClick={() => openEditor(employee, day)}
                            className={`m-1 min-h-[76px] rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                              shift
                                ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                                : "border-dashed border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                            }`}
                          >
                            {shift ? (
                              <>
                                <p className="text-sm font-black tabular-nums">
                                  {shift.shiftStart} - {shift.shiftEnd}
                                </p>
                                <p className="mt-2 text-xs font-bold text-indigo-500">
                                  {formatDuration(shiftMinutes(shift.shiftStart, shift.shiftEnd))}
                                </p>
                              </>
                            ) : (
                              <span className="flex h-full items-center justify-center text-xs font-bold">
                                + Turno
                              </span>
                            )}
                          </button>
                        );
                      })}

                      <div className="flex flex-col justify-center px-4 py-3 text-right">
                        <p className="text-sm font-black text-slate-950">{formatDuration(real)}</p>
                        <p className={`mt-1 text-xs font-bold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {diff === 0 ? "Sin diferencia" : `${diff > 0 ? "+" : "-"}${formatDuration(Math.abs(diff))}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {stats.openSessions > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
          Hay {stats.openSessions} fichaje{stats.openSessions === 1 ? "" : "s"} abierto{stats.openSessions === 1 ? "" : "s"}.
          Las horas reales pueden cambiar hasta fichar salida.
        </section>
      )}

      {editor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Editar turno</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">{editor.employeeName}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{formatFullDate(editor.businessDate)}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hora inicio</span>
                <input
                  type="time"
                  value={editor.shiftStart}
                  onChange={(event) => setEditor((current) => current ? { ...current, shiftStart: event.target.value } : current)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-black tabular-nums text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hora fin</span>
                <input
                  type="time"
                  value={editor.shiftEnd}
                  onChange={(event) => setEditor((current) => current ? { ...current, shiftEnd: event.target.value } : current)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-black tabular-nums text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                />
              </label>

              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total turno</p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {formatDuration(Math.max(0, shiftMinutes(editor.shiftStart, editor.shiftEnd)))}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-slate-50 px-5 py-4 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={deleteShift}
                disabled={isPending || !editor.existing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="size-4" />
                Eliminar
              </button>
              <button
                type="button"
                onClick={saveShift}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="size-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          {icon}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function upsertLocalShift(items: EmployeeScheduleShift[], nextShift: EmployeeScheduleShift) {
  const key = shiftKey(nextShift.employeeId, nextShift.businessDate);
  const map = new Map(items.map((item) => [shiftKey(item.employeeId, item.businessDate), item]));
  map.set(key, nextShift);
  return [...map.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.employeeName.localeCompare(b.employeeName, "ca"));
}

function shiftKey(employeeId: string, businessDate: string) {
  return `${employeeId}|${businessDate}`;
}

function defaultStart(employee: Employee) {
  return employee.shiftStart && employee.shiftStart !== "00:00" ? employee.shiftStart : "10:00";
}

function defaultEnd(employee: Employee) {
  return employee.shiftEnd && employee.shiftEnd !== "00:00" ? employee.shiftEnd : "18:00";
}

function shiftMinutes(start: string, end: string) {
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return 0;
  return endMinutes - startMinutes;
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function todayIso() {
  return isoDate(new Date());
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T12:00:00`));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("ca-ES", { weekday: "short" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}
