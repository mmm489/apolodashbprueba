import { addDays, differenceInCalendarDays, endOfDay, formatISO, parseISO, startOfMonth, startOfYear, subDays, subWeeks } from "date-fns";

import {
  listAlerts,
  listAllProductCostHistory,
  listDocuments,
  listEmployeeShifts,
  listEmployees,
  listHourlySales,
  listHourlyProductSales,
  listProductCosts,
  listInvoiceLines,
  listInvoices,
  listPayrolls,
  listProductSales,
  listSalesReports,
  listTelegramMessages,
  listTelegramUsers,
} from "@/lib/repositories";
import { describeCalendarContext, getCalendarContext } from "@/lib/calendar";
import { classifyFamily } from "@/lib/product-families";
import type { ChatAnswer, DailyCalendarNote, DailyDigest as DailyDigestType, DateFilter, DatePreset, Employee, EmployeeShift, FamilyMovement, FinancialWorkspace, HistoricalWeather, HourlyProductSale, HourlySalesEntry, InvoiceLineRecord, InvoiceRecord, PeriodComparison, PeriodTotals, ProductCost, ProductCostHistoryEntry, ProductSaleRecord, SalesReport } from "@/lib/types";

export function resolveDateFilter(input?: {
  preset?: string;
  from?: string;
  to?: string;
}): DateFilter {
  const now = new Date();
  const preset = normalizePreset(input?.preset);

  if (preset === "custom" && input?.from && input?.to) {
    const from = startOfDaySafe(input.from);
    const to = endOfDaySafe(input.to);

    return {
      preset,
      from: formatISO(from, { representation: "date" }),
      to: formatISO(to, { representation: "date" }),
    };
  }

  const yesterday = subDays(now, 1);
  // "month" and "year" are YTD-style: they end at today, not at the calendar
  // end of month/year. This way comparisons vs the same period last year
  // compare equal-length ranges (e.g. Jan 1 – today 2026 vs Jan 1 – today
  // one year ago) instead of "partial YTD vs full previous year".
  const ranges = {
    today: { from: now, to: now },
    yesterday: { from: yesterday, to: yesterday },
    "7d": { from: subDays(now, 7), to: now },
    "30d": { from: subDays(now, 30), to: now },
    "90d": { from: subDays(now, 90), to: now },
    month: { from: startOfMonth(now), to: now },
    year: { from: startOfYear(now), to: now },
    custom: { from: subDays(now, 30), to: now },
  } satisfies Record<DatePreset, { from: Date; to: Date }>;

  const range = ranges[preset];

  return {
    preset,
    from: formatISO(range.from, { representation: "date" }),
    to: formatISO(range.to, { representation: "date" }),
  };
}

