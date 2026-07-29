import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const REST_DAY_BY_NAME = [
  { match: "GABRIELA", weekday: 0, label: "lunes" },
  { match: "MARGARITA", weekday: 1, label: "martes" },
  { match: "VERONICA", weekday: 2, label: "miercoles" },
  { match: "NICOLAS", weekday: 3, label: "jueves" },
  { match: "GASTON", weekday: 4, label: "viernes" },
] as const;

const isApply = process.argv.includes("--apply");

async function main() {
  const {
    generateEmployeeContractualSchedule,
    listEmployees,
    listEmployeeScheduleShifts,
    listEmployeeScheduleWeekSettings,
  } = await import("../src/lib/repositories");
  const { generateContractualSchedule } = await import("../src/lib/contractual-schedule");

  const currentWeekStart = startOfMondayIso(new Date());
  const historicalEnd = addIsoDays(currentWeekStart, -1);
  const employees = await listEmployees();
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const operational = await listEmployeeScheduleShifts("2000-01-01", historicalEnd, "operational");
  const contractualBefore = await listEmployeeScheduleShifts("2000-01-01", historicalEnd, "contractual");

  const tasks = new Map<string, {
    employeeId: string;
    employeeName: string;
    weekStart: string;
    restDate: string;
    restLabel: string;
    shifts: typeof operational;
  }>();

  for (const shift of operational) {
    const employee = employeeById.get(shift.employeeId);
    if (!employee) continue;
    const rule = REST_DAY_BY_NAME.find((candidate) =>
      normalizeName(employee.name).includes(candidate.match)
    );
    if (!rule) continue;
    const weekStart = startOfMondayIso(shift.businessDate);
    const key = `${employee.id}|${weekStart}`;
    const current = tasks.get(key) ?? {
      employeeId: employee.id,
      employeeName: employee.name,
      weekStart,
      restDate: addIsoDays(weekStart, rule.weekday),
      restLabel: rule.label,
      shifts: [],
    };
    current.shifts.push(shift);
    tasks.set(key, current);
  }

  const ordered = [...tasks.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart) || a.employeeName.localeCompare(b.employeeName, "es")
  );
  const weeks = [...new Set(ordered.map((task) => task.weekStart))];

  if (ordered.length === 0) {
    console.log("No se han encontrado semanas historicas con operativa para los empleados indicados.");
    return;
  }

  console.log(`Modo: ${isApply ? "APLICAR" : "SIMULACION"}`);
  console.log(`Periodo historico: hasta ${historicalEnd}.`);
  console.log(`Semanas detectadas: ${weeks.length}. Planificaciones: ${ordered.length}.`);

  const preview = ordered.map((task) => {
    const employee = employeeById.get(task.employeeId)!;
    const result = generateContractualSchedule(
      task.shifts,
      Math.round((employee.weeklyHours ?? 0) * 60),
      task.restDate,
    );
    console.log(
      `${task.weekStart} | ${task.employeeName} | descanso ${task.restLabel} ${task.restDate}`
      + ` | contractual ${formatMinutes(result.contractualMinutes)}/${formatMinutes(result.targetMinutes)}`
      + `${result.missingMinutes > 0 ? ` | FALTAN ${formatMinutes(result.missingMinutes)}` : ""}`,
    );
    return { task, result };
  });

  const missing = preview.filter(({ result }) => result.missingMinutes > 0);
  console.log(`Semanas completas: ${preview.length - missing.length}. Con horas insuficientes: ${missing.length}.`);

  if (!isApply) {
    console.log("Simulacion terminada. Ejecuta con --apply para guardar los cambios.");
    return;
  }

  const settingsBefore = (
    await Promise.all(weeks.map((weekStart) => listEmployeeScheduleWeekSettings(weekStart)))
  ).flat();
  const backupDir = path.join(process.cwd(), ".codex-tmp", "schedule-backups");
  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `contractual-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await writeFile(
    backupPath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      currentWeekStart,
      contractualShifts: contractualBefore,
      weekSettings: settingsBefore,
    }, null, 2),
    "utf8",
  );
  console.log(`Copia previa guardada en ${backupPath}`);

  for (const { task } of preview) {
    await generateEmployeeContractualSchedule({
      employeeId: task.employeeId,
      weekStart: task.weekStart,
      restDate: task.restDate,
    });
  }

  const contractualAfter = await listEmployeeScheduleShifts("2000-01-01", historicalEnd, "contractual");
  let errors = 0;
  for (const { task, result } of preview) {
    const generated = contractualAfter.filter((shift) =>
      shift.employeeId === task.employeeId
      && shift.businessDate >= task.weekStart
      && shift.businessDate <= addIsoDays(task.weekStart, 6)
    );
    const generatedMinutes = generated.reduce(
      (sum, shift) => sum + minutesBetween(shift.shiftStart, shift.shiftEnd),
      0,
    );
    const hasRestShift = generated.some((shift) => shift.businessDate === task.restDate);
    if (generatedMinutes !== result.contractualMinutes || hasRestShift) {
      errors += 1;
      console.error(`ERROR de verificacion: ${task.weekStart} ${task.employeeName}`);
    }
  }

  if (errors > 0) {
    throw new Error(`La carga termino con ${errors} errores de verificacion.`);
  }
  console.log(`Carga completada y verificada: ${preview.length} planificaciones contractuales.`);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function startOfMondayIso(value: Date | string) {
  const date = typeof value === "string"
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesBetween(startValue: string, endValue: string) {
  const [startHour, startMinute] = startValue.split(":").map(Number);
  const [endHour, endMinute] = endValue.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return end - start;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
