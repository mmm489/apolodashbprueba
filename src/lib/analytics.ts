import { endOfDay, endOfMonth, endOfYear, formatISO, parseISO, startOfMonth, startOfYear, subDays } from "date-fns";

import {
  listAlerts,
  listBankTransactions,
  listDocuments,
  listHourlySales,
  listInvoiceLines,
  listInvoices,
  listPayrolls,
  listProductSales,
  listSalesReports,
  listTelegramMessages,
  listTelegramUsers,
} from "@/lib/repositories";
import type { ChatAnswer, DateFilter, DatePreset, FinancialWorkspace, InvoiceLineRecord, InvoiceRecord, ProductSaleRecord, SalesReport } from "@/lib/types";

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

  const ranges = {
    "7d": { from: subDays(now, 7), to: now },
    "30d": { from: subDays(now, 30), to: now },
    "90d": { from: subDays(now, 90), to: now },
    month: { from: startOfMonth(now), to: endOfMonth(now) },
    year: { from: startOfYear(now), to: endOfYear(now) },
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
  const [documents, salesReports, hourlySales, invoices, payrolls, bankTransactions, productSales, alerts, telegramUsers, telegramMessages] =
    await Promise.all([
      listDocuments(),
      listSalesReports(),
      listHourlySales(),
      listInvoices(),
      listPayrolls(),
      listBankTransactions(),
      listProductSales(),
      listAlerts(),
      listTelegramUsers(),
      listTelegramMessages(),
    ]);

  const fromDate = startOfDaySafe(filter.from);
  const toDate = endOfDaySafe(filter.to);
  const payPeriodStart = filter.from.slice(0, 7);
  const payPeriodEnd = filter.to.slice(0, 7);

  const scopedSales = salesReports.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedInvoices = invoices.filter((item) => isDateInRange(item.issueDate, fromDate, toDate));
  const scopedPayrolls = payrolls.filter((item) => item.payPeriod >= payPeriodStart && item.payPeriod <= payPeriodEnd);
  const scopedBank = bankTransactions.filter((item) => isDateInRange(item.bookedAt, fromDate, toDate));
  const scopedHourly = hourlySales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedProductSales = productSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedDocuments = documents.filter((item) => isDateInRange(item.createdAt, fromDate, toDate));

  const totalSales = scopedSales.reduce((sum, item) => sum + item.totalSales, 0);
  const invoiceExpenses = scopedInvoices.reduce((sum, item) => sum + item.totalAmount, 0);
  const bankOutflows = scopedBank.filter((item) => item.direction === "out").reduce((sum, item) => sum + item.amount, 0);
  const bankInflows = scopedBank.filter((item) => item.direction === "in").reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = invoiceExpenses + bankOutflows;
  const totalPayroll = scopedPayrolls.reduce((sum, item) => sum + item.grossAmount, 0);
  const totalOrders = scopedSales.reduce((sum, item) => sum + item.orderCount, 0);
  const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

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
  const bankGap = totalSales - bankInflows;
  const estimatedMargin = totalSales - totalExpenses - totalPayroll;

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
        bankGap,
        estimatedMargin,
        activeSuppliers: new Set(scopedInvoices.map((item) => item.supplierName)).size,
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
    bankTransactions: scopedBank,
    productSales: scopedProductSales,
    topProducts,
    totalsByCategory,
    cashFlowSummary: {
      inflows: bankInflows,
      outflows: bankOutflows,
      net: bankInflows - bankOutflows,
    },
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

  if (normalizedQuestion.includes("venta")) {
    return {
      answer: `En el periodo activo llevais ${formatCurrency(snapshot.kpis.totalSales)} en ventas y un ticket medio de ${formatCurrency(snapshot.kpis.averageTicket)}.`,
      sources: ["sales_reports", "hourly_sales"],
    };
  }

  if (normalizedQuestion.includes("hora")) {
    return {
      answer: `La mejor franja es ${snapshot.kpis.bestHourLabel} con ${formatCurrency(snapshot.kpis.bestHourSales)} acumulados en el periodo analizado.`,
      sources: ["hourly_sales"],
    };
  }

  if (normalizedQuestion.includes("nomina")) {
    return {
      answer: `El coste laboral acumulado es ${formatCurrency(snapshot.kpis.totalPayroll)} en el periodo analizado.`,
      sources: ["payrolls"],
    };
  }

  if (normalizedQuestion.includes("banco") || normalizedQuestion.includes("descuadre")) {
    return {
      answer: `La diferencia entre ventas registradas e ingresos bancarios es ${formatCurrency(snapshot.kpis.bankGap)}. Los cobros bancarios suman ${formatCurrency(workspace.cashFlowSummary.inflows)}.`,
      sources: ["sales_reports", "bank_transactions"],
    };
  }

  if (normalizedQuestion.includes("proveedor") || normalizedQuestion.includes("gasto")) {
    return {
      answer: `Los gastos acumulados de proveedores y salidas bancarias suman ${formatCurrency(snapshot.kpis.totalExpenses)}. Hay ${snapshot.kpis.activeSuppliers} proveedores activos en el periodo.`,
      sources: ["invoices", "bank_transactions"],
    };
  }

  return {
    answer:
      "Puedo ayudarte con ventas, mejores horas, gastos, nominas, banco y margen. Prueba una pregunta mas concreta para responderte con cifras.",
    sources: ["daily_kpis"],
  };
}

/* ---------- Sales workspace ---------- */

export interface SalesWorkspace {
  filter: DateFilter;
  salesReports: SalesReport[];
  productSales: ProductSaleRecord[];
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
  const [salesReports, productSales] = await Promise.all([listSalesReports(), listProductSales()]);

  const fromDate = startOfDaySafe(filter.from);
  const toDate = endOfDaySafe(filter.to);

  const scopedSales = salesReports.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));
  const scopedProducts = productSales.filter((item) => isDateInRange(item.businessDate, fromDate, toDate));

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

  return {
    filter,
    salesReports: scopedSales,
    productSales: scopedProducts,
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
  const [invoices, invoiceLines] = await Promise.all([listInvoices(), listInvoiceLines()]);

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
  if (preset === "7d" || preset === "30d" || preset === "90d" || preset === "month" || preset === "year" || preset === "custom") {
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}
