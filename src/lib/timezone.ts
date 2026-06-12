export const DASHBOARD_TIME_ZONE = "Europe/Madrid";

export function formatDashboardDateTime(
  value: string | Date,
  locale = "ca-ES",
  options: Intl.DateTimeFormatOptions = {},
) {
  const hasStyle = Boolean(options.dateStyle || options.timeStyle);
  return new Intl.DateTimeFormat(locale, hasStyle ? {
    ...options,
    timeZone: DASHBOARD_TIME_ZONE,
  } : {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(toDate(value));
}

export function formatDashboardDate(
  value: string | Date,
  locale = "ca-ES",
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : toDate(value);

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(date);
}

export function formatDashboardTime(value: string | Date, locale = "es-ES") {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(toDate(value));
}

export function toDashboardDateOnly(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: DASHBOARD_TIME_ZONE,
  }).formatToParts(toDate(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}
