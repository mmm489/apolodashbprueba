import assert from "node:assert/strict";

import { buildPlannedLaborRecords } from "../src/lib/analytics";
import type {
  Employee,
  EmployeeHourlyCostHistoryEntry,
  EmployeeScheduleKind,
  EmployeeScheduleShift,
} from "../src/lib/types";

const employee: Employee = {
  id: "employee-1",
  name: "Empleat prova",
  shiftStart: "09:00",
  shiftEnd: "17:00",
  workingDaysPerMonth: 20,
  hourlyCost: 10,
  overtimeHourlyCost: 15,
  weeklyHours: 40,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const days = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"];
const shifts = [
  ...days.map((day, index) => shift(`contract-${index}`, day, "09:00", "17:00", "contractual")),
  ...days.map((day, index) => shift(`operation-${index}`, day, "09:00", "18:00", "operational")),
];
const records = buildPlannedLaborRecords(shifts, [], [employee]);
const ordinaryHours = totalHours(records, "regular");
const overtimeHours = totalHours(records, "overtime");

assert.equal(ordinaryHours, 40);
assert.equal(overtimeHours, 5);
assert.equal(totalCost(records), 475);

const noContractRecords = buildPlannedLaborRecords(
  shifts.filter((item) => item.scheduleKind === "operational"),
  [],
  [employee],
);
assert.equal(totalHours(noContractRecords, "regular"), 45);
assert.equal(totalHours(noContractRecords, "overtime"), 0);
assert.equal(totalCost(noContractRecords), 450);

const history: EmployeeHourlyCostHistoryEntry[] = [
  {
    id: "cost-1",
    employeeId: employee.id,
    employeeNameSnapshot: employee.name,
    hourlyCost: 10,
    overtimeHourlyCost: 15,
    validFrom: "2026-01-01",
    validUntil: "2026-08-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cost-2",
    employeeId: employee.id,
    employeeNameSnapshot: employee.name,
    hourlyCost: 10,
    overtimeHourlyCost: 20,
    validFrom: "2026-08-01",
    validUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
const futureRecords = buildPlannedLaborRecords(
  [
    shift("future-contract", "2026-08-03", "10:00", "18:00", "contractual"),
    shift("future-operation", "2026-08-03", "10:00", "20:00", "operational"),
  ],
  history,
  [employee],
);
assert.equal(totalHours(futureRecords, "regular"), 8);
assert.equal(totalHours(futureRecords, "overtime"), 2);
assert.equal(totalCost(futureRecords), 120);

const overnightRecords = buildPlannedLaborRecords(
  [
    shift("night-contract-1", "2026-08-03", "22:00", "00:00", "contractual"),
    shift("night-contract-2", "2026-08-04", "00:00", "01:00", "contractual"),
    shift("night-operation", "2026-08-03", "22:00", "02:00", "operational"),
  ],
  history,
  [employee],
);
assert.equal(totalHours(overnightRecords, "regular"), 3);
assert.equal(totalHours(overnightRecords, "overtime"), 1);
assert.equal(totalCost(overnightRecords), 50);

console.log("Double scheduling tests passed.");

function shift(
  id: string,
  businessDate: string,
  shiftStart: string,
  shiftEnd: string,
  scheduleKind: EmployeeScheduleKind,
): EmployeeScheduleShift {
  return {
    id,
    employeeId: employee.id,
    employeeName: employee.name,
    businessDate,
    shiftStart,
    shiftEnd,
    scheduleKind,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function totalHours(records: ReturnType<typeof buildPlannedLaborRecords>, laborType: "regular" | "overtime") {
  return records
    .filter((record) => record.laborType === laborType)
    .reduce((sum, record) => sum + record.hours, 0);
}

function totalCost(records: ReturnType<typeof buildPlannedLaborRecords>) {
  return records.reduce((sum, record) => sum + record.totalCost, 0);
}
