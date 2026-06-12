import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { getEmployeeScheduleByToken } from "@/lib/repositories";

export const dynamic = "force-dynamic";

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

  const shiftMap = new Map(data.shifts.map((shift) => [shift.businessDate, shift]));
  const days = Array.from({ length: 7 }, (_, index) => formatIsoDate(addDays(weekStart, index)));
  const plannedMinutes = data.shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
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

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#dacfbf] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Torns</p>
                <p className="mt-1 text-xl font-black">{data.shifts.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#dacfbf] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Total setmana</p>
                <p className="mt-1 text-xl font-black">{formatDuration(plannedMinutes)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-[#dacfbf] bg-white shadow-sm">
          <div className="border-b border-[#e5dccf] px-5 py-4">
            <h2 className="text-xl font-black">Setmana</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Consulta sempre l'horari actualitzat des d'aquest enllaç.
            </p>
          </div>
          <div className="divide-y divide-[#eee6dc]">
            {days.map((day) => {
              const shift = shiftMap.get(day);
              return (
                <div key={day} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="text-base font-black capitalize">{formatWeekday(day)}</p>
                    <p className="mt-1 text-sm font-bold text-slate-400">{formatDate(day)}</p>
                  </div>
                  {shift ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right">
                      <p className="text-lg font-black tabular-nums text-emerald-800">
                        {shift.shiftStart} - {shift.shiftEnd}
                      </p>
                      <p className="mt-1 text-xs font-black text-emerald-500">
                        {formatDuration(shiftMinutes(shift.shiftStart, shift.shiftEnd))}
                      </p>
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

        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/horario/${token}?week=${previousWeek}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dacfbf] bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Link>
          <Link
            href={`/horario/${token}?week=${nextWeek}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dacfbf] bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"
          >
            Següent
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

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ca-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("ca-ES", { weekday: "long" }).format(new Date(`${value}T12:00:00`));
}
