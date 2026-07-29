export type ScheduleInterval = {
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
};

export type GeneratedContractualShift = ScheduleInterval & {
  allocatedMinutes: number;
};

export type ContractualScheduleGeneration = {
  shifts: GeneratedContractualShift[];
  targetMinutes: number;
  contractualMinutes: number;
  missingMinutes: number;
  restDayOperationalMinutes: number;
};

export function generateContractualSchedule(
  operationalShifts: ScheduleInterval[],
  weeklyTargetMinutes: number,
  restDate: string,
): ContractualScheduleGeneration {
  const targetMinutes = Math.max(0, Math.round(weeklyTargetMinutes));
  const sorted = [...operationalShifts].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate)
    || a.shiftStart.localeCompare(b.shiftStart)
    || a.shiftEnd.localeCompare(b.shiftEnd)
  );
  const restDayOperationalMinutes = sorted
    .filter((shift) => shift.businessDate === restDate)
    .reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
  const eligible = sorted
    .filter((shift) => shift.businessDate !== restDate)
    .map((shift) => ({
      shift,
      capacity: shiftMinutes(shift.shiftStart, shift.shiftEnd),
      allocated: 0,
      raw: 0,
    }))
    .filter((item) => item.capacity > 0);

  const totalCapacity = eligible.reduce((sum, item) => sum + item.capacity, 0);
  const contractualMinutes = Math.min(targetMinutes, totalCapacity);

  if (contractualMinutes > 0 && totalCapacity > 0) {
    for (const item of eligible) {
      item.raw = contractualMinutes * (item.capacity / totalCapacity);
      item.allocated = Math.min(item.capacity, Math.floor(item.raw / 30) * 30);
    }

    let remaining = contractualMinutes - eligible.reduce((sum, item) => sum + item.allocated, 0);
    while (remaining > 0) {
      const candidate = eligible
        .filter((item) => item.allocated < item.capacity)
        .sort((a, b) =>
          (b.raw - b.allocated) - (a.raw - a.allocated)
          || b.capacity - b.allocated - (a.capacity - a.allocated)
          || a.shift.businessDate.localeCompare(b.shift.businessDate)
          || a.shift.shiftStart.localeCompare(b.shift.shiftStart)
        )[0];
      if (!candidate) break;
      const increment = Math.min(30, remaining, candidate.capacity - candidate.allocated);
      candidate.allocated += increment;
      remaining -= increment;
    }
  }

  return {
    shifts: eligible
      .filter((item) => item.allocated > 0)
      .map((item) => ({
        businessDate: item.shift.businessDate,
        shiftStart: item.shift.shiftStart,
        shiftEnd: addMinutesToTime(item.shift.shiftStart, item.allocated),
        allocatedMinutes: item.allocated,
      })),
    targetMinutes,
    contractualMinutes,
    missingMinutes: Math.max(0, targetMinutes - contractualMinutes),
    restDayOperationalMinutes,
  };
}

export function shiftMinutes(startValue: string, endValue: string) {
  const start = parseTime(startValue);
  const end = parseTime(endValue);
  if (start == null || end == null) return 0;
  return (end <= start ? end + 24 * 60 : end) - start;
}

function addMinutesToTime(startValue: string, durationMinutes: number) {
  const start = parseTime(startValue) ?? 0;
  const value = (start + durationMinutes) % (24 * 60);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
