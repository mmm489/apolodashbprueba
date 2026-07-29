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
  Eye,
  EyeOff,
  Link2,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { formatDashboardDate } from "@/lib/timezone";
import type { Employee, EmployeeHourlyCostHistoryEntry, EmployeeScheduleKind, EmployeeScheduleShare, EmployeeScheduleShift, EmployeeScheduleWeekPublication, EmployeeScheduleWeekSetting, TimeClockSessionRecord } from "@/lib/types";

const DEFAULT_HORARI_PUBLIC_BASE_URL = "https://horari-brown.vercel.app";
const HORARI_PUBLIC_BASE_URL = (process.env.NEXT_PUBLIC_HORARI_BASE_URL || DEFAULT_HORARI_PUBLIC_BASE_URL).replace(/\/+$/, "");

type EditorState = {
  id?: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
  scheduleKind: EmployeeScheduleKind;
  existing: boolean;
};

export function PlanificacionPanel({
  employees,
  initialShifts,
  scheduleShares,
  timeClockSessions,
  employeeCostHistory,
  weekPublication,
  initialWeekSettings,
  weekStart,
  weekEnd,
}: {
  employees: Employee[];
  initialShifts: EmployeeScheduleShift[];
  scheduleShares: EmployeeScheduleShare[];
  timeClockSessions: TimeClockSessionRecord[];
  employeeCostHistory: EmployeeHourlyCostHistoryEntry[];
  weekPublication: EmployeeScheduleWeekPublication;
  initialWeekSettings: EmployeeScheduleWeekSetting[];
  weekStart: string;
  weekEnd: string;
}) {
  const router = useRouter();
  const [shifts, setShifts] = useState(initialShifts);
  const [activeKind, setActiveKind] = useState<EmployeeScheduleKind>("operational");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWeekVisible, setIsWeekVisible] = useState(weekPublication.isVisible);
  const [restDates, setRestDates] = useState<Record<string, string>>(
    Object.fromEntries(initialWeekSettings.map((setting) => [setting.employeeId, setting.restDate])),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setShifts(initialShifts);
  }, [initialShifts]);
  useEffect(() => {
    setIsWeekVisible(weekPublication.isVisible);
  }, [weekPublication.isVisible, weekStart]);
  useEffect(() => {
    setRestDates(Object.fromEntries(initialWeekSettings.map((setting) => [setting.employeeId, setting.restDate])));
  }, [initialWeekSettings, weekStart]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index)),
    [weekStart],
  );
  const visibleShifts = useMemo(
    () => shifts.filter((shift) => shift.scheduleKind === activeKind),
    [activeKind, shifts],
  );
  const shiftGroups = useMemo(() => {
    const map = new Map<string, EmployeeScheduleShift[]>();
    for (const shift of visibleShifts) {
      const key = shiftKey(shift.employeeId, shift.businessDate);
      const group = map.get(key) ?? [];
      group.push(shift);
      map.set(key, group);
    }
    for (const group of map.values()) {
      group.sort((a, b) => a.shiftStart.localeCompare(b.shiftStart) || a.shiftEnd.localeCompare(b.shiftEnd));
    }
    return map;
  }, [visibleShifts]);
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const costHistoryByEmployee = useMemo(() => buildCostHistoryByEmployee(employeeCostHistory), [employeeCostHistory]);
  const shareMap = useMemo(
    () => new Map(scheduleShares.map((share) => [share.employeeId, share])),
    [scheduleShares],
  );
  const realMinutesByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of timeClockSessions) {
      map.set(session.employeeId, (map.get(session.employeeId) ?? 0) + (session.durationMinutes ?? 0));
    }
    return map;
  }, [timeClockSessions]);

  const stats = useMemo(() => {
    const operationalShifts = shifts.filter((shift) => shift.scheduleKind === "operational");
    const contractualShifts = shifts.filter((shift) => shift.scheduleKind === "contractual");
    const operationalMinutes = operationalShifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
    const contractualMinutes = contractualShifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
    const targetMinutes = employees.reduce((sum, employee) => sum + Math.round((employee.weeklyHours ?? 0) * 60), 0);
    const realMinutes = timeClockSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
    let overtimeMinutes = 0;
    let plannedCost = 0;
    let missingOvertimeRates = 0;
    for (const shift of operationalShifts) {
      const employee = employeeMap.get(shift.employeeId);
      const profile = resolveEmployeeCostForDate(costHistoryByEmployee, shift.employeeId, shift.businessDate, {
        hourlyCost: employee?.hourlyCost ?? 0,
        overtimeHourlyCost: employee?.overtimeHourlyCost ?? null,
      });
      const employeeContractual = contractualShifts.filter((item) =>
        item.employeeId === shift.employeeId
      );
      const hasContractualWeek = contractualShifts.some((item) =>
        item.employeeId === shift.employeeId && sameMondayWeek(item.businessDate, shift.businessDate)
      );
      const split = hasContractualWeek
        ? splitShiftMinutes(shift, employeeContractual)
        : { regularMinutes: shiftMinutes(shift.shiftStart, shift.shiftEnd), overtimeMinutes: 0 };
      overtimeMinutes += split.overtimeMinutes;
      plannedCost += (split.regularMinutes / 60) * profile.hourlyCost;
      plannedCost += (split.overtimeMinutes / 60) * (profile.overtimeHourlyCost ?? profile.hourlyCost);
      if (split.overtimeMinutes > 0 && profile.overtimeHourlyCost == null) missingOvertimeRates += 1;
    }
    const missingCosts = operationalShifts.filter((shift) => {
      const employee = employeeMap.get(shift.employeeId);
      return resolveEmployeeCostForDate(costHistoryByEmployee, shift.employeeId, shift.businessDate, {
        hourlyCost: employee?.hourlyCost ?? 0,
        overtimeHourlyCost: employee?.overtimeHourlyCost ?? null,
      }).hourlyCost <= 0;
    }).length;
    const employeesWithoutContract = employees.filter((employee) =>
      operationalShifts.some((shift) => shift.employeeId === employee.id) &&
      !contractualShifts.some((shift) => shift.employeeId === employee.id)
    ).length;

    return {
      employees: employees.length,
      operationalShifts: operationalShifts.length,
      contractualShifts: contractualShifts.length,
      operationalMinutes,
      contractualMinutes,
      overtimeMinutes,
      targetMinutes,
      realMinutes,
      plannedCost,
      missingCosts,
      missingOvertimeRates,
      employeesWithoutContract,
      openSessions: timeClockSessions.filter((session) => session.status === "open").length,
    };
  }, [costHistoryByEmployee, employeeMap, employees, shifts, timeClockSessions]);

  const previousWeek = addDaysIso(weekStart, -7);
  const previousWeekEnd = addDaysIso(weekEnd, -7);
  const nextWeek = addDaysIso(weekStart, 7);

  function openEditor(employee: Employee, businessDate: string, shift?: EmployeeScheduleShift) {
    setMessage(null);
    setError(null);
    setEditor({
      id: shift?.id,
      employeeId: employee.id,
      employeeName: employee.name,
      businessDate,
      shiftStart: shift?.shiftStart ?? defaultStart(employee),
      shiftEnd: shift?.shiftEnd ?? defaultEnd(employee),
      scheduleKind: shift?.scheduleKind ?? activeKind,
      existing: Boolean(shift),
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
      const savedShift = Array.isArray(data.shifts) ? data.shifts[0] as EmployeeScheduleShift | undefined : undefined;
      const nextShift: EmployeeScheduleShift = {
        id: savedShift?.id ?? editor.id ?? `${editor.employeeId}-${editor.businessDate}-${editor.shiftStart}-${editor.shiftEnd}`,
        employeeId: editor.employeeId,
        employeeName: editor.employeeName,
        businessDate: editor.businessDate,
        shiftStart: editor.shiftStart,
        shiftEnd: editor.shiftEnd,
        scheduleKind: editor.scheduleKind,
        createdAt: now,
        updatedAt: now,
      };

      setShifts((current) => upsertLocalShift(current, nextShift));
      let generatedMessage = "";
      const restDate = restDates[editor.employeeId];
      if (editor.scheduleKind === "operational" && restDate) {
        try {
          const generation = await requestContractualGeneration(editor.employeeId, restDate);
          generatedMessage = generation.summary.missingMinutes > 0
            ? ` Contractual actualizado; faltan ${formatDuration(generation.summary.missingMinutes)} porque no hay suficientes horas operativas.`
            : " Contractual actualizado automaticamente.";
        } catch (generationError) {
          generatedMessage = ` El turno se guardo, pero no se pudo actualizar el contractual: ${
            generationError instanceof Error ? generationError.message : "error desconocido"
          }.`;
        }
      }
      setEditor(null);
      setMessage(`Turno guardado.${generatedMessage}`);
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
        body: JSON.stringify({
          id: editor.id,
          employeeId: editor.employeeId,
          businessDate: editor.businessDate,
          scheduleKind: editor.scheduleKind,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se ha podido eliminar el turno.");
        return;
      }

      setShifts((current) => editor.id
        ? current.filter((shift) => shift.id !== editor.id)
        : current.filter((shift) =>
          shift.scheduleKind !== editor.scheduleKind ||
          shiftKey(shift.employeeId, shift.businessDate) !== shiftKey(editor.employeeId, editor.businessDate)
        ));
      let generatedMessage = "";
      const restDate = restDates[editor.employeeId];
      if (editor.scheduleKind === "operational" && restDate) {
        try {
          const generation = await requestContractualGeneration(editor.employeeId, restDate);
          generatedMessage = generation.summary.missingMinutes > 0
            ? ` Contractual actualizado; faltan ${formatDuration(generation.summary.missingMinutes)}.`
            : " Contractual actualizado automaticamente.";
        } catch (generationError) {
          generatedMessage = ` Revisa el contractual: ${
            generationError instanceof Error ? generationError.message : "no se pudo regenerar"
          }.`;
        }
      }
      setEditor(null);
      setMessage(`Turno eliminado.${generatedMessage}`);
      router.refresh();
    });
  }

  async function requestContractualGeneration(employeeId: string, restDate: string) {
    const response = await fetch("/api/scheduling/contractual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, weekStart, restDate }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "No se ha podido generar el horario contractual.");
    }
    const contractual = Array.isArray(data.shifts) ? data.shifts as EmployeeScheduleShift[] : [];
    setShifts((current) => [
      ...current.filter((shift) =>
        shift.scheduleKind !== "contractual"
        || shift.employeeId !== employeeId
        || shift.businessDate < weekStart
        || shift.businessDate > weekEnd
      ),
      ...contractual,
    ].sort((a, b) =>
      a.businessDate.localeCompare(b.businessDate)
      || a.employeeName.localeCompare(b.employeeName, "ca")
      || a.shiftStart.localeCompare(b.shiftStart)
    ));
    setRestDates((current) => ({ ...current, [employeeId]: restDate }));
    return data as {
      summary: {
        targetMinutes: number;
        contractualMinutes: number;
        missingMinutes: number;
        restDayOperationalMinutes: number;
      };
    };
  }

  function saveRestDay(employee: Employee) {
    const restDate = restDates[employee.id];
    setMessage(null);
    setError(null);
    if (!restDate) {
      setError(`Selecciona el dia de descanso de ${employee.name}.`);
      return;
    }
    startTransition(async () => {
      try {
        const generation = await requestContractualGeneration(employee.id, restDate);
        const extra = generation.summary.restDayOperationalMinutes > 0
          ? ` Ese dia mantiene ${formatDuration(generation.summary.restDayOperationalMinutes)} operativas como horas fuera del contractual.`
          : "";
        setMessage(generation.summary.missingMinutes > 0
          ? `Contractual de ${employee.name} creado con ${formatDuration(generation.summary.contractualMinutes)}. Faltan ${formatDuration(generation.summary.missingMinutes)} por repartir.${extra}`
          : `Contractual de ${employee.name} creado: ${formatDuration(generation.summary.contractualMinutes)} y ${formatFullDate(restDate)} de descanso.${extra}`);
        router.refresh();
      } catch (generationError) {
        setError(generationError instanceof Error ? generationError.message : "No se ha podido crear el contractual.");
      }
    });
  }

  async function copyPreviousWeek() {
    setMessage(null);
    setError(null);
    if (visibleShifts.length > 0 && !confirm("Esta semana ya tiene turnos. ¿Quieres sobrescribir los dias que coincidan?")) {
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/scheduling?from=${previousWeek}&to=${previousWeekEnd}&kind=${activeKind}`);
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
          scheduleKind: activeKind,
        }));

      if (copied.length === 0) {
        setMessage("No hay turnos copiables para empleados activos.");
        return;
      }

      const post = await fetch("/api/scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: copied, replaceExisting: true }),
      });
      const data = await post.json().catch(() => ({}));
      if (!post.ok) {
        setError(data.error || "No se ha podido copiar la semana anterior.");
        return;
      }

      const savedShifts = Array.isArray(data.shifts) ? data.shifts as EmployeeScheduleShift[] : [];
      setShifts((current) => replaceLocalShiftsForDays(current, savedShifts.length ? savedShifts : copied.map((shift, index) => ({
        id: `${shift.employeeId}-${shift.businessDate}-${shift.shiftStart}-${index}`,
        employeeId: shift.employeeId,
        employeeName: employeeMap.get(shift.employeeId)?.name ?? shift.employeeId,
        businessDate: shift.businessDate,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        scheduleKind: activeKind,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))));
      setMessage(`Semana anterior copiada al horario ${activeKind === "operational" ? "operativo" : "contractual"}: ${copied.length} turno${copied.length === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  async function clearCurrentWeek() {
    setMessage(null);
    setError(null);

    if (visibleShifts.length === 0) {
      setMessage("Esta semana no tiene turnos para limpiar.");
      return;
    }

    const confirmed = confirm(
      `Vas a borrar ${visibleShifts.length} turno${visibleShifts.length === 1 ? "" : "s"} del horario ${activeKind === "operational" ? "operativo" : "contractual"}. Esta accion no se puede deshacer.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await fetch("/api/scheduling", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: weekStart, to: weekEnd, scheduleKind: activeKind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se ha podido limpiar la semana.");
        return;
      }

      const deleted = typeof data.deleted === "number" ? data.deleted : visibleShifts.length;
      setShifts((current) => current.filter((shift) =>
        shift.scheduleKind !== activeKind || shift.businessDate < weekStart || shift.businessDate > weekEnd
      ));
      setMessage(`Horario ${activeKind === "operational" ? "operativo" : "contractual"} limpiado: ${deleted} turno${deleted === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  async function copyContractualToOperational() {
    setMessage(null);
    setError(null);
    const contractual = shifts.filter((shift) => shift.scheduleKind === "contractual");
    if (contractual.length === 0) {
      setError("Primero debes crear el horario contractual de esta semana.");
      return;
    }
    const operational = shifts.filter((shift) => shift.scheduleKind === "operational");
    if (operational.length > 0 && !confirm("El horario operativo actual se sustituira por una copia del contractual. ¿Continuar?")) {
      return;
    }

    startTransition(async () => {
      const items = contractual.map((shift) => ({
        employeeId: shift.employeeId,
        businessDate: shift.businessDate,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        scheduleKind: "operational" as const,
      }));
      const response = await fetch("/api/scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, replaceExisting: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "No se ha podido copiar el horario contractual.");
        return;
      }

      const copiedPairs = new Set(
        contractual.map((shift) => `${shift.employeeId}|${shift.businessDate}`),
      );
      const obsoleteOperational = operational.filter(
        (shift) => !copiedPairs.has(`${shift.employeeId}|${shift.businessDate}`),
      );
      const deleteResults = await Promise.all(obsoleteOperational.map((shift) => fetch("/api/scheduling", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shift.id, scheduleKind: "operational" }),
      })));
      if (deleteResults.some((result) => !result.ok)) {
        setError("El horario se ha copiado, pero no se han podido retirar todos los turnos operativos anteriores. Revisa la semana antes de publicarla.");
        router.refresh();
        return;
      }

      const saved = Array.isArray(data.shifts) ? data.shifts as EmployeeScheduleShift[] : [];
      setShifts((current) => [
        ...current.filter((shift) => shift.scheduleKind !== "operational"),
        ...saved,
      ]);
      setActiveKind("operational");
      setMessage("Horario contractual copiado al operativo. Ya puedes añadir las horas extra.");
      router.refresh();
    });
  }

  async function toggleWeekVisibility() {
    const nextVisible = !isWeekVisible;
    setMessage(null);
    setError(null);

    const confirmMessage = nextVisible
      ? "Vas a mostrar esta semana a los empleados. Veran los turnos desde su enlace. Continuar?"
      : "Vas a ocultar esta semana a los empleados. El enlace seguira funcionando, pero no vera los turnos. Continuar?";
    if (!confirm(confirmMessage)) return;

    startTransition(async () => {
      const res = await fetch("/api/scheduling/publication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, isVisible: nextVisible }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se ha podido cambiar la visibilidad de la semana.");
        return;
      }

      const publication = data.publication as EmployeeScheduleWeekPublication | undefined;
      setIsWeekVisible(Boolean(publication?.isVisible ?? nextVisible));
      setMessage(nextVisible ? "Semana visible para empleados." : "Semana oculta a empleados.");
      router.refresh();
    });
  }

  async function copyScheduleLink(employee: Employee) {
    const share = await resolveScheduleShare(employee);
    const url = share?.url;
    if (!url) {
      setError("No hay enlace de horario para este empleado.");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setMessage(isWeekVisible
        ? `Enlace copiado para ${share.employeeName}.`
        : `Enlace copiado para ${share.employeeName}. Esta semana sigue oculta hasta que pulses Mostrar a empleados.`);
      setError(null);
    } catch {
      setError("No se ha podido copiar el enlace. Vuelve a intentarlo.");
    }
  }

  async function resolveScheduleShare(employee: Employee) {
    try {
      const response = await fetch(`/api/scheduling/share?employeeId=${encodeURIComponent(employee.id)}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.token) {
        return {
          employeeName: String(data.employeeName ?? employee.name),
          url: buildScheduleUrl(String(data.token)),
        };
      }
    } catch {
      // Fall back to the server-provided initial links if the endpoint cannot be reached.
    }

    const token = shareMap.get(employee.id)?.token;
    return token ? { employeeName: employee.name, url: buildScheduleUrl(token) } : null;
  }

  function buildScheduleUrl(token: string) {
    if (!token || typeof window === "undefined") return null;
    if (HORARI_PUBLIC_BASE_URL) {
      return `${HORARI_PUBLIC_BASE_URL}/${token}?week=${weekStart}`;
    }
    return new URL(`/mi-horario/${token}?week=${weekStart}`, window.location.origin).toString();
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
              Edita los turnos como borrador y publicalos cuando quieras que el empleado los vea.
            </p>
            <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
              isWeekVisible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {isWeekVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {isWeekVisible ? "Visible para empleados" : "Oculta a empleados"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleWeekVisibility}
              disabled={isPending}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${
                isWeekVisible
                  ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {isWeekVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {isWeekVisible ? "Ocultar a empleados" : "Mostrar a empleados"}
            </button>
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
            {activeKind === "operational" && (
              <button
                type="button"
                onClick={copyContractualToOperational}
                disabled={isPending || stats.contractualShifts === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Copy className="size-4" />
                Copiar contractual
              </button>
            )}
            <button
              type="button"
              onClick={clearCurrentWeek}
              disabled={isPending || visibleShifts.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="size-4" />
              Limpiar semana
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--line)] bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveKind("operational")}
          className={`rounded-xl px-4 py-3 text-left transition ${
            activeKind === "operational"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="block text-sm font-black">Operativo y costes</span>
          <span className={`mt-1 block text-xs font-semibold ${activeKind === "operational" ? "text-indigo-100" : "text-slate-400"}`}>
            Horario real previsto, incluidas horas extra
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveKind("contractual")}
          className={`rounded-xl px-4 py-3 text-left transition ${
            activeKind === "contractual"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="block text-sm font-black">Contractual y fichajes</span>
          <span className={`mt-1 block text-xs font-semibold ${activeKind === "contractual" ? "text-emerald-100" : "text-slate-400"}`}>
            Distribución de las horas contratadas
          </span>
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<Users className="size-5" />} label="Empleados activos" value={fmtNum(stats.employees)} />
        <Metric icon={<CalendarDays className="size-5" />} label="Turnos operativos" value={fmtNum(stats.operationalShifts)} />
        <Metric icon={<Clock className="size-5" />} label="Horas operativas" value={formatDuration(stats.operationalMinutes)} />
        <Metric icon={<Clock className="size-5" />} label="Horas contractuales" value={formatDuration(stats.contractualMinutes)} />
        <Metric icon={<Clock className="size-5" />} label="Horas extra previstas" value={formatDuration(stats.overtimeMinutes)} />
        <Metric icon={<Euro className="size-5" />} label="Coste operativo" value={formatMoney(stats.plannedCost)} />
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

      {stats.missingCosts > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
          Hay {stats.missingCosts} turno{stats.missingCosts === 1 ? "" : "s"} sin coste/hora configurado. No contaran en el coste previsto hasta que lo asignes en Empleats.
        </section>
      )}
      {stats.missingOvertimeRates > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
          Hay horas extra sin tarifa específica en {stats.missingOvertimeRates} turno{stats.missingOvertimeRates === 1 ? "" : "s"}.
          Se está usando temporalmente el coste/hora normal.
        </section>
      )}
      {stats.employeesWithoutContract > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-800">
          {stats.employeesWithoutContract} empleado{stats.employeesWithoutContract === 1 ? "" : "s"} tiene horario operativo pero no contractual.
          Sus horas se calculan como ordinarias hasta completar el calendario contractual.
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-black tracking-tight text-slate-950">Parrilla semanal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Crea el operativo y elige un descanso por empleado. El contractual se repartira dentro de los demas turnos hasta completar sus horas semanales.
          </p>
        </div>

        {employees.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-lg font-bold text-slate-950">No hay empleados activos</p>
            <p className="mt-2 text-sm text-slate-500">Crea o activa empleados desde el apartado Empleats.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1210px]">
              <div className="grid grid-cols-[290px_repeat(7,minmax(120px,1fr))_130px] border-b border-[var(--line)] bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                <div className="px-4 py-3">Empleado</div>
                {days.map((day) => (
                  <div key={day} className="px-3 py-3 text-center">
                    <div>{formatWeekday(day)}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-400">{formatShortDate(day)}</div>
                  </div>
                ))}
                <div className="px-4 py-3 text-right">
                  {activeKind === "contractual" ? "Fichado" : "Extra"}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {employees.map((employee) => {
                  const planned = days.reduce((sum, day) => {
                    const dayShifts = shiftGroups.get(shiftKey(employee.id, day)) ?? [];
                    return sum + dayShifts.reduce((daySum, shift) => daySum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
                  }, 0);
                  const plannedCost = days.reduce((sum, day) => {
                    const profile = resolveEmployeeCostForDate(costHistoryByEmployee, employee.id, day, {
                      hourlyCost: employee.hourlyCost,
                      overtimeHourlyCost: employee.overtimeHourlyCost,
                    });
                    const dayShifts = shiftGroups.get(shiftKey(employee.id, day)) ?? [];
                    if (activeKind === "contractual") return sum;
                    const dayContractual = shifts.filter((shift) =>
                      shift.scheduleKind === "contractual" &&
                      shift.employeeId === employee.id &&
                      shift.businessDate === day
                    );
                    const hasContractualWeek = shifts.some((shift) =>
                      shift.scheduleKind === "contractual" &&
                      shift.employeeId === employee.id &&
                      sameMondayWeek(shift.businessDate, day)
                    );
                    return sum + dayShifts.reduce((daySum, shift) => {
                      const split = hasContractualWeek
                        ? splitShiftMinutes(shift, dayContractual)
                        : { regularMinutes: shiftMinutes(shift.shiftStart, shift.shiftEnd), overtimeMinutes: 0 };
                      return daySum +
                        (split.regularMinutes / 60) * profile.hourlyCost +
                        (split.overtimeMinutes / 60) * (profile.overtimeHourlyCost ?? profile.hourlyCost);
                    }, 0);
                  }, 0);
                  const real = realMinutesByEmployee.get(employee.id) ?? 0;
                  const diff = real - planned;
                  const weeklyTargetMinutes = Math.round((employee.weeklyHours ?? 0) * 60);
                  const contractDiff = planned - weeklyTargetMinutes;
                  const employeeOperational = shifts.filter((shift) =>
                    shift.scheduleKind === "operational" && shift.employeeId === employee.id
                  );
                  const employeeContractual = shifts.filter((shift) =>
                    shift.scheduleKind === "contractual" && shift.employeeId === employee.id
                  );
                  const overtimeMinutes = calculateOvertimeMinutes(employeeOperational, employeeContractual);

                  return (
                    <div
                      key={employee.id}
                      className="grid grid-cols-[290px_repeat(7,minmax(120px,1fr))_130px] items-stretch"
                    >
                      <div className="flex flex-col justify-center px-4 py-3">
                        <p className="truncate text-sm font-black text-slate-950">{employee.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {formatDuration(planned)} {activeKind === "operational" ? "operativas" : "contractuales"}
                        </p>
                        {activeKind === "operational" && (
                          <p className={`mt-1 text-xs font-bold ${plannedCost > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                            {plannedCost > 0 ? formatMoney(plannedCost) : "Sin coste/hora"}
                          </p>
                        )}
                        {activeKind === "contractual" && weeklyTargetMinutes > 0 ? (
                          <p className={`mt-1 text-xs font-black ${Math.abs(contractDiff) <= 5 ? "text-emerald-600" : contractDiff > 0 ? "text-rose-600" : "text-amber-600"}`}>
                            {Math.abs(contractDiff) <= 5
                              ? "Horas completas"
                              : contractDiff > 0
                                ? `Sobra ${formatDuration(contractDiff)}`
                                : `Falta ${formatDuration(Math.abs(contractDiff))}`}
                          </p>
                        ) : activeKind === "contractual" ? (
                          <p className="mt-1 text-xs font-bold text-slate-400">Sin horas semanales</p>
                        ) : (
                          <p className={`mt-1 text-xs font-black ${overtimeMinutes > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {overtimeMinutes > 0 ? `${formatDuration(overtimeMinutes)} extra` : "Sin horas extra"}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyScheduleLink(employee)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 transition hover:bg-slate-200"
                          >
                            <Link2 className="size-3.5" />
                            Copiar
                          </button>
                        </div>
                        {activeKind === "operational" && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2">
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                              Dia de descanso contractual
                            </label>
                            <div className="mt-1.5 flex gap-1.5">
                              <select
                                value={restDates[employee.id] ?? ""}
                                onChange={(event) => setRestDates((current) => ({
                                  ...current,
                                  [employee.id]: event.target.value,
                                }))}
                                className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs font-black text-slate-800 outline-none focus:border-amber-400"
                              >
                                <option value="">Seleccionar...</option>
                                {days.map((day) => (
                                  <option key={day} value={day}>
                                    {formatWeekday(day)} {formatShortDate(day)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                title="Guardar descanso y crear horario contractual"
                                onClick={() => saveRestDay(employee)}
                                disabled={isPending || !restDates[employee.id]}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Save className="size-3.5" />
                                Crear
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {days.map((day) => {
                        const dayShifts = shiftGroups.get(shiftKey(employee.id, day)) ?? [];
                        const isRestDay = restDates[employee.id] === day;
                        const profile = resolveEmployeeCostForDate(costHistoryByEmployee, employee.id, day, {
                          hourlyCost: employee.hourlyCost,
                          overtimeHourlyCost: employee.overtimeHourlyCost,
                        });
                        const employeeContractual = shifts.filter((shift) =>
                          shift.scheduleKind === "contractual" &&
                          shift.employeeId === employee.id
                        );
                        const hasContractualWeek = shifts.some((shift) =>
                          shift.scheduleKind === "contractual" &&
                          shift.employeeId === employee.id &&
                          sameMondayWeek(shift.businessDate, day)
                        );
                        return (
                          <div
                            key={`${employee.id}-${day}`}
                            className={`m-1 min-h-[92px] rounded-xl border px-2 py-2 ${
                              isRestDay && activeKind === "contractual"
                                ? "border-amber-300 bg-amber-50"
                                : dayShifts.length
                                ? "border-indigo-100 bg-indigo-50/60"
                                : "border-dashed border-slate-200 bg-white"
                            }`}
                          >
                            <div className="space-y-1.5">
                              {isRestDay && (
                                <div className="rounded-lg bg-amber-100 px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide text-amber-800">
                                  {activeKind === "contractual" ? "Dia de descanso" : "Descanso contractual"}
                                </div>
                              )}
                              {dayShifts.map((shift) => (
                                <button
                                  key={shift.id}
                                  type="button"
                                  onClick={() => openEditor(employee, day, shift)}
                                  className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-left text-indigo-950 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                >
                                  <p className="text-xs font-black tabular-nums">
                                    {shift.shiftStart} - {shift.shiftEnd}
                                  </p>
                                  <p className="mt-0.5 text-[11px] font-bold text-indigo-500">
                                    {formatDuration(shiftMinutes(shift.shiftStart, shift.shiftEnd))}
                                  </p>
                                  <p className={`mt-0.5 text-[10px] font-black ${profile.hourlyCost > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                                    {activeKind === "contractual"
                                      ? "Base contractual"
                                      : formatShiftCostLabel(shift, employeeContractual, hasContractualWeek, profile)}
                                  </p>
                                </button>
                              ))}
                              {!(isRestDay && activeKind === "contractual") && (
                                <button
                                  type="button"
                                  onClick={() => openEditor(employee, day)}
                                  className="flex min-h-8 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/80 px-2 py-1 text-[11px] font-black text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
                                >
                                  + Turno
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex flex-col justify-center px-4 py-3 text-right">
                        {activeKind === "contractual" ? (
                          <>
                            <p className="text-sm font-black text-slate-950">{formatDuration(real)}</p>
                            <p className={`mt-1 text-xs font-bold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {diff === 0 ? "Sin diferencia" : `${diff > 0 ? "+" : "-"}${formatDuration(Math.abs(diff))}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-black text-amber-700">{formatDuration(overtimeMinutes)}</p>
                            <p className="mt-1 text-xs font-bold text-slate-400">sobre contractual</p>
                          </>
                        )}
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
  const map = new Map(items.map((item) => [item.id, item]));
  map.set(nextShift.id, nextShift);
  return [...map.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.employeeName.localeCompare(b.employeeName, "ca"));
}

function replaceLocalShiftsForDays(items: EmployeeScheduleShift[], nextShifts: EmployeeScheduleShift[]) {
  const replacedDays = new Set(nextShifts.map((shift) => `${shift.scheduleKind}|${shiftKey(shift.employeeId, shift.businessDate)}`));
  return [
    ...items.filter((shift) => !replacedDays.has(`${shift.scheduleKind}|${shiftKey(shift.employeeId, shift.businessDate)}`)),
    ...nextShifts,
  ].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate) ||
    a.employeeName.localeCompare(b.employeeName, "ca") ||
    a.shiftStart.localeCompare(b.shiftStart)
  );
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
  if (startMinutes == null || endMinutes == null) return 0;
  let effectiveEnd = endMinutes;
  if (effectiveEnd <= startMinutes) effectiveEnd += 24 * 60;
  return effectiveEnd - startMinutes;
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function buildCostHistoryByEmployee(entries: EmployeeHourlyCostHistoryEntry[]) {
  const map = new Map<string, EmployeeHourlyCostHistoryEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.employeeId) ?? [];
    list.push(entry);
    map.set(entry.employeeId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  }
  return map;
}

function resolveEmployeeCostForDate(
  historyByEmployee: Map<string, EmployeeHourlyCostHistoryEntry[]>,
  employeeId: string,
  businessDate: string,
  fallback: { hourlyCost: number; overtimeHourlyCost: number | null },
) {
  const list = historyByEmployee.get(employeeId) ?? [];
  const match = list.find((entry) =>
    entry.validFrom <= businessDate && (!entry.validUntil || entry.validUntil > businessDate)
  );
  return match
    ? {
        hourlyCost: entryCost(match),
        overtimeHourlyCost: match.overtimeHourlyCost,
      }
    : fallback;
}

function entryCost(entry: EmployeeHourlyCostHistoryEntry) {
  return Number.isFinite(entry.hourlyCost) ? entry.hourlyCost : 0;
}

function splitShiftMinutes(
  operational: EmployeeScheduleShift,
  contractual: EmployeeScheduleShift[],
) {
  const operationalInterval = toAbsoluteInterval(operational);
  const boundaries = new Set([operationalInterval.start, operationalInterval.end]);
  const contractualIntervals = contractual.map(toAbsoluteInterval);
  for (const interval of contractualIntervals) {
    const start = Math.max(operationalInterval.start, interval.start);
    const end = Math.min(operationalInterval.end, interval.end);
    if (start < end) {
      boundaries.add(start);
      boundaries.add(end);
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    const covered = contractualIntervals.some((interval) => interval.start < end && interval.end > start);
    if (covered) regularMinutes += end - start;
    else overtimeMinutes += end - start;
  }
  return { regularMinutes, overtimeMinutes };
}

function calculateOvertimeMinutes(
  operational: EmployeeScheduleShift[],
  contractual: EmployeeScheduleShift[],
) {
  if (contractual.length === 0) return 0;
  return operational.reduce((total, shift) => {
    return total + splitShiftMinutes(shift, contractual).overtimeMinutes;
  }, 0);
}

function formatShiftCostLabel(
  shift: EmployeeScheduleShift,
  contractual: EmployeeScheduleShift[],
  hasContractualWeek: boolean,
  profile: { hourlyCost: number; overtimeHourlyCost: number | null },
) {
  if (!hasContractualWeek) {
    return profile.hourlyCost > 0 ? `${profile.hourlyCost.toFixed(2)} EUR/h · contractual pendiente` : "Sin coste";
  }
  const split = splitShiftMinutes(shift, contractual);
  if (split.overtimeMinutes === 0) return `${profile.hourlyCost.toFixed(2)} EUR/h ordinaria`;
  if (split.regularMinutes === 0) {
    const rate = profile.overtimeHourlyCost ?? profile.hourlyCost;
    return `${rate.toFixed(2)} EUR/h extra${profile.overtimeHourlyCost == null ? " (provisional)" : ""}`;
  }
  return `${formatDuration(split.regularMinutes)} normal · ${formatDuration(split.overtimeMinutes)} extra`;
}

function toAbsoluteInterval(shift: EmployeeScheduleShift) {
  const dayStart = Date.parse(`${shift.businessDate}T00:00:00Z`) / 60000;
  const startInDay = parseTime(shift.shiftStart) ?? 0;
  let endInDay = parseTime(shift.shiftEnd) ?? startInDay;
  if (endInDay <= startInDay) endInDay += 24 * 60;
  const start = dayStart + startInDay;
  const end = dayStart + endInDay;
  return { start, end };
}

function sameMondayWeek(left: string, right: string) {
  return mondayOf(left) === mondayOf(right);
}

function mondayOf(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const distance = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - distance);
  return isoDate(date);
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
  return formatDashboardDate(value, "es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  return formatDashboardDate(value, "es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatFullDate(value: string) {
  return formatDashboardDate(value, "es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatWeekday(value: string) {
  return formatDashboardDate(value, "ca-ES", { weekday: "short" }).replace(".", "");
}
