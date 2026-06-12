import { loadEnvConfig } from "@next/env";

import type { Employee, EmployeeScheduleShift } from "@/lib/types";

loadEnvConfig(process.cwd());

const WEEK_START: string = "2026-06-08";
const WEEK_END: string = "2026-06-14";
const CURRENT_COST_FROM: string = "2026-06-12";

const EMPLOYEE_SETTINGS = [
  { key: "gabriela", match: ["GABRIELA"], weeklyHours: 20, hourlyCost: 23.08 },
  { key: "gaston", match: ["GASTON"], weeklyHours: 30, hourlyCost: 11.54 },
  { key: "josep", match: ["JOSEP", "MARIA"], weeklyHours: 0, hourlyCost: 0 },
  { key: "margarita", match: ["MARGARITA"], weeklyHours: 40, hourlyCost: 11.75 },
  { key: "nicolas", match: ["NICOLAS"], weeklyHours: 40, hourlyCost: 11.75 },
  { key: "veronica", match: ["VERONICA"], weeklyHours: 40, hourlyCost: 11.75 },
] as const;

const SQUARE_SHIFTS = [
  { key: "gabriela", businessDate: "2026-06-12", shiftStart: "17:30", shiftEnd: "23:30" },
  { key: "gabriela", businessDate: "2026-06-13", shiftStart: "17:00", shiftEnd: "00:00" },
  { key: "gabriela", businessDate: "2026-06-14", shiftStart: "16:30", shiftEnd: "23:30" },

  { key: "gaston", businessDate: "2026-06-08", shiftStart: "14:00", shiftEnd: "23:30" },
  { key: "gaston", businessDate: "2026-06-09", shiftStart: "14:00", shiftEnd: "22:30" },
  { key: "gaston", businessDate: "2026-06-10", shiftStart: "16:30", shiftEnd: "23:30" },
  { key: "gaston", businessDate: "2026-06-11", shiftStart: "14:00", shiftEnd: "19:00" },

  { key: "margarita", businessDate: "2026-06-08", shiftStart: "16:30", shiftEnd: "23:30" },
  { key: "margarita", businessDate: "2026-06-10", shiftStart: "14:00", shiftEnd: "23:30" },
  { key: "margarita", businessDate: "2026-06-11", shiftStart: "16:30", shiftEnd: "23:30" },
  { key: "margarita", businessDate: "2026-06-12", shiftStart: "17:30", shiftEnd: "23:30" },
  { key: "margarita", businessDate: "2026-06-13", shiftStart: "18:00", shiftEnd: "00:00" },
  { key: "margarita", businessDate: "2026-06-14", shiftStart: "19:00", shiftEnd: "23:30" },

  { key: "nicolas", businessDate: "2026-06-09", shiftStart: "19:00", shiftEnd: "23:30" },
  { key: "nicolas", businessDate: "2026-06-10", shiftStart: "10:30", shiftEnd: "16:30" },
  { key: "nicolas", businessDate: "2026-06-11", shiftStart: "19:00", shiftEnd: "23:30" },
  { key: "nicolas", businessDate: "2026-06-12", shiftStart: "14:00", shiftEnd: "23:30" },
  { key: "nicolas", businessDate: "2026-06-13", shiftStart: "14:00", shiftEnd: "16:00" },
  { key: "nicolas", businessDate: "2026-06-13", shiftStart: "19:00", shiftEnd: "00:00" },
  { key: "nicolas", businessDate: "2026-06-14", shiftStart: "13:00", shiftEnd: "19:00" },
  { key: "nicolas", businessDate: "2026-06-14", shiftStart: "21:00", shiftEnd: "23:30" },

  { key: "veronica", businessDate: "2026-06-08", shiftStart: "10:30", shiftEnd: "16:30" },
  { key: "veronica", businessDate: "2026-06-09", shiftStart: "10:30", shiftEnd: "17:00" },
  { key: "veronica", businessDate: "2026-06-11", shiftStart: "10:30", shiftEnd: "16:30" },
  { key: "veronica", businessDate: "2026-06-12", shiftStart: "10:30", shiftEnd: "17:30" },
  { key: "veronica", businessDate: "2026-06-13", shiftStart: "10:30", shiftEnd: "18:00" },
  { key: "veronica", businessDate: "2026-06-14", shiftStart: "10:30", shiftEnd: "17:30" },
] as const;

async function main() {
  const dbModule = await import("@/lib/db");
  const repoModule = await import("@/lib/repositories");
  const dbExports = dbModule as typeof dbModule & { default?: typeof dbModule };
  const repoExports = repoModule as typeof repoModule & { default?: typeof repoModule };
  const { getSql } = dbExports.default ?? dbExports;
  const {
    listEmployees,
    listEmployeeScheduleShifts,
    replaceEmployeeScheduleShiftsForDays,
    upsertEmployeeHourlyCost,
    upsertEmployeeLaborSettings,
  } = repoExports.default ?? repoExports;

  await listEmployeeScheduleShifts(WEEK_START, WEEK_END);
  const employees = (await listEmployees()).filter((employee: Employee) => employee.isActive);
  const employeeByKey = new Map<string, { id: string; name: string }>();

  for (const setting of EMPLOYEE_SETTINGS) {
    const match = employees.find((employee: Employee) => {
      const normalized = normalize(employee.name);
      return setting.match.every((part) => normalized.includes(part));
    });
    if (!match) {
      const hasShifts = SQUARE_SHIFTS.some((shift) => shift.key === setting.key);
      if (setting.weeklyHours === 0 && !hasShifts) {
        console.warn(`Aviso: no se ha encontrado ${setting.key}; se omite porque tiene 0 h y ningun turno.`);
        continue;
      }
      throw new Error(`No se ha encontrado empleado activo para: ${setting.key}`);
    }
    employeeByKey.set(setting.key, { id: match.id, name: match.name });
  }

  for (const setting of EMPLOYEE_SETTINGS) {
    const employee = employeeByKey.get(setting.key);
    if (!employee) continue;
    await upsertEmployeeLaborSettings({
      employeeId: employee.id,
      employeeName: employee.name,
      weeklyHours: setting.weeklyHours,
    });
    await upsertEmployeeHourlyCost({
      employeeId: employee.id,
      employeeName: employee.name,
      hourlyCost: setting.hourlyCost,
      validFrom: WEEK_START,
    });
    if (CURRENT_COST_FROM !== WEEK_START) {
      await upsertEmployeeHourlyCost({
        employeeId: employee.id,
        employeeName: employee.name,
        hourlyCost: setting.hourlyCost,
        validFrom: CURRENT_COST_FROM,
      });
    }
  }

  const sql = getSql();
  const employeeIds = [...employeeByKey.values()].map((employee) => employee.id);
  await sql`
    DELETE FROM employee_schedule_shifts
    WHERE business_date >= ${WEEK_START}
      AND business_date <= ${WEEK_END}
      AND employee_id = ANY(${employeeIds})
  `;

  const items = SQUARE_SHIFTS.map((shift) => {
    const employee = employeeByKey.get(shift.key);
    if (!employee) throw new Error(`No se ha encontrado empleado para turno: ${shift.key}`);
    return {
      employeeId: employee.id,
      businessDate: shift.businessDate,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
    };
  });

  const saved = await replaceEmployeeScheduleShiftsForDays(items);
  const totalMinutes = saved.reduce((sum: number, shift: EmployeeScheduleShift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
  console.log(`Importados ${saved.length} turnos de Square.`);
  console.log(`Total planificado: ${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, "0")} min.`);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function shiftMinutes(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
