import { AppFrame } from "@/components/app-frame";
import { PlanificacionPanel } from "@/components/planificacion-panel";
import {
  ensureEmployeeScheduleLinks,
  listEmployees,
  listEmployeeScheduleShifts,
  listTimeClockSessions,
} from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const weekStart = startOfMondayWeek(parseDate(firstValue(params?.week)) ?? new Date());
  const weekEnd = addDays(weekStart, 6);
  const from = formatIsoDate(weekStart);
  const to = formatIsoDate(weekEnd);

  const [employees, shifts, timeClockSessions] = await Promise.all([
    listEmployees(),
    listEmployeeScheduleShifts(from, to),
    listTimeClockSessions(from, to),
  ]);
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const scheduleShares = await ensureEmployeeScheduleLinks(activeEmployees.map((employee) => employee.id));

  return (
    <AppFrame
      title="Planificació"
      description="Planifica els torns setmanals i compara les hores previstes amb els fitxatges reals del POS."
    >
      <PlanificacionPanel
        employees={activeEmployees}
        initialShifts={shifts}
        scheduleShares={scheduleShares}
        timeClockSessions={timeClockSessions}
        weekStart={from}
        weekEnd={to}
      />
    </AppFrame>
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
