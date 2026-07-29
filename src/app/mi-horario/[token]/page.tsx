import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { getEmployeeScheduleByToken } from "@/lib/repositories";
import { formatDashboardDate } from "@/lib/timezone";
import type { EmployeeScheduleShift } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "El meu horari",
  description: "Consulta privada d'horari per empleats de Hi Cream.",
  robots: { index: false, follow: false },
};

export default async function EmployeeSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const weekStart = startOfMondayWeek(parseDate(firstValue(query?.week)) ?? new Date());
  const weekEnd = addDays(weekStart, 6);
  const from = formatIsoDate(weekStart);
  const to = formatIsoDate(weekEnd);
  const data = await getEmployeeScheduleByToken(token, from, to);

  if (!data) notFound();

  const operationalGroups = groupShiftsByDay(data.operationalShifts);
  const contractualGroups = groupShiftsByDay(data.contractualShifts);
  const days = Array.from({ length: 7 }, (_, index) => formatIsoDate(addDays(weekStart, index)));
  const operationalMinutes = totalShiftMinutes(data.operationalShifts);
  const contractualMinutes = totalShiftMinutes(data.contractualShifts);
  const overtimeMinutes = calculateOvertimeMinutes(data.operationalShifts, data.contractualShifts);
  const ordinaryMinutes = Math.max(0, operationalMinutes - overtimeMinutes);
  const previousWeek = formatIsoDate(addDays(weekStart, -7));
  const nextWeek = formatIsoDate(addDays(weekStart, 7));

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-5 text-slate-950 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <section className="rounded-3xl border border-[#dacfbf] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-black text-emerald-700">
              HC
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Hi Cream</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">{data.employee.name}</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Horari del {formatDate(from)} al {formatDate(to)}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <ScheduleMetric
            icon={<CalendarDays className="size-5" />}
            label="Torns operatius"
            value={String(data.operationalShifts.length)}
            color="blue"
          />
          <ScheduleMetric
            icon={<Clock className="size-5" />}
            label="Operatiu"
            value={formatDuration(operationalMinutes)}
            color="emerald"
          />
          <ScheduleMetric
            icon={<Clock className="size-5" />}
            label="Ordinari"
            value={formatDuration(ordinaryMinutes)}
            color="slate"
          />
          <ScheduleMetric
            icon={<Clock className="size-5" />}
            label="Extra"
            value={formatDuration(overtimeMinutes)}
            color="amber"
          />
        </section>

        {!data.isPublished ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Horari pendent</p>
            <h2 className="mt-2 text-2xl font-black text-amber-950">Aquesta setmana encara no esta publicada</h2>
            <p className="mt-2 text-sm font-bold text-amber-800">
              L'encarregat esta preparant els torns. Torna a consultar aquest enllac quan t'avisin.
            </p>
          </section>
        ) : (
          <>
            <ScheduleSection
              days={days}
              groups={operationalGroups}
              title="Horari operatiu"
              description="Aquest es l'horari real previst que has de seguir."
              accent="emerald"
            />
            <ScheduleSection
              days={days}
              groups={contractualGroups}
              restDays={data.restDays}
              title="Horari contractual"
              description={`Distribucio de les hores contractades: ${formatDuration(contractualMinutes)} aquesta setmana.`}
              accent="blue"
            />
            {data.contractualShifts.length === 0 ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="font-black text-amber-900">Horari contractual pendent</p>
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  Les hores operatives es mostren amb normalitat, pero encara no hi ha distribucio contractual per aquesta setmana.
                </p>
              </section>
            ) : null}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/mi-horario/${token}?week=${previousWeek}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dacfbf] bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Link>
          <Link
            href={`/mi-horario/${token}?week=${nextWeek}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dacfbf] bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"
          >
            Seguent
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <p className="pb-4 text-center text-xs font-semibold text-slate-400">
          Si veus algun error, parla amb l'encarregat abans del torn.
        </p>
      </div>
    </main>
  );
}

function ScheduleMetric({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "emerald" | "slate" | "amber";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-[#dacfbf] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex size-10 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-black">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ScheduleSection({
  days,
  groups,
  restDays = [],
  title,
  description,
  accent,
}: {
  days: string[];
  groups: Map<string, EmployeeScheduleShift[]>;
  restDays?: string[];
  title: string;
  description: string;
  accent: "emerald" | "blue";
}) {
  const color =
    accent === "emerald"
      ? { surface: "bg-emerald-50", text: "text-emerald-800", muted: "text-emerald-600" }
      : { surface: "bg-blue-50", text: "text-blue-800", muted: "text-blue-600" };

  return (
    <section className="overflow-hidden rounded-3xl border border-[#dacfbf] bg-white shadow-sm">
      <div className="border-b border-[#e5dccf] px-5 py-4">
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
      </div>
      <div className="divide-y divide-[#eee6dc]">
        {days.map((day) => {
          const shifts = groups.get(day) ?? [];
          const isRestDay = restDays.includes(day);
          return (
            <div key={day} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-base font-black capitalize">{formatWeekday(day)}</p>
                <p className="mt-1 text-sm font-bold text-slate-400">{formatDate(day)}</p>
              </div>
              {isRestDay ? (
                <div className="rounded-xl bg-amber-100 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-amber-800">
                  Dia de descans
                </div>
              ) : shifts.length > 0 ? (
                <div className="flex flex-col gap-2 text-right">
                  {shifts.map((shift) => (
                    <div key={shift.id} className={`rounded-2xl px-4 py-3 ${color.surface}`}>
                      <p className={`text-lg font-black tabular-nums ${color.text}`}>
                        {shift.shiftStart} - {shift.shiftEnd}
                      </p>
                      <p className={`mt-1 text-xs font-black ${color.muted}`}>
                        {formatDuration(shiftMinutes(shift.shiftStart, shift.shiftEnd))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-400">
                  Lliure
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function groupShiftsByDay(shifts: EmployeeScheduleShift[]) {
  const groups = new Map<string, EmployeeScheduleShift[]>();
  for (const shift of shifts) {
    const group = groups.get(shift.businessDate) ?? [];
    group.push(shift);
    groups.set(shift.businessDate, group);
  }
  return groups;
}

function totalShiftMinutes(shifts: EmployeeScheduleShift[]) {
  return shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMondayWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftMinutes(start: string, end: string) {
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes == null || endMinutes == null) return 0;
  return (endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes) - startMinutes;
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function calculateOvertimeMinutes(
  operational: EmployeeScheduleShift[],
  contractual: EmployeeScheduleShift[],
) {
  if (contractual.length === 0) return 0;
  const contractualIntervals = contractual
    .map(toAbsoluteMinuteInterval)
    .filter((interval): interval is [number, number] => interval != null);

  return operational.reduce((total, shift) => {
    const interval = toAbsoluteMinuteInterval(shift);
    if (!interval) return total;
    const [start, end] = interval;
    const covered = mergeIntervals(
      contractualIntervals
        .map(([contractStart, contractEnd]) => [
          Math.max(start, contractStart),
          Math.min(end, contractEnd),
        ] as [number, number])
        .filter(([overlapStart, overlapEnd]) => overlapEnd > overlapStart),
    ).reduce((sum, [overlapStart, overlapEnd]) => sum + overlapEnd - overlapStart, 0);
    return total + end - start - covered;
  }, 0);
}

function toAbsoluteMinuteInterval(shift: EmployeeScheduleShift): [number, number] | null {
  const startMinutes = parseTime(shift.shiftStart);
  const endMinutes = parseTime(shift.shiftEnd);
  if (startMinutes == null || endMinutes == null) return null;
  const dayStart = Date.parse(`${shift.businessDate}T00:00:00Z`) / 60000;
  return [
    dayStart + startMinutes,
    dayStart + (endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes),
  ];
}

function mergeIntervals(intervals: Array<[number, number]>) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) {
      merged.push([...interval]);
    } else {
      last[1] = Math.max(last[1], interval[1]);
    }
  }
  return merged;
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function formatDate(value: string) {
  return formatDashboardDate(value, "ca-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatWeekday(value: string) {
  return formatDashboardDate(value, "ca-ES", { weekday: "long" });
}