export async function getFinancialWorkspace(input?: {
  preset?: string;
  from?: string;
  to?: string;
}): Promise<FinancialWorkspace> {
  const filter = resolveDateFilter(input);
  // Extend the sales query to cover the previous period and the same period
  // 52 weeks earlier (DOW-aligned year-over-year) for comparison metrics.
  const comparisonRange = buildComparisonRange(filter);
  const [documents, salesReports, extendedSales, hourlySales, invoices, payrolls, productSales, previousProductSales, alerts, telegramUsers, telegramMessages, employees, productCosts, productCostHistory, employeeShifts] =
    await Promise.all([
      listDocuments(filter.from, filter.to),
      listSalesReports(filter.from, filter.to),
      listSalesReports(comparisonRange.from, comparisonRange.to),
      listHourlySales(filter.from, filter.to),
      listInvoices(filter.from, filter.to),
      listPayrolls(filter.from, filter.to),
      listProductSales(filter.from, filter.to),
      listProductSales(buildPreviousPeriodRange(filter).from, buildPreviousPeriodRange(filter).to),
      listAlerts(),
      listTelegramUsers(),
      listTelegramMessages(),
      listEmployees(),
      listProductCosts(),
      listAllProductCostHistory(),
      listEmployeeShifts(filter.from, filter.to),
    ]);

  const fromDate = startOfDaySafe(filter.from);
  const toDate = endOfDaySafe(filter.to);
  const payPeriodStart = filter.from.slice(0, 7);
  const payPeriodEnd = filter.to.slice(0, 7);

  const scopedSales = salesReports.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedInvoices = invoices.filter((item) => isDateInRange(item.issueDate, fromDate, toDate));
  const scopedPayrolls = payrolls.filter((item) => item.payPeriod >= payPeriodStart && item.payPeriod <= payPeriodEnd);
  const scopedHourly = hourlySales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedProductSales = productSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedDocuments = documents.filter((item) => isDateInRange(item.createdAt, fromDate, toDate));

  const totalSales = scopedSales.reduce((sum, item) => sum + item.totalSales, 0);
  const totalExpenses = scopedInvoices.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalPayroll = scopedPayrolls.reduce((sum, item) => sum + item.grossAmount, 0);
  const totalOrders = scopedSales.reduce((sum, item) => sum + item.orderCount, 0);
  const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

  const comparisons = computePeriodComparisons(extendedSales, filter);
  // For the digest forecast we need historical temperatures for the last few
  // same-DOW days plus tomorrow's forecast. Pull a 5-week window ending the
  // day after the most recent sales report.
  const digestWeather = await fetchWeatherForDigest(extendedSales);
  // Historical weather for the two YoY comparison dates so the digest can
  // annotate last year's sales with "it was raining / hot / cold".
  const historicalWeather = await fetchHistoricalWeatherForDigest(extendedSales);
  const dailyDigest = computeDailyDigest(extendedSales, digestWeather, historicalWeather);
  const familyMovements = computeFamilyMovements(scopedProductSales, previousProductSales);

  const hourlyPerformance = scopedHourly
    .reduce<Array<{ hour: string; sales: number }>>((acc, item) => {
      const existing = acc.find((entry) => entry.hour === item.hour);
      if (existing) {
        existing.sales += item.sales;
      } else {
        acc.push({ hour: item.hour, sales: item.sales });
      }
      return acc;
    }, [])
    .sort((a, b) => b.sales - a.sales);

  const bestHour = hourlyPerformance[0] ?? { hour: "--", sales: 0 };
  const estimatedMargin = totalSales - totalExpenses - totalPayroll;

  // Total hours worked in the period (from real shifts, not theoretical monthly hours)
  const totalHoursWorked = employeeShifts.reduce(
    (sum, shift) => sum + computeShiftHours(shift.shiftStart, shift.shiftEnd),
    0,
  );
  const productivityPerHour = totalHoursWorked > 0 ? totalSales / totalHoursWorked : 0;

  // Product cost per sale uses the cost that was valid ON THE DAY the sale
  // happened (product_cost_history), NOT the current unit_cost. That way a
  // supplier price change today doesn't retroactively distort past margin
  // reports. Falls back to the current product_costs row if the history is
  // empty for that product, and then to 0.
  const costHistoryByProduct = new Map<string, ProductCostHistoryEntry[]>();
  for (const entry of productCostHistory) {
    const list = costHistoryByProduct.get(entry.productCode) ?? [];
    list.push(entry);
    costHistoryByProduct.set(entry.productCode, list);
  }
  // Ensure each product's list is sorted by validFrom DESC so getCostOn walks
  // newest-first (most recent match wins).
  for (const list of costHistoryByProduct.values()) {
    list.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  }
  const currentCostMap = new Map<string, number>();
  for (const pc of productCosts) currentCostMap.set(pc.productCode, pc.unitCost);

  const scopedProductsForCost = productSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  let totalProductCost = 0;
  let salesAmountWithCost = 0;
  let salesAmountTotal = 0;
  for (const item of scopedProductsForCost) {
    const unitCost = resolveUnitCostForSale(costHistoryByProduct, currentCostMap, item.productCode, item.businessDate);
    totalProductCost += unitCost * item.units;
    salesAmountTotal += item.amount;
    if (unitCost > 0) salesAmountWithCost += item.amount;
  }
  const productCostCoverage = salesAmountTotal > 0 ? salesAmountWithCost / salesAmountTotal : 0;

  // Employee cost: sum(hours * hourly_cost) for shifts in the period (uses real shifts)
  const employeeById = new Map(employees.map((e) => [e.id, e] as const));
  const totalEmployeeCost = employeeShifts.reduce((sum, shift) => {
    const emp = employeeById.get(shift.employeeId);
    if (!emp) return sum;
    const hours = computeShiftHours(shift.shiftStart, shift.shiftEnd);
    return sum + hours * emp.hourlyCost;
  }, 0);

  const totalsByCategory = Object.entries(
    scopedInvoices.reduce<Record<string, number>>((acc, invoice) => {
      acc[invoice.category] = (acc[invoice.category] ?? 0) + invoice.totalAmount;
      return acc;
    }, {}),
  )
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);

  const topProducts = Object.values(
    scopedProductSales.reduce<Record<string, { productName: string; units: number; amount: number }>>((acc, item) => {
      const key = item.productName.toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          productName: item.productName,
          units: 0,
          amount: 0,
        };
      }
      acc[key].units += item.units;
      acc[key].amount += item.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b.units - a.units);

  return {
    filter,
    snapshot: {
      kpis: {
        totalSales,
        totalExpenses,
        totalPayroll,
        averageTicket,
        bestHourLabel: bestHour.hour,
        bestHourSales: bestHour.sales,
        estimatedMargin,
        activeSuppliers: new Set(scopedInvoices.map((item) => item.supplierName)).size,
        totalHoursWorked,
        productivityPerHour,
        totalProductCost,
        totalEmployeeCost,
        productCostCoverage,
      },
      alerts,
      documents: scopedDocuments,
      hourlyPerformance,
      telegramOverview: {
        authorizedUsers: telegramUsers.filter((user) => user.isActive).length,
        lastMessages: telegramMessages.slice(0, 3),
      },
      documentOverview: {
        totalDocuments: scopedDocuments.length,
        validatedDocuments: scopedDocuments.filter((document) => document.status === "validated").length,
      },
      lastUpdatedAt: new Date().toISOString(),
    },
    salesReports: scopedSales,
    hourlySales: scopedHourly,
    invoices: scopedInvoices,
    payrolls: scopedPayrolls,
    productSales: scopedProductSales,
    topProducts,
    totalsByCategory,
    comparisons,
    dailyDigest,
    familyMovements,
  };
}

export async function getDashboardSnapshot(input?: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  const workspace = await getFinancialWorkspace(input);
  return workspace.snapshot;
}

export async function answerBusinessQuestion(question: string): Promise<ChatAnswer> {
  const workspace = await getFinancialWorkspace({ preset: "30d" });
  const snapshot = workspace.snapshot;
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes("vend") || normalizedQuestion.includes("venta")) {
    return {
      answer: `En el periode actiu porteu ${formatCurrency(snapshot.kpis.totalSales)} en vendes i un tiquet mitja de ${formatCurrency(snapshot.kpis.averageTicket)}.`,
      sources: ["sales_reports", "hourly_sales"],
    };
  }

  if (normalizedQuestion.includes("hora")) {
    return {
      answer: `La millor franja es ${snapshot.kpis.bestHourLabel} amb ${formatCurrency(snapshot.kpis.bestHourSales)} acumulats en el periode analitzat.`,
      sources: ["hourly_sales"],
    };
  }

  if (normalizedQuestion.includes("nomina") || normalizedQuestion.includes("nomin")) {
    return {
      answer: `El cost laboral acumulat es ${formatCurrency(snapshot.kpis.totalPayroll)} en el periode analitzat.`,
      sources: ["payrolls"],
    };
  }

  if (normalizedQuestion.includes("proveidor") || normalizedQuestion.includes("despes") || normalizedQuestion.includes("gasto")) {
    return {
      answer: `Les despeses acumulades de proveidors sumen ${formatCurrency(snapshot.kpis.totalExpenses)}. Hi ha ${snapshot.kpis.activeSuppliers} proveidors actius en el periode.`,
      sources: ["invoices"],
    };
  }

  return {
    answer:
      "Puc ajudar-te amb vendes, millors hores, despeses, nomines i marge. Prova una pregunta mes concreta per respondre't amb xifres.",
    sources: ["daily_kpis"],
  };
}

