import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listEmployeeScheduleShifts, listTimeClockSessions } from "@/lib/repositories";
import { formatDashboardDate, formatDashboardTime } from "@/lib/timezone";
import type { EmployeeScheduleShift, TimeClockSessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ControlHorarioPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveDateFilter({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });
  const [sessions, plannedShifts] = await Promise.all([
    listTimeClockSessions(filter.from, filter.to),
    listEmployeeScheduleShifts(filter.from, filter.to),
  ]);
  const plannedByEmployee = buildPlannedByEmployee(plannedShifts);
  const stats = buildStats(sessions, plannedShifts);
  const byEmployee = groupByEmployee(sessions, plannedByEmployee);
  const exportParams = new URLSearchParams({
    from: filter.from,
    to: filter.to,
  });

  return (
    <AppFrame
      title="Control horario"
      description="Fichajes sincronizados desde el POS principal, sin cambiar el empleado de caja."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Jornadas" value={fmtNum(stats.sessions)} color="indigo" />
        <Metric label="Trabajando ahora" value={fmtNum(stats.open)} color="emerald" />
        <Metric label="Horas periodo" value={formatDuration(stats.totalMinutes)} color="amber" />
        <Metric label="Horas previstas" value={formatDuration(stats.plannedMinutes)} color="indigo" />
        <Metric label="Diferencia" value={formatSignedDuration(stats.totalMinutes - stats.plannedMinutes)} color={stats.totalMinutes >= stats.plannedMinutes ? "emerald" : "rose"} />
        <Metric label="Empleados" value={fmtNum(byEmployee.length)} color="slate" />
        <Metric label="Incidencias" value={fmtNum(stats.incidents)} color={stats.incidents ? "rose" : "emerald"} />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Exportacion para gestoria</h2>
            <p className="mt-1 text-sm text-slate-500">
              Exporta el periodo filtrado. El dato se conserva en cloud al sincronizar desde el POS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/time-clock/export?${exportParams.toString()}&format=csv`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Descargar CSV
            </a>
            <a
              href={`/api/time-clock/export?${exportParams.toString()}&format=xlsx`}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              Descargar XLSX
            </a>
          </div>
        </div>
      </section>

      {sessions.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">No hay fichajes en este periodo</p>
          <p className="mt-2 text-sm text-slate-500">
            Cuando el POS sincronice entradas y salidas, apareceran aqui.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            {byEmployee.map((employee) => (
              <div key={employee.employeeId} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">{employee.employeeName}</h3>
                    <p className="text-sm font-semibold text-slate-500">
                      {employee.sessions} jornada{employee.sessions === 1 ? "" : "s"} · previsto {formatDuration(employee.plannedMinutes)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black tabular-nums text-slate-950">
                      {formatDuration(employee.minutes)}
                    </p>
                    <p className={`mt-1 text-xs font-bold uppercase tracking-wide ${employee.minutes >= employee.plannedMinutes ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatSignedDuration(employee.minutes - employee.plannedMinutes)}
                    </p>
                    {employee.open > 0 && (
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-600">
                        {employee.open} abierta{employee.open === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-950">Detalle de fichajes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Una linea por jornada. Las jornadas abiertas quedan marcadas como incidencia.
              </p>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[var(--line)] bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <div>Empleado</div>
                  <div>Dia laboral</div>
                  <div>Entrada</div>
                  <div>Salida</div>
                  <div>Horas</div>
                  <div>Estado</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-4 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{session.employeeName}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {session.deviceName || session.source}
                        </p>
                      </div>
                      <div className="font-bold text-slate-900">{formatDate(session.businessDate)}</div>
                      <div className="font-bold tabular-nums text-slate-900">{formatTime(session.clockInAt)}</div>
                      <div className="font-bold tabular-nums text-slate-900">
                        {session.clockOutAt ? formatTime(session.clockOutAt) : "-"}
                      </div>
                      <div className="font-black tabular-nums text-slate-950">
                        {session.durationMinutes == null ? "-" : formatDuration(session.durationMinutes)}
                      </div>
                      <div>
                        <StatusBadge session={session} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </AppFrame>
  );
}

function buildStats(sessions: TimeClockSessionRecord[], plannedShifts: EmployeeScheduleShift[]) {
  const open = sessions.filter((session) => session.status === "open").length;
  const longOpen = sessions.filter((session) => (session.durationMinutes ?? 0) > 12 * 60).length;
  return {
    sessions: sessions.length,
    open,
    totalMinutes: sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
    plannedMinutes: plannedShifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0),
    incidents: open + longOpen,
  };
}

function groupByEmployee(sessions: TimeClockSessionRecord[], plannedByEmployee: Map<string, { employeeName: string; minutes: number }>) {
  const byEmployee = new Map<string, { employeeId: string; employeeName: string; sessions: number; minutes: number; plannedMinutes: number; open: number }>();
  for (const session of sessions) {
    const planned = plannedByEmployee.get(session.employeeId);
    const row = byEmployee.get(session.employeeId) ?? {
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      sessions: 0,
      minutes: 0,
      plannedMinutes: planned?.minutes ?? 0,
      open: 0,
    };
    row.sessions += 1;
    row.minutes += session.durationMinutes ?? 0;
    if (session.status === "open") row.open += 1;
    byEmployee.set(session.employeeId, row);
  }
  for (const [employeeId, planned] of plannedByEmployee) {
    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, {
        employeeId,
        employeeName: planned.employeeName,
        sessions: 0,
        minutes: 0,
        plannedMinutes: planned.minutes,
        open: 0,
      });
    }
  }
  return [...byEmployee.values()].sort((a, b) => b.minutes - a.minutes);
}

function buildPlannedByEmployee(shifts: EmployeeScheduleShift[]) {
  const map = new Map<string, { employeeName: string; minutes: number }>();
  for (const shift of shifts) {
    const current = map.get(shift.employeeId) ?? { employeeName: shift.employeeName, minutes: 0 };
    current.minutes += shiftMinutes(shift.shiftStart, shift.shiftEnd);
    map.set(shift.employeeId, current);
  }
  return map;
}

const metricColors: Record<string, string> = {
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  indigo: "border-l-indigo-500",
  slate: "border-l-slate-400",
  rose: "border-l-rose-500",
};

function Metric({ label, value, color = "indigo" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${metricColors[color] ?? metricColors.indigo} bg-white p-4 shadow-sm transition hover:shadow-md`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ session }: { session: TimeClockSessionRecord }) {
  const longOpen = (session.durationMinutes ?? 0) > 12 * 60;
  if (session.status === "open") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
        Abierta
      </span>
    );
  }
  if (longOpen) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-700">
        Revisar
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
      Cerrada
    </span>
  );
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function formatSignedDuration(minutes: number) {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(minutes))}`;
}

function shiftMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

function formatTime(value: string) {
  return formatDashboardTime(value, "es-ES");
}

function formatDate(value: string) {
  return formatDashboardDate(value, "es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
