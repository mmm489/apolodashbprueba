/**
 * Calendar context for Salou / Tarragona.
 *
 * Provides holiday lookups (national, Catalan, Easter week) and the offset
 * from Easter for any date. This matters because Easter shifts between late
 * March and late April each year, so naive YoY comparisons by calendar date
 * can put a tourist-peak Holy Week against a normal week and vice versa.
 */

export interface CalendarContext {
  /** YYYY-MM-DD */
  date: string;
  /** Name of the holiday if the date is one, otherwise undefined. */
  holidayName?: string;
  /** True if it's a public / bank holiday in Catalonia. */
  isHoliday: boolean;
  /** Days relative to Easter Sunday (0 = Easter Sunday, -2 = Good Friday). */
  daysFromEaster: number;
  /** Convenience label when the date falls in Easter high season. */
  easterWeekLabel?: "Dijous Sant" | "Divendres Sant" | "Dissabte Sant" | "Diumenge de Pasqua" | "Dilluns de Pasqua" | "Setmana Santa" | "Setmana de Pasqua";
}

/** Returns the date of Easter Sunday (Gregorian) for a given year, using the
 * standard anonymous Gregorian algorithm (Gauss/Butcher). Accurate for any
 * year from 1583 onwards.
 *
 * Returns a UTC Date at 00:00 so formatISO pegs to the intended calendar day
 * regardless of the server timezone. */
export function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Mar, 4 = Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns a map of YYYY-MM-DD → holiday name for the given year, including
 * Spanish national, Catalan autonomic, and Easter dates. Does not include
 * Salou-specific local festivities (add those manually if needed). */
export function getHolidaysForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();

  // Spanish national (fixed)
  map.set(`${year}-01-01`, "Cap d'any");
  map.set(`${year}-01-06`, "Reis");
  map.set(`${year}-05-01`, "Festa del Treball");
  map.set(`${year}-08-15`, "Assumpció");
  map.set(`${year}-10-12`, "Hispanitat");
  map.set(`${year}-11-01`, "Tots Sants");
  map.set(`${year}-12-06`, "Constitució");
  map.set(`${year}-12-08`, "Immaculada");
  map.set(`${year}-12-25`, "Nadal");

  // Catalan-specific
  map.set(`${year}-04-23`, "Sant Jordi");
  map.set(`${year}-06-24`, "Sant Joan");
  map.set(`${year}-09-11`, "Diada Nacional");
  map.set(`${year}-12-26`, "Sant Esteve");

  // Easter-based
  const easter = getEaster(year);
  const addDays = (base: Date, delta: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + delta);
    return d;
  };
  map.set(isoDate(addDays(easter, -2)), "Divendres Sant");
  map.set(isoDate(easter), "Diumenge de Pasqua");
  map.set(isoDate(addDays(easter, 1)), "Dilluns de Pasqua");
  // Dijous Sant is often observed in Catalonia too
  map.set(isoDate(addDays(easter, -3)), "Dijous Sant");

  return map;
}

/** Returns the full CalendarContext for a given ISO date. */
export function getCalendarContext(iso: string): CalendarContext {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) {
    return { date: iso, isHoliday: false, daysFromEaster: 0 };
  }

  const holidays = getHolidaysForYear(y);
  const holidayName = holidays.get(iso);
  const easter = getEaster(y);
  const target = Date.UTC(y, m - 1, d);
  const daysFromEaster = Math.round((target - easter.getTime()) / (24 * 60 * 60 * 1000));

  let easterWeekLabel: CalendarContext["easterWeekLabel"];
  if (daysFromEaster === -3) easterWeekLabel = "Dijous Sant";
  else if (daysFromEaster === -2) easterWeekLabel = "Divendres Sant";
  else if (daysFromEaster === -1) easterWeekLabel = "Dissabte Sant";
  else if (daysFromEaster === 0) easterWeekLabel = "Diumenge de Pasqua";
  else if (daysFromEaster === 1) easterWeekLabel = "Dilluns de Pasqua";
  else if (daysFromEaster >= -7 && daysFromEaster < -3) easterWeekLabel = "Setmana Santa";
  else if (daysFromEaster > 1 && daysFromEaster <= 7) easterWeekLabel = "Setmana de Pasqua";

  return {
    date: iso,
    holidayName,
    isHoliday: Boolean(holidayName),
    daysFromEaster,
    easterWeekLabel,
  };
}

/** Short human-readable label combining the holiday and Easter context.
 * Returns null when nothing notable (regular day). */
export function describeCalendarContext(ctx: CalendarContext): string | null {
  if (ctx.holidayName) return ctx.holidayName;
  if (ctx.easterWeekLabel) return ctx.easterWeekLabel;
  return null;
}