/* ---------- Sales workspace ---------- */

export interface DayWeather {
  tempMax: number;
  tempMin: number;
  weatherCode: number;
}

export interface DayStatus {
  date: string;
  totalSales: number | null;
  orderCount: number | null;
  averageTicket: number | null;
  hasArticles: boolean;
  hasHourly: boolean;
  weather: DayWeather | null;
}

export interface SalesWorkspace {
  filter: DateFilter;
  salesReports: SalesReport[];
  productSales: ProductSaleRecord[];
  hourlySales: HourlySalesEntry[];
  hourlyProductSales: HourlyProductSale[];
  productCosts: ProductCost[];
  employeeShifts: EmployeeShift[];
  employees: Employee[];
  dayStatuses: DayStatus[];
  topProducts: Array<{ productName: string; units: number; amount: number }>;
  totals: {
    totalSales: number;
    totalOrders: number;
    averageTicket: number;
    daysWithData: number;
  };
}

export async function getSalesWorkspace(input?: {
  preset?: string;
  from?: string;
  to?: string;
}): Promise<SalesWorkspace> {
  const filter = resolveDateFilter(input);
  const [salesReports, productSales, hourlySales, hourlyProductSales, employees, employeeShifts, productCosts] = await Promise.all([
    listSalesReports(filter.from, filter.to),
    listProductSales(filter.from, filter.to),
    listHourlySales(filter.from, filter.to),
    listHourlyProductSales(filter.from, filter.to),
    listEmployees(),
    listEmployeeShifts(filter.from, filter.to),
    listProductCosts(),
  ]);

  const fromDate = startOfDaySafe(filter.from);
  const toDate = endOfDaySafe(filter.to);

  const scopedSales = salesReports.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedProducts = productSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedHourly = hourlySales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedHourlyProducts = hourlyProductSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));

  const totalSales = scopedSales.reduce((sum, item) => sum + item.totalSales, 0);
  const totalOrders = scopedSales.reduce((sum, item) => sum + item.orderCount, 0);
  const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

  const topProducts = Object.values(
    scopedProducts.reduce<Record<string, { productName: string; units: number; amount: number }>>((acc, item) => {
      const key = item.productName.toLowerCase();
      if (!acc[key]) {
        acc[key] = { productName: item.productName, units: 0, amount: 0 };
      }
      acc[key].units += item.units;
      acc[key].amount += item.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b.units - a.units);

  // Build day-by-day statuses
  const salesByDate = new Map<string, SalesReport>();
  for (const r of scopedSales) salesByDate.set(r.businessDate, r);

  const hourlyDates = new Set<string>();
  for (const h of scopedHourly) hourlyDates.add(h.businessDate);

  const productDates = new Set<string>();
  for (const p of scopedProducts) productDates.add(p.businessDate);

  // Fetch weather data for the date range (Salou, Tarragona)
  const weatherMap = await fetchWeatherData(filter.from, filter.to);

  const dayStatuses: DayStatus[] = [];
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    const dateStr = formatISO(cursor, { representation: "date" });
    const report = salesByDate.get(dateStr);
    dayStatuses.push({
      date: dateStr,
      totalSales: report?.totalSales ?? null,
      orderCount: report?.orderCount ?? null,
      averageTicket: report?.averageTicket ?? null,
      hasArticles: productDates.has(dateStr),
      hasHourly: hourlyDates.has(dateStr),
      weather: weatherMap.get(dateStr) ?? null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  dayStatuses.sort((a, b) => b.date.localeCompare(a.date));

  return {
    filter,
    salesReports: scopedSales,
    productSales: scopedProducts,
    hourlySales: scopedHourly,
    hourlyProductSales: scopedHourlyProducts,
    productCosts,
    employeeShifts,
    employees,
    dayStatuses,
    topProducts,
    totals: {
      totalSales,
      totalOrders,
      averageTicket,
      daysWithData: scopedSales.length,
    },
  };
}

/* ---------- Expenses workspace ---------- */

export interface ExpenseRow {
  invoiceId: string;
  supplierName: string;
  issueDate: string;
  category: string;
  lineDescription: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  vatRate: number;
  vatAmount: number;
  invoiceTotal: number;
}

export interface InvoiceSummary {
  id: string;
  supplierName: string;
  issueDate: string;
  totalAmount: number;
  taxAmount: number;
  category: string;
  lineCount: number;
  lines: ExpenseRow[];
}

export interface ProductSpend {
  description: string;
  totalAmount: number;
  totalQuantity: number;
  occurrences: number;
  suppliers: string[];
}

export interface ExpensesWorkspace {
  filter: DateFilter;
  rows: ExpenseRow[];
  invoices: InvoiceSummary[];
  products: ProductSpend[];
  suppliers: string[];
  categories: string[];
  totals: { totalGross: number; totalVat: number; totalNet: number; lineCount: number; invoiceCount: number };
}

export async function getExpensesWorkspace(input?: {
  preset?: string;
  from?: string;
  to?: string;
  supplier?: string;
  product?: string;
  category?: string;
}): Promise<ExpensesWorkspace> {
  const filter = resolveDateFilter(input);
  const [invoices, invoiceLines] = await Promise.all([
    listInvoices(filter.from, filter.to),
    listInvoiceLines(filter.from, filter.to),
  ]);

  const fromDate = startOfDaySafe(filter.from);
  const toDate = endOfDaySafe(filter.to);

  const scopedInvoices = invoices.filter((inv) => isDateInRange(inv.issueDate, fromDate, toDate));

  // Build lookup
  const invoiceMap = new Map<string, InvoiceRecord>();
  for (const inv of scopedInvoices) invoiceMap.set(inv.id, inv);

  // Build expense rows - one per line item
  let rows: ExpenseRow[] = [];

  // Invoices WITH lines
  const invoicesWithLines = new Set<string>();
  for (const line of invoiceLines) {
    const inv = invoiceMap.get(line.invoiceId);
    if (!inv) continue;
    invoicesWithLines.add(inv.id);
    rows.push({
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      issueDate: inv.issueDate,
      category: inv.category,
      lineDescription: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineAmount: line.amount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      invoiceTotal: inv.totalAmount,
    });
  }

  // Invoices WITHOUT lines - show as single row
  for (const inv of scopedInvoices) {
    if (invoicesWithLines.has(inv.id)) continue;
    rows.push({
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      issueDate: inv.issueDate,
      category: inv.category,
      lineDescription: "(factura completa)",
      quantity: 1,
      unitPrice: inv.totalAmount,
      lineAmount: inv.totalAmount,
      vatRate: inv.taxAmount > 0 && inv.totalAmount > 0 ? (inv.taxAmount / (inv.totalAmount - inv.taxAmount)) * 100 : 0,
      vatAmount: inv.taxAmount,
      invoiceTotal: inv.totalAmount,
    });
  }

  // Apply filters
  const supplierFilter = input?.supplier?.toLowerCase().trim() ?? "";
  const productFilter = input?.product?.toLowerCase().trim() ?? "";
  const categoryFilter = input?.category?.toLowerCase().trim() ?? "";

  if (supplierFilter) rows = rows.filter((r) => r.supplierName.toLowerCase().includes(supplierFilter));
  if (productFilter) rows = rows.filter((r) => r.lineDescription.toLowerCase().includes(productFilter));
  if (categoryFilter) rows = rows.filter((r) => r.category.toLowerCase() === categoryFilter);

  // Sort by date desc then supplier
  rows.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || a.supplierName.localeCompare(b.supplierName));

  const allSuppliers = [...new Set(scopedInvoices.map((inv) => inv.supplierName))].sort();
  const allCategories = [...new Set(scopedInvoices.map((inv) => inv.category))].sort();

  const totalGross = rows.reduce((sum, r) => sum + r.lineAmount, 0);
  const totalVat = rows.reduce((sum, r) => sum + r.vatAmount, 0);
  const uniqueInvoices = new Set(rows.map((r) => r.invoiceId)).size;

  // Build invoice summaries with their lines
  const invoiceSummaries: InvoiceSummary[] = [];
  const invoiceRowsMap = new Map<string, ExpenseRow[]>();
  for (const row of rows) {
    const arr = invoiceRowsMap.get(row.invoiceId) ?? [];
    arr.push(row);
    invoiceRowsMap.set(row.invoiceId, arr);
  }
  for (const inv of scopedInvoices) {
    const lines = invoiceRowsMap.get(inv.id);
    if (!lines) continue;
    invoiceSummaries.push({
      id: inv.id,
      supplierName: inv.supplierName,
      issueDate: inv.issueDate,
      totalAmount: inv.totalAmount,
      taxAmount: inv.taxAmount,
      category: inv.category,
      lineCount: lines.length,
      lines,
    });
  }
  invoiceSummaries.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  // Aggregate products across all invoices
  const productMap = new Map<string, ProductSpend>();
  for (const row of rows) {
    if (row.lineDescription === "(factura completa)") continue;
    const key = row.lineDescription.toLowerCase().trim();
    const existing = productMap.get(key);
    if (existing) {
      existing.totalAmount += row.lineAmount;
      existing.totalQuantity += row.quantity;
      existing.occurrences += 1;
      if (!existing.suppliers.includes(row.supplierName)) existing.suppliers.push(row.supplierName);
    } else {
      productMap.set(key, {
        description: row.lineDescription,
        totalAmount: row.lineAmount,
        totalQuantity: row.quantity,
        occurrences: 1,
        suppliers: [row.supplierName],
      });
    }
  }
  const products = [...productMap.values()].sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    filter,
    rows,
    invoices: invoiceSummaries,
    products,
    suppliers: allSuppliers,
    categories: allCategories,
    totals: {
      totalGross,
      totalVat,
      totalNet: totalGross - totalVat,
      lineCount: rows.length,
      invoiceCount: uniqueInvoices,
    },
  };
}

function normalizePreset(preset?: string): DatePreset {
  if (preset === "today" || preset === "yesterday" || preset === "7d" || preset === "30d" || preset === "90d" || preset === "month" || preset === "year" || preset === "custom") {
    return preset;
  }

  return "30d";
}

function startOfDaySafe(value: string) {
  const date = parseISO(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDaySafe(value: string) {
  const date = parseISO(value);
  return endOfDay(date);
}

function isDateInRange(value: string, from: Date, to: Date) {
  const date = new Date(value);
  return date >= from && date <= to;
}

/* ---------- Daily digest ("Què vigilar avui") ----------
 *
 * DailyDigest type lives in types.ts so FinancialWorkspace can reference it. */

/** Builds the today/forecast digest from a wide window of sales reports.
 *
 * @param weather Optional map of date → DayWeather. When provided, the
 *   forecastTomorrow is adjusted by a temperature factor based on how warm
 *   tomorrow is vs the avg temperature of the same-DOW historical sample.
 *   For ice cream / gelateria, hotter days correlate with higher sales. */
export function computeDailyDigest(
  reports: SalesReport[],
  weather?: Map<string, DayWeather>,
  historicalWeather?: Map<string, HistoricalWeather>,
): DailyDigestType | null {
  if (!reports.length) return null;
  const sortedDesc = [...reports].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const today = sortedDesc[0];
  const todayDate = parseISO(today.businessDate);

  // Same DOW comparisons
  const findReport = (date: Date) => {
    const iso = formatISO(date, { representation: "date" });
    return reports.find((r) => r.businessDate === iso) ?? null;
  };
  const lastWeekReport = findReport(addDays(todayDate, -7));
  // Two YoY alignments:
  //   - DOW: 52 weeks back keeps the same weekday (Saturday ↔ Saturday)
  //   - Date: exactly 1 calendar year back (18 Apr 2026 ↔ 18 Apr 2025)
  const lastYearDowDate = subWeeks(todayDate, 52);
  const lastYearDowReport = findReport(lastYearDowDate);
  // Use Date.UTC to sidestep DST when subtracting a year
  const lastYearCalendarDate = new Date(Date.UTC(
    todayDate.getFullYear() - 1,
    todayDate.getMonth(),
    todayDate.getDate(),
  ));
  const lastYearCalendarReport = findReport(lastYearCalendarDate);

  // Forecast model — gelateria-friendly:
  //
  //   recent_baseline = avg of last 4 same-DOW days (today−7, −14, −21, −28).
  //                     Captures the "right now" trend.
  //   yoy_baseline    = avg of 4 same-DOW days around tomorrow−52w. Captures
  //                     the seasonality (Easter, late spring, August peak, …).
  //   yoy_growth      = current-period total / same-period-last-year total,
  //                     so the YoY signal reflects today's scale of business.
  //   final_baseline  = (recent_baseline + yoy_baseline × yoy_growth) / 2
  //                     If YoY samples aren't available, falls back to recent.
  //   forecast        = final_baseline × temperature_factor
  //
  // Recent samples (up to 4) — exclude today itself.
  const tomorrowDate = formatISO(addDays(todayDate, 1), { representation: "date" });
  const tomorrowDateObj = addDays(todayDate, 1);
  const recentSamples: Array<{ date: string; sales: number }> = [];
  for (let weeksBack = 1; weeksBack <= 12 && recentSamples.length < 4; weeksBack++) {
    const sampleDate = addDays(todayDate, -7 * weeksBack);
    const r = findReport(sampleDate);
    if (r) {
      recentSamples.push({ date: formatISO(sampleDate, { representation: "date" }), sales: r.totalSales });
    }
  }
  const recentBaseline = recentSamples.length > 0
    ? recentSamples.reduce((s, v) => s + v.sales, 0) / recentSamples.length
    : 0;

  // YoY samples: 4 same-DOW dates around tomorrow shifted back 52 weeks.
  // We pick (yoyAnchor − 7), yoyAnchor, (yoyAnchor + 7), (yoyAnchor + 14) so
  // we average a 4-week window centred just after the equivalent day. This
  // smooths out any single-day anomaly last year (rain, festival, etc.).
  const yoyAnchor = subWeeks(tomorrowDateObj, 52);
  const yoySamples: Array<{ date: string; sales: number }> = [];
  for (const offset of [-7, 0, 7, 14]) {
    const sampleDate = addDays(yoyAnchor, offset);
    const r = findReport(sampleDate);
    if (r) {
      yoySamples.push({ date: formatISO(sampleDate, { representation: "date" }), sales: r.totalSales });
    }
  }
  const yoyBaselineRaw = yoySamples.length > 0
    ? yoySamples.reduce((s, v) => s + v.sales, 0) / yoySamples.length
    : 0;

  // YoY business growth: how is the current 30-day rolling window doing vs
  // the equivalent 30-day window 52 weeks back? If sales were 1000/day then
  // and 1100/day now, the YoY baseline should be lifted by 1.10 to keep
  // pace with the current scale. Bound to [0.5, 2.0] so a single bad month
  // can't make the forecast wildly negative or doubled.
  const last30FromToday = sumWindow(reports, addDays(todayDate, -29), todayDate);
  const last30YoY = sumWindow(reports, addDays(todayDate, -29 - 52 * 7), addDays(todayDate, -52 * 7));
  let yoyGrowthFactor = 1;
  if (last30FromToday > 0 && last30YoY > 0) {
    yoyGrowthFactor = Math.max(0.5, Math.min(2.0, last30FromToday / last30YoY));
  }

  const yoyAdjusted = yoyBaselineRaw > 0 ? yoyBaselineRaw * yoyGrowthFactor : 0;

  // Blend: if we have YoY data, average recent and YoY-adjusted (50/50).
  // Otherwise just use the recent baseline so we still produce a forecast
  // for new businesses without history.
  const blendedBaseline = yoyAdjusted > 0 && recentBaseline > 0
    ? (recentBaseline + yoyAdjusted) / 2
    : recentBaseline;

  // Compute CoV across ALL samples used (recent + yoy) — that's the spread
  // we're really betting on.
  const allSampleValues = [
    ...recentSamples.map((s) => s.sales),
    ...yoySamples.map((s) => s.sales * yoyGrowthFactor),
  ];
  let sampleCoV = 0;
  if (allSampleValues.length > 1 && blendedBaseline > 0) {
    const variance = allSampleValues.reduce((s, v) => s + (v - blendedBaseline) ** 2, 0) / allSampleValues.length;
    sampleCoV = Math.sqrt(variance) / blendedBaseline;
  }
  const totalSamples = recentSamples.length + yoySamples.length;
  const forecastConfidence: "low" | "medium" | "high" =
    totalSamples >= 6 && sampleCoV < 0.25 ? "high"
    : totalSamples >= 4 && sampleCoV < 0.4 ? "medium"
    : "low";

  // Temperature factor (only when weather data is available).
  // Heuristic for ice cream: each +1°C above the baseline avg temperature
  // lifts expected sales ~5%, with a hard clamp of ±30% so we don't
  // extrapolate wildly outside the observed range.
  // The baseline temp is the avg across BOTH recent and YoY sample dates,
  // matching the blended sales baseline.
  let tempFactor = 1;
  let tomorrowTempMax: number | null = null;
  let avgHistoricalTempMax: number | null = null;
  if (weather) {
    const tomorrowW = weather.get(tomorrowDate);
    const sampleTemps = [...recentSamples, ...yoySamples]
      .map((s) => weather.get(s.date)?.tempMax)
      .filter((t): t is number => typeof t === "number");
    if (tomorrowW && sampleTemps.length > 0) {
      tomorrowTempMax = tomorrowW.tempMax;
      avgHistoricalTempMax = sampleTemps.reduce((s, t) => s + t, 0) / sampleTemps.length;
      const tempDelta = tomorrowTempMax - avgHistoricalTempMax;
      tempFactor = Math.max(0.7, Math.min(1.3, 1 + tempDelta * 0.05));
    }
  }

  return {
    date: today.businessDate,
    sales: today.totalSales,
    orders: today.orderCount,
    averageTicket: today.averageTicket,
    vsLastWeek: lastWeekReport
      ? {
          sales: lastWeekReport.totalSales,
          orders: lastWeekReport.orderCount,
          averageTicket: lastWeekReport.averageTicket,
          deltaPct: pct(today.totalSales, lastWeekReport.totalSales),
        }
      : null,
    driversVsLastWeek: lastWeekReport && lastWeekReport.orderCount > 0
      ? computeDriversVsLastWeek(today, lastWeekReport)
      : null,
    last7Days: buildLast7Days(sortedDesc, todayDate),
    isStale: computeIsStale(todayDate),
    todayWeather: historicalWeather?.get(today.businessDate) ?? null,
    todayCalendar: toCalendarNote(today.businessDate),
    vsLastYearDow: lastYearDowReport
      ? {
          sales: lastYearDowReport.totalSales,
          date: formatISO(lastYearDowDate, { representation: "date" }),
          deltaPct: pct(today.totalSales, lastYearDowReport.totalSales),
          weather: historicalWeather?.get(formatISO(lastYearDowDate, { representation: "date" })) ?? null,
          calendar: toCalendarNote(formatISO(lastYearDowDate, { representation: "date" })),
        }
      : null,
    vsLastYearDate: lastYearCalendarReport
      ? {
          sales: lastYearCalendarReport.totalSales,
          date: formatISO(lastYearCalendarDate, { representation: "date" }),
          deltaPct: pct(today.totalSales, lastYearCalendarReport.totalSales),
          weather: historicalWeather?.get(formatISO(lastYearCalendarDate, { representation: "date" })) ?? null,
          calendar: toCalendarNote(formatISO(lastYearCalendarDate, { representation: "date" })),
        }
      : null,
    forecastTomorrow: blendedBaseline > 0
      ? {
          date: tomorrowDate,
          sales: blendedBaseline * tempFactor,
          baselineSales: blendedBaseline,
          recentBaseline,
          recentBasedOn: recentSamples.length,
          yoyBaseline: yoySamples.length > 0 ? yoyBaselineRaw : null,
          yoyBasedOn: yoySamples.length,
          yoyGrowthFactor,
          sampleCoV,
          confidence: forecastConfidence,
          tempFactor,
          tomorrowTempMax,
          avgHistoricalTempMax,
        }
      : null,
  };
}

/* ---------- Period comparisons ----------
 *
 * PeriodTotals and PeriodComparison live in types.ts so the FinancialWorkspace
 * type can reference them without a circular import. */

/** Returns the widest range we need to fetch so we can compute comparisons. */
function buildComparisonRange(filter: DateFilter): { from: string; to: string } {
  const from = parseISO(filter.from);
  const to = parseISO(filter.to);
  const lengthDays = differenceInCalendarDays(to, from) + 1;
  const previousFrom = addDays(from, -lengthDays);
  const yoyFrom = subWeeks(from, 52);
  const earliest = previousFrom < yoyFrom ? previousFrom : yoyFrom;
  return {
    from: formatISO(earliest, { representation: "date" }),
    to: formatISO(to, { representation: "date" }),
  };
}

function sumReports(reports: SalesReport[], from: string, to: string): PeriodTotals {
  const scoped = reports.filter((r) => r.businessDate >= from && r.businessDate <= to);
  const sales = scoped.reduce((sum, r) => sum + r.totalSales, 0);
  const orders = scoped.reduce((sum, r) => sum + r.orderCount, 0);
  return {
    sales,
    orders,
    averageTicket: orders > 0 ? sales / orders : 0,
    daysWithData: scoped.length,
  };
}

function pct(current: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

/** Midpoint decomposition of the sales delta today vs last-week same-DOW:
 *   volume effect = (Q2 - Q1) * (T1 + T2) / 2
 *   price effect  = (T2 - T1) * (Q1 + Q2) / 2
 * The two parts sum to the total delta. Which one dominates tells the owner
 * whether the variation came from traffic or from average ticket. */
function computeDriversVsLastWeek(today: SalesReport, prev: SalesReport) {
  const q1 = prev.orderCount;
  const q2 = today.orderCount;
  const t1 = prev.averageTicket;
  const t2 = today.averageTicket;
  const volumeEffect = (q2 - q1) * ((t1 + t2) / 2);
  const priceEffect = (t2 - t1) * ((q1 + q2) / 2);
  const totalDeltaEur = today.totalSales - prev.totalSales;
  const absVol = Math.abs(volumeEffect);
  const absPrice = Math.abs(priceEffect);
  const dominantDriver: "volume" | "price" | "balanced" =
    absVol > absPrice * 1.5 ? "volume"
    : absPrice > absVol * 1.5 ? "price"
    : "balanced";
  return { totalDeltaEur, volumeEffect, priceEffect, dominantDriver };
}

function buildLast7Days(sortedDesc: SalesReport[], todayDate: Date): Array<{ date: string; sales: number }> {
  const byDate = new Map(sortedDesc.map((r) => [r.businessDate, r.totalSales]));
  const out: Array<{ date: string; sales: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(todayDate, -i);
    const iso = formatISO(d, { representation: "date" });
    out.push({ date: iso, sales: byDate.get(iso) ?? 0 });
  }
  return out;
}

/** Given a product's cost-history list (sorted valid_from DESC) and a sale
 * date, returns the unit cost that was in effect on that day. Falls back to
 * the currently-valid cost (null valid_until wins) and then to the flat
 * product_costs entry so existing data without history doesn't break. */
function resolveUnitCostForSale(
  history: Map<string, ProductCostHistoryEntry[]>,
  currentCostMap: Map<string, number>,
  productCode: string,
  saleDate: string,
): number {
  const list = history.get(productCode);
  if (list && list.length > 0) {
    for (const entry of list) {
      if (saleDate >= entry.validFrom && (entry.validUntil === null || saleDate < entry.validUntil)) {
        return entry.unitCost;
      }
    }
  }
  return currentCostMap.get(productCode) ?? 0;
}

function computeIsStale(todayDate: Date): boolean {
  const now = new Date();
  const diffMs = now.getTime() - todayDate.getTime();
  return diffMs > 48 * 60 * 60 * 1000;
}

/** Sums total_sales across reports whose business_date falls within
 * [from, to], inclusive. Used by computeDailyDigest to compare a recent
 * window against the same window 52 weeks ago for the YoY growth factor. */
function sumWindow(reports: SalesReport[], from: Date, to: Date): number {
  const fromIso = formatISO(from, { representation: "date" });
  const toIso = formatISO(to, { representation: "date" });
  return reports
    .filter((r) => r.businessDate >= fromIso && r.businessDate <= toIso)
    .reduce((s, r) => s + r.totalSales, 0);
}

/** Wraps getCalendarContext for digest rows; returns null when the date is
 * a regular day with nothing notable (so the UI can hide the note). */
function toCalendarNote(iso: string): DailyCalendarNote | null {
  const ctx = getCalendarContext(iso);
  const label = describeCalendarContext(ctx);
  if (!label && !ctx.isHoliday) return null;
  return {
    label,
    daysFromEaster: ctx.daysFromEaster,
    isHoliday: ctx.isHoliday,
  };
}

/** Computes current / previous / YoY totals for the selected period.
 *
 * - previous = same-length window immediately before the current one.
 * - lastYear = same window shifted back 52 weeks (DOW-aligned). Saturday
 *   compares with Saturday, Monday with Monday, etc. */
export function computePeriodComparisons(
  reports: SalesReport[],
  filter: DateFilter,
): PeriodComparison {
  const from = parseISO(filter.from);
  const to = parseISO(filter.to);
  const lengthDays = differenceInCalendarDays(to, from) + 1;

  const previousFrom = formatISO(addDays(from, -lengthDays), { representation: "date" });
  const previousTo = formatISO(addDays(from, -1), { representation: "date" });
  const yoyFrom = formatISO(subWeeks(from, 52), { representation: "date" });
  const yoyTo = formatISO(subWeeks(to, 52), { representation: "date" });

  const current = sumReports(reports, filter.from, filter.to);
  const previous = sumReports(reports, previousFrom, previousTo);
  const lastYear = sumReports(reports, yoyFrom, yoyTo);

  return {
    current,
    previous,
    lastYear,
    deltaPreviousPct: pct(current.sales, previous.sales),
    deltaYoYPct: pct(current.sales, lastYear.sales),
  };
}

/** Returns the date range immediately preceding the selected filter, with
 * the same length, in YYYY-MM-DD form. */
function buildPreviousPeriodRange(filter: DateFilter): { from: string; to: string } {
  const from = parseISO(filter.from);
  const to = parseISO(filter.to);
  const lengthDays = differenceInCalendarDays(to, from) + 1;
  return {
    from: formatISO(addDays(from, -lengthDays), { representation: "date" }),
    to: formatISO(addDays(from, -1), { representation: "date" }),
  };
}

/** Aggregates product sales by family for the current and previous period and
 * returns the families ranked by absolute % change so the dashboard can
 * highlight winners and losers. Families with no current AND no previous
 * sales are excluded. */
export function computeFamilyMovements(
  currentSales: ProductSaleRecord[],
  previousSales: ProductSaleRecord[],
): FamilyMovement[] {
  const aggregate = (rows: ProductSaleRecord[]) => {
    const map = new Map<string, { sales: number; color: string }>();
    for (const r of rows) {
      const fam = classifyFamily(r.productName);
      const existing = map.get(fam.name);
      if (existing) {
        existing.sales += r.amount;
      } else {
        map.set(fam.name, { sales: r.amount, color: fam.color });
      }
    }
    return map;
  };
  const currentMap = aggregate(currentSales);
  const previousMap = aggregate(previousSales);
  const allFamilies = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);

  const movements: FamilyMovement[] = [];
  for (const fam of allFamilies) {
    const current = currentMap.get(fam);
    const previous = previousMap.get(fam);
    const currentSales = current?.sales ?? 0;
    const previousSales = previous?.sales ?? 0;
    if (currentSales === 0 && previousSales === 0) continue;
    movements.push({
      family: fam,
      color: current?.color ?? previous?.color ?? "bg-slate-400",
      currentSales,
      previousSales,
      deltaPct: pct(currentSales, previousSales),
      deltaEur: currentSales - previousSales,
    });
  }
  // Sort by deltaEur descending (biggest growth first) so winners are at the
  // top and losers at the bottom — the UI can slice both ends as needed.
  movements.sort((a, b) => b.deltaEur - a.deltaEur);
  return movements;
}

/** Fetches historical weather (temp max/min, precipitation, weather code) for
 * a set of dates from Open-Meteo's archive API. Used to annotate YoY
 * comparisons with "it was raining 15mm that day" context so the owner can
 * understand why last year's sales were lower. Results cached at the Next.js
 * fetch layer for 24h because historical weather is immutable. */
export async function fetchHistoricalWeather(dates: string[]): Promise<Map<string, HistoricalWeather>> {
  const map = new Map<string, HistoricalWeather>();
  const unique = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (unique.length === 0) return map;

  // Open-Meteo archive returns the whole range so one request covers many dates
  const sorted = unique.sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=41.07&longitude=1.13&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Europe/Madrid&start_date=${from}&end_date=${to}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return map;
    const data = await res.json();
    const times: string[] = data.daily?.time ?? [];
    const maxTemps: number[] = data.daily?.temperature_2m_max ?? [];
    const minTemps: number[] = data.daily?.temperature_2m_min ?? [];
    const precips: number[] = data.daily?.precipitation_sum ?? [];
    const codes: number[] = data.daily?.weather_code ?? [];
    for (let i = 0; i < times.length; i++) {
      map.set(times[i], {
        tempMax: maxTemps[i] ?? 0,
        tempMin: minTemps[i] ?? 0,
        precipitationMm: precips[i] ?? 0,
        weatherCode: codes[i] ?? 0,
      });
    }
  } catch (err) {
    console.warn("[weather-archive] error:", err);
  }
  return map;
}

/** Fetches archive weather for the YoY comparison dates (52 weeks ago and 1
 * calendar year ago) plus the most recent business day, so the dashboard can
 * explain "last year on this day it was raining". */
async function fetchHistoricalWeatherForDigest(reports: SalesReport[]): Promise<Map<string, HistoricalWeather>> {
  if (!reports.length) return new Map();
  const sortedDesc = [...reports].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const today = parseISO(sortedDesc[0].businessDate);
  const targets: string[] = [
    // Today itself
    formatISO(today, { representation: "date" }),
    // 52 weeks back (DOW-aligned)
    formatISO(subWeeks(today, 52), { representation: "date" }),
    // 1 calendar year back (date-aligned)
    formatISO(
      new Date(Date.UTC(today.getFullYear() - 1, today.getMonth(), today.getDate())),
      { representation: "date" },
    ),
  ];
  return fetchHistoricalWeather(targets);
}

/** Fetches a 5-week weather window ending the day after the most recent
 * sales report, so computeDailyDigest has temperatures for the same-DOW
 * historical samples plus tomorrow's forecast. */
async function fetchWeatherForDigest(reports: SalesReport[]): Promise<Map<string, DayWeather>> {
  if (!reports.length) return new Map();
  const sortedDesc = [...reports].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const lastDay = parseISO(sortedDesc[0].businessDate);
  const from = formatISO(addDays(lastDay, -35), { representation: "date" });
  const to = formatISO(addDays(lastDay, 1), { representation: "date" });
  return fetchWeatherData(from, to);
}

/** Computes hours between two "HH:MM" times. If end < start, assumes the shift
 * crosses midnight (e.g. 22:00–02:00 = 4 h), adding 24 h to the end. */
function computeShiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const startHours = sh + sm / 60;
  let endHours = eh + em / 60;
  if (endHours < startHours) endHours += 24;
  return endHours - startHours;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

/* ---------- Weather (Open-Meteo, Salou 41.07°N 1.13°E) ----------
 *
 * Open-Meteo exposes two endpoints:
 *   - forecast (api.open-meteo.com): past ~16d + next ~16d. Fresh data but
 *     no deep history — anything older than a month returns empty arrays.
 *   - archive (archive-api.open-meteo.com): historical since 1940, with a
 *     ~3-day lag from real-time.
 *
 * To cover any date range we split the request: everything up to 3 days ago
 * goes to archive, anything newer to forecast, and we merge the maps. Both
 * parts are cached at the Next.js fetch layer. */

async function fetchWeatherData(from: string, to: string): Promise<Map<string, DayWeather>> {
  const map = new Map<string, DayWeather>();
  const today = new Date();
  const archiveCutoff = new Date(today);
  archiveCutoff.setUTCDate(archiveCutoff.getUTCDate() - 3);
  const cutoffIso = archiveCutoff.toISOString().slice(0, 10);

  const calls: Array<Promise<void>> = [];
  // Archive portion: from .. min(to, cutoff)
  if (from <= cutoffIso) {
    const archiveTo = to < cutoffIso ? to : cutoffIso;
    calls.push(fetchArchiveInto(map, from, archiveTo));
  }
  // Forecast portion: max(from, cutoff+1) .. to
  if (to > cutoffIso) {
    const forecastFrom = from > cutoffIso ? from : incrementIsoDate(cutoffIso);
    calls.push(fetchForecastInto(map, forecastFrom, to));
  }
  await Promise.all(calls);
  return map;
}

function incrementIsoDate(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function fetchForecastInto(map: Map<string, DayWeather>, from: string, to: string) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=41.07&longitude=1.13&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe/Madrid&start_date=${from}&end_date=${to}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return;
    const data = await res.json();
    const times: string[] = data.daily?.time ?? [];
    const maxTemps: number[] = data.daily?.temperature_2m_max ?? [];
    const minTemps: number[] = data.daily?.temperature_2m_min ?? [];
    const codes: number[] = data.daily?.weather_code ?? [];
    for (let i = 0; i < times.length; i++) {
      map.set(times[i], {
        tempMax: maxTemps[i] ?? 0,
        tempMin: minTemps[i] ?? 0,
        weatherCode: codes[i] ?? 0,
      });
    }
  } catch (err) {
    console.warn("[weather-forecast] error:", err);
  }
}

async function fetchArchiveInto(map: Map<string, DayWeather>, from: string, to: string) {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=41.07&longitude=1.13&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe/Madrid&start_date=${from}&end_date=${to}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return;
    const data = await res.json();
    const times: string[] = data.daily?.time ?? [];
    const maxTemps: number[] = data.daily?.temperature_2m_max ?? [];
    const minTemps: number[] = data.daily?.temperature_2m_min ?? [];
    const codes: number[] = data.daily?.weather_code ?? [];
    for (let i = 0; i < times.length; i++) {
      map.set(times[i], {
        tempMax: maxTemps[i] ?? 0,
        tempMin: minTemps[i] ?? 0,
        weatherCode: codes[i] ?? 0,
      });
    }
  } catch (err) {
    console.warn("[weather-archive] error:", err);
  }
}
