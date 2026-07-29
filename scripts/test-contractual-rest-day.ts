import assert from "node:assert/strict";

import { generateContractualSchedule, shiftMinutes } from "../src/lib/contractual-schedule";

const operational = [
  { businessDate: "2026-07-27", shiftStart: "10:00", shiftEnd: "18:00" },
  { businessDate: "2026-07-28", shiftStart: "10:00", shiftEnd: "18:00" },
  { businessDate: "2026-07-29", shiftStart: "10:00", shiftEnd: "14:00" },
  { businessDate: "2026-07-29", shiftStart: "16:00", shiftEnd: "20:00" },
  { businessDate: "2026-07-30", shiftStart: "10:00", shiftEnd: "18:00" },
  { businessDate: "2026-07-31", shiftStart: "10:00", shiftEnd: "18:00" },
  { businessDate: "2026-08-01", shiftStart: "10:00", shiftEnd: "18:00" },
];

const result = generateContractualSchedule(operational, 40 * 60, "2026-07-30");
assert.equal(result.contractualMinutes, 40 * 60);
assert.equal(result.missingMinutes, 0);
assert.equal(result.restDayOperationalMinutes, 8 * 60);
assert.equal(result.shifts.some((shift) => shift.businessDate === "2026-07-30"), false);
assert.equal(
  result.shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0),
  40 * 60,
);
assert.equal(
  result.shifts.filter((shift) => shift.businessDate === "2026-07-29").length,
  2,
);

const insufficient = generateContractualSchedule(
  operational.slice(0, 3),
  40 * 60,
  "2026-07-28",
);
assert.equal(insufficient.contractualMinutes, 12 * 60);
assert.equal(insufficient.missingMinutes, 28 * 60);

console.log("Contractual rest-day generation tests passed.");
