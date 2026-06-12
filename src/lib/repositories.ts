import { randomUUID } from "node:crypto";

import { getSql, hasDatabase, isPosDataSource } from "@/lib/db";
import {
  mockAlerts,
  mockDocuments,
  mockEmployees,
  mockHourlySales,
  mockInvoices,
  mockPayrolls,
  mockProductSales,
  mockSalesReports,
  mockTelegramMessages,
  mockTelegramUsers,
} from "@/lib/mock-data";
import type {
  AlertRecord,
  CashClosingRecord,
  CatalogChangeAction,
  CatalogDraftChange,
  CatalogChangeRecord,
  CatalogEntityType,
  CookiesTransactionRecord,
  DocumentRecord,
  Employee,
  EmployeeHourlyCostHistoryEntry,
  EmployeeScheduleShare,
  EmployeeScheduleShift,
  EmployeeShift,
  ExtractionResult,
  HourlyProductSale,
  ProductCost,
  ProductCostCandidate,
  ProductCostHistoryEntry,
  ProductCostReconcileRow,
  ProductCostWorkspace,
  HourlySalesEntry,
  InvoiceLineRecord,
  InvoiceRecord,
  PayrollRecord,
  PosCatalog,
  PosOrderLineRecord,
  ProductSaleRecord,
  SalesReport,
  SupplierPaymentRecord,
  TelegramMessage,
  TelegramUser,
  TimeClockAuditRecord,
  TimeClockSessionRecord,
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

const READ_ONLY_POS_MESSAGE = "Apolodashprueba esta conectado al POS en modo solo lectura.";
// Dashboard business days follow the POS cash-closing rhythm: sales made after
// midnight and before 04:00 belong to the previous service day.

function assertLegacyWritable() {
  if (isPosDataSource()) {
    throw new Error(READ_ONLY_POS_MESSAGE);
  }
}

function normalizePaymentMethod(value: unknown): string {
  const method = String(value ?? "otros").toLowerCase();
  if (method === "cash") return "efectivo";
  if (method === "card") return "tarjeta";
  if (method === "manual") return "tarjeta";
  if (method === "parked") return "aparcat";
  return method || "otros";
}

type DashboardSql = ReturnType<typeof getSql>;

async function hasPublicTable(sql: DashboardSql, tableName: string) {
  const rows = await sql.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(rows[0]?.table_name);
}

async function hasPosTable(sql: DashboardSql, tableName: string) {
  const rows = await sql.query("SELECT to_regclass($1) AS table_name", [`pos.${tableName}`]);
  return Boolean(rows[0]?.table_name);
}

let posBusinessUnitColumnEnsured = false;

async function ensurePosBusinessUnitColumn(sql: DashboardSql) {
  if (posBusinessUnitColumnEnsured || !isPosDataSource()) return;
  if (!(await hasPosTable(sql, "orders"))) return;
  await sql.query(`
    ALTER TABLE pos.orders
    ADD COLUMN IF NOT EXISTS business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream'
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_business_unit
    ON pos.orders(business_unit)
  `);
  posBusinessUnitColumnEnsured = true;
}

function normalizePaymentMix(value: unknown): Record<string, number> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return normalizePaymentMix(parsed);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toNumber(amount);
  }
  return out;
}

function sortByBusinessDateDesc<T extends { businessDate: string }>(items: T[]) {
  return items.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

function normalizeProductText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function categoryFamily(value: unknown) {
  const text = normalizeProductText(value);
  if (!text) return "altres";
  if (text.includes("topping") || text.includes("extre") || text.includes("sabor") || text.includes("bola")) return "toppings";
  if (text.includes("frozen") || text.includes("frozzen") || text.includes("iogurt") || text.includes("acai")) return "frozen";
  if (text.includes("gelat")) return "gelats";
  if (text.includes("begud")) return "begudes";
  if (text.includes("batut")) return "batuts";
  if (text.includes("berlin")) return "berlines";
  if (text.includes("cafe")) return "cafes";
  if (text.includes("crep")) return "crepes";
  if (text.includes("frappe")) return "frappes";
  if (text.includes("granissat") || text.includes("granitzat")) return "granissats";
  if (text.includes("hipop") || text.includes("waffle")) return "hi-pop";
  if (text.includes("ice")) return "ice-drinks";
  if (text.includes("recept")) return "receptes";
  if (text.includes("smooth")) return "smoothies";
  if (text.includes("xurro")) return "xurros";
  if (text.includes("especial")) return "especialitats";
  return text;
}

function categoriesCompatible(a: unknown, b: unknown) {
  const left = normalizeProductText(a);
  const right = normalizeProductText(b);
  if (!left || !right) return true;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  return categoryFamily(a) === categoryFamily(b);
}

function productNamesMatch(a: unknown, b: unknown) {
  return normalizeProductText(a) === normalizeProductText(b);
}

function roughNameConfidence(a: unknown, b: unknown) {
  const left = normalizeProductText(a);
  const right = normalizeProductText(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 76;
  const leftTokens = new Set(String(a ?? "").toLowerCase().split(/\s+/).map(normalizeProductText).filter(Boolean));
  const rightTokens = new Set(String(b ?? "").toLowerCase().split(/\s+/).map(normalizeProductText).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return Math.round((overlap / Math.max(leftTokens.size, rightTokens.size)) * 70);
}

export async function listDocuments(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockDocuments;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "documents"))) {
    return [];
  }
  const rows = from && to
    ? await sql`SELECT id, file_name, source_path, document_type, status, confidence, extractor_version, error_message, created_at FROM documents WHERE created_at::date >= ${from} AND created_at::date <= ${to} ORDER BY created_at DESC`
    : await sql`SELECT id, file_name, source_path, document_type, status, confidence, extractor_version, error_message, created_at FROM documents ORDER BY created_at DESC LIMIT 50`;
  return rows.map(mapDocument);
}

export async function listSalesReports(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockSalesReports;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    await ensurePosBusinessUnitColumn(sql);
    const rows = from && to
      ? await sql`
          SELECT ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date, payment_method,
                 COALESCE(SUM(COALESCE(total_base, total)), 0)::float AS total_sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
            AND ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
            AND status <> 'cancelled'
            AND payment_method <> 'parked'
          GROUP BY 1, payment_method
          ORDER BY business_date DESC
        `
      : await sql`
          SELECT ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date, payment_method,
                 COALESCE(SUM(COALESCE(total_base, total)), 0)::float AS total_sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE status <> 'cancelled'
            AND payment_method <> 'parked'
          GROUP BY 1, payment_method
          ORDER BY business_date DESC
          LIMIT 1200
        `;

    const byDate = new Map<string, SalesReport>();
    for (const row of rows) {
      const businessDate = normalizeDate(row.business_date);
      const report = byDate.get(businessDate) ?? {
        id: `pos-sales-${businessDate}`,
        businessDate,
        totalSales: 0,
        orderCount: 0,
        averageTicket: 0,
        paymentMix: {},
      };
      const method = normalizePaymentMethod(row.payment_method);
      const amount = toNumber(row.total_sales);
      report.totalSales += amount;
      report.orderCount += toNumber(row.order_count);
      report.paymentMix[method] = (report.paymentMix[method] ?? 0) + amount;
      byDate.set(businessDate, report);
    }

    if (await hasPublicTable(sql, "sales_reports")) {
      const legacyRows = from && to
        ? await sql`
            SELECT id, business_date, total_sales, order_count, average_ticket, payment_mix
            FROM sales_reports sr
            WHERE sr.business_date >= ${from}::date
              AND sr.business_date <= ${to}::date
              AND NOT EXISTS (
                SELECT 1
                FROM pos.orders o
                WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = sr.business_date
                  AND o.status <> 'cancelled'
                  AND o.payment_method <> 'parked'
              )
            ORDER BY sr.business_date DESC
          `
        : await sql`
            SELECT id, business_date, total_sales, order_count, average_ticket, payment_mix
            FROM sales_reports sr
            WHERE NOT EXISTS (
              SELECT 1
              FROM pos.orders o
              WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = sr.business_date
                AND o.status <> 'cancelled'
                AND o.payment_method <> 'parked'
            )
            ORDER BY sr.business_date DESC
            LIMIT 5000
          `;

      for (const row of legacyRows) {
        const businessDate = normalizeDate(row.business_date);
        byDate.set(businessDate, {
          id: String(row.id),
          businessDate,
          totalSales: toNumber(row.total_sales),
          orderCount: toNumber(row.order_count),
          averageTicket: toNumber(row.average_ticket),
          paymentMix: normalizePaymentMix(row.payment_mix),
        });
      }
    }

    return sortByBusinessDateDesc([...byDate.values()]).map((report) => ({
      ...report,
      averageTicket: report.orderCount > 0 ? report.totalSales / report.orderCount : 0,
    })) satisfies SalesReport[];
  }

  const rows = from && to
    ? await sql`SELECT id, business_date, total_sales, order_count, average_ticket, payment_mix FROM sales_reports WHERE business_date >= ${from} AND business_date <= ${to} ORDER BY business_date DESC`
    : await sql`SELECT id, business_date, total_sales, order_count, average_ticket, payment_mix FROM sales_reports ORDER BY business_date DESC LIMIT 400`;
  return rows.map((row) => ({
    id: String(row.id),
    businessDate: normalizeDate(row.business_date),
    totalSales: toNumber(row.total_sales),
    orderCount: toNumber(row.order_count),
    averageTicket: toNumber(row.average_ticket),
    paymentMix: normalizePaymentMix(row.payment_mix),
  })) satisfies SalesReport[];
}

export async function listHourlySales(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockHourlySales;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    await ensurePosBusinessUnitColumn(sql);
    const rows = from && to
      ? await sql`
          SELECT ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 COALESCE(SUM(COALESCE(total_base, total)), 0)::float AS sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
            AND ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
            AND status <> 'cancelled'
            AND payment_method <> 'parked'
          GROUP BY 1, 2
          ORDER BY business_date DESC, hour_num ASC
        `
      : await sql`
          SELECT ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 COALESCE(SUM(COALESCE(total_base, total)), 0)::float AS sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE status <> 'cancelled'
            AND payment_method <> 'parked'
          GROUP BY 1, 2
          ORDER BY business_date DESC, hour_num ASC
          LIMIT 10000
        `;

    const entries = rows.map((row) => {
      const businessDate = normalizeDate(row.business_date);
      const hour = `${String(row.hour_num).padStart(2, "0")}:00`;
      return {
        id: `pos-hour-${businessDate}-${row.hour_num}`,
        businessDate,
        hour,
        sales: toNumber(row.sales),
        orderCount: toNumber(row.order_count),
      };
    }) satisfies HourlySalesEntry[];

    if (await hasPublicTable(sql, "hourly_sales")) {
      const legacyRows = from && to
        ? await sql`
            SELECT id, business_date, hour_label, sales, order_count
            FROM hourly_sales hs
            WHERE hs.business_date >= ${from}::date
              AND hs.business_date <= ${to}::date
              AND NOT EXISTS (
                SELECT 1
                FROM pos.orders o
                WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = hs.business_date
                  AND o.status <> 'cancelled'
                  AND o.payment_method <> 'parked'
              )
            ORDER BY hs.business_date DESC, hs.hour_label ASC
          `
        : await sql`
            SELECT id, business_date, hour_label, sales, order_count
            FROM hourly_sales hs
            WHERE NOT EXISTS (
              SELECT 1
              FROM pos.orders o
              WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = hs.business_date
                AND o.status <> 'cancelled'
                AND o.payment_method <> 'parked'
            )
            ORDER BY hs.business_date DESC, hs.hour_label ASC
            LIMIT 20000
          `;

      entries.push(...legacyRows.map((row) => ({
        id: String(row.id),
        businessDate: normalizeDate(row.business_date),
        hour: String(row.hour_label),
        sales: toNumber(row.sales),
        orderCount: toNumber(row.order_count),
      })));
    }

    return sortByBusinessDateDesc(entries);
  }

  const rows = from && to
    ? await sql`SELECT id, business_date, hour_label, sales, order_count FROM hourly_sales WHERE business_date >= ${from} AND business_date <= ${to} ORDER BY business_date DESC, hour_label ASC`
    : await sql`SELECT id, business_date, hour_label, sales, order_count FROM hourly_sales ORDER BY business_date DESC, hour_label ASC LIMIT 10000`;
  return rows.map((row) => ({
    id: String(row.id),
    businessDate: normalizeDate(row.business_date),
    hour: String(row.hour_label),
    sales: toNumber(row.sales),
    orderCount: toNumber(row.order_count),
  })) satisfies HourlySalesEntry[];
}

export async function listHourlyProductSales(from?: string, to?: string) {
  if (!hasDatabase()) return [];

  const sql = getSql();
  if (isPosDataSource()) {
    await ensurePosBusinessUnitColumn(sql);
    const rows = from && to
      ? await sql`
          SELECT ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, 0) / 100, 0))::numeric, 2))::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
            AND ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
            AND o.status <> 'cancelled'
            AND o.payment_method <> 'parked'
          GROUP BY 1, 2, oi.product_id, p.name
          ORDER BY business_date DESC, hour_num ASC, amount DESC
        `
      : await sql`
          SELECT ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, 0) / 100, 0))::numeric, 2))::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE o.status <> 'cancelled'
            AND o.payment_method <> 'parked'
          GROUP BY 1, 2, oi.product_id, p.name
          ORDER BY business_date DESC, hour_num ASC, amount DESC
          LIMIT 50000
        `;

    const entries = rows.map((row) => {
      const businessDate = normalizeDate(row.business_date);
      const hourLabel = `${String(row.hour_num).padStart(2, "0")}:00`;
      const productCode = String(row.product_id);
      return {
        id: `pos-hour-product-${businessDate}-${row.hour_num}-${productCode}`,
        businessDate,
        hourLabel,
        productCode,
        productName: String(row.product_name),
        units: toNumber(row.units),
        amount: toNumber(row.amount),
      };
    }) satisfies HourlyProductSale[];

    if (await hasPublicTable(sql, "hourly_product_sales")) {
      const legacyRows = from && to
        ? await sql`
            SELECT id, business_date, hour_label, product_code, product_name, units, amount
            FROM hourly_product_sales hps
            WHERE hps.business_date >= ${from}::date
              AND hps.business_date <= ${to}::date
              AND NOT EXISTS (
                SELECT 1
                FROM pos.orders o
                WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = hps.business_date
                  AND o.status <> 'cancelled'
                  AND o.payment_method <> 'parked'
              )
            ORDER BY hps.business_date DESC, hps.hour_label ASC, hps.amount DESC
          `
        : await sql`
            SELECT id, business_date, hour_label, product_code, product_name, units, amount
            FROM hourly_product_sales hps
            WHERE NOT EXISTS (
              SELECT 1
              FROM pos.orders o
              WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = hps.business_date
                AND o.status <> 'cancelled'
                AND o.payment_method <> 'parked'
            )
            ORDER BY hps.business_date DESC, hps.hour_label ASC, hps.amount DESC
            LIMIT 50000
          `;

      entries.push(...legacyRows.map((row) => ({
        id: String(row.id),
        businessDate: normalizeDate(row.business_date),
        hourLabel: String(row.hour_label),
        productCode: String(row.product_code),
        productName: String(row.product_name),
        units: toNumber(row.units),
        amount: toNumber(row.amount),
      })));
    }

    return sortByBusinessDateDesc(entries);
  }

  const rows = from && to
    ? await sql`SELECT id, business_date, hour_label, product_code, product_name, units, amount FROM hourly_product_sales WHERE business_date >= ${from} AND business_date <= ${to} ORDER BY business_date DESC, hour_label ASC`
    : await sql`SELECT id, business_date, hour_label, product_code, product_name, units, amount FROM hourly_product_sales ORDER BY business_date DESC, hour_label ASC LIMIT 50000`;
  return rows.map((row) => ({
    id: String(row.id),
    businessDate: normalizeDate(row.business_date),
    hourLabel: String(row.hour_label),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    units: toNumber(row.units),
    amount: toNumber(row.amount),
  })) satisfies HourlyProductSale[];
}

export async function listInvoices(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockInvoices;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "invoices"))) {
    return [];
  }
  const rows = from && to
    ? await sql`SELECT id, supplier_name, issue_date, due_date, total_amount, tax_amount, category FROM invoices WHERE issue_date >= ${from} AND issue_date <= ${to} ORDER BY issue_date DESC`
    : await sql`SELECT id, supplier_name, issue_date, due_date, total_amount, tax_amount, category FROM invoices ORDER BY issue_date DESC LIMIT 500`;
  return rows.map((row) => ({
    id: String(row.id),
    supplierName: String(row.supplier_name),
    issueDate: String(row.issue_date),
    dueDate: row.due_date ? String(row.due_date) : null,
    totalAmount: toNumber(row.total_amount),
    taxAmount: toNumber(row.tax_amount),
    category: String(row.category),
  })) satisfies InvoiceRecord[];
}

export async function listInvoiceLines(from?: string, to?: string) {
  if (!hasDatabase()) return [];

  const sql = getSql();
  if (isPosDataSource() && (!(await hasPublicTable(sql, "invoice_lines")) || !(await hasPublicTable(sql, "invoices")))) {
    return [];
  }
  const rows = from && to
    ? await sql`SELECT il.id, il.invoice_id, il.description, il.quantity, il.unit_price, il.amount, il.vat_rate, il.vat_amount FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id WHERE i.issue_date >= ${from} AND i.issue_date <= ${to} ORDER BY il.invoice_id`
    : await sql`SELECT id, invoice_id, description, quantity, unit_price, amount, vat_rate, vat_amount FROM invoice_lines ORDER BY invoice_id`;
  return rows.map((row) => ({
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    description: String(row.description),
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unit_price),
    amount: toNumber(row.amount),
    vatRate: toNumber(row.vat_rate),
    vatAmount: toNumber(row.vat_amount),
  })) satisfies InvoiceLineRecord[];
}

export async function listProductSales(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockProductSales;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    await ensurePosBusinessUnitColumn(sql);
    const rows = from && to
      ? await sql`
          SELECT ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, 0) / 100, 0))::numeric, 2))::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
            AND ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
            AND o.status <> 'cancelled'
            AND o.payment_method <> 'parked'
          GROUP BY 1, oi.product_id, p.name
          ORDER BY business_date DESC, amount DESC
        `
      : await sql`
          SELECT ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, 0) / 100, 0))::numeric, 2))::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE o.status <> 'cancelled'
            AND o.payment_method <> 'parked'
          GROUP BY 1, oi.product_id, p.name
          ORDER BY business_date DESC, amount DESC
          LIMIT 20000
        `;

    const entries = rows.map((row) => {
      const businessDate = normalizeDate(row.business_date);
      const productCode = String(row.product_id);
      return {
        id: `pos-product-${businessDate}-${productCode}`,
        salesReportId: `pos-sales-${businessDate}`,
        businessDate,
        productCode,
        productName: String(row.product_name),
        units: toNumber(row.units),
        amount: toNumber(row.amount),
      };
    }) satisfies ProductSaleRecord[];

    if (await hasPublicTable(sql, "product_sales")) {
      const legacyRows = from && to
        ? await sql`
            SELECT id, sales_report_id, business_date, product_code, product_name, units, amount
            FROM product_sales ps
            WHERE ps.business_date >= ${from}::date
              AND ps.business_date <= ${to}::date
              AND NOT EXISTS (
                SELECT 1
                FROM pos.orders o
                WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = ps.business_date
                  AND o.status <> 'cancelled'
                  AND o.payment_method <> 'parked'
              )
            ORDER BY ps.business_date DESC, ps.amount DESC
          `
        : await sql`
            SELECT id, sales_report_id, business_date, product_code, product_name, units, amount
            FROM product_sales ps
            WHERE NOT EXISTS (
              SELECT 1
              FROM pos.orders o
              WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date = ps.business_date
                AND o.status <> 'cancelled'
                AND o.payment_method <> 'parked'
            )
            ORDER BY ps.business_date DESC, ps.amount DESC
            LIMIT 50000
          `;

      entries.push(...legacyRows.map((row) => ({
        id: String(row.id),
        salesReportId: String(row.sales_report_id),
        businessDate: normalizeDate(row.business_date),
        productCode: String(row.product_code),
        productName: String(row.product_name),
        units: toNumber(row.units),
        amount: toNumber(row.amount),
      })));
    }

    return sortByBusinessDateDesc(entries);
  }

  const rows = from && to
    ? await sql`SELECT id, sales_report_id, business_date, product_code, product_name, units, amount FROM product_sales WHERE business_date >= ${from} AND business_date <= ${to} ORDER BY business_date DESC`
    : await sql`SELECT id, sales_report_id, business_date, product_code, product_name, units, amount FROM product_sales ORDER BY business_date DESC LIMIT 20000`;
  return rows.map((row) => ({
    id: String(row.id),
    salesReportId: String(row.sales_report_id),
    businessDate: normalizeDate(row.business_date),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    units: toNumber(row.units),
    amount: toNumber(row.amount),
  })) satisfies ProductSaleRecord[];
}

export async function listCashClosings(from?: string, to?: string) {
  if (!hasDatabase() || !isPosDataSource()) {
    return [];
  }

  const sql = getSql();
  await ensurePosBusinessUnitColumn(sql);
  const rows = from && to
    ? await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               COALESCE(payment_totals.total_cash, c.total_cash) AS total_cash,
               COALESCE(payment_totals.total_card, c.total_card) AS total_card,
               COALESCE(payment_totals.total_sales, c.total_sales) AS total_sales,
               COALESCE(payment_totals.ticket_count, c.ticket_count) AS ticket_count,
               COALESCE(payment_totals.cash_count, c.cash_count) AS cash_count,
               COALESCE(payment_totals.card_count, c.card_count) AS card_count,
               c.cancelled_count, c.total_refunded,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total END), 0)::float AS total_cash,
            COALESCE(SUM(CASE WHEN o.payment_method IN ('card', 'manual') THEN o.total END), 0)::float AS total_card,
            COALESCE(SUM(o.total), 0)::float AS total_sales,
            COUNT(*)::int AS ticket_count,
            COUNT(*) FILTER (WHERE o.payment_method = 'cash')::int AS cash_count,
            COUNT(*) FILTER (WHERE o.payment_method IN ('card', 'manual'))::int AS card_count
          FROM pos.orders o
          WHERE o.created_at >= c.opened_at
            AND o.created_at <= c.closed_at
            AND o.status NOT IN ('pending', 'cancelled')
            AND o.payment_method <> 'parked'
        ) payment_totals ON TRUE
        WHERE ((c.closed_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
          AND ((c.closed_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
        ORDER BY c.closed_at DESC
      `
    : await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               COALESCE(payment_totals.total_cash, c.total_cash) AS total_cash,
               COALESCE(payment_totals.total_card, c.total_card) AS total_card,
               COALESCE(payment_totals.total_sales, c.total_sales) AS total_sales,
               COALESCE(payment_totals.ticket_count, c.ticket_count) AS ticket_count,
               COALESCE(payment_totals.cash_count, c.cash_count) AS cash_count,
               COALESCE(payment_totals.card_count, c.card_count) AS card_count,
               c.cancelled_count, c.total_refunded,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total END), 0)::float AS total_cash,
            COALESCE(SUM(CASE WHEN o.payment_method IN ('card', 'manual') THEN o.total END), 0)::float AS total_card,
            COALESCE(SUM(o.total), 0)::float AS total_sales,
            COUNT(*)::int AS ticket_count,
            COUNT(*) FILTER (WHERE o.payment_method = 'cash')::int AS cash_count,
            COUNT(*) FILTER (WHERE o.payment_method IN ('card', 'manual'))::int AS card_count
          FROM pos.orders o
          WHERE o.created_at >= c.opened_at
            AND o.created_at <= c.closed_at
            AND o.status NOT IN ('pending', 'cancelled')
            AND o.payment_method <> 'parked'
        ) payment_totals ON TRUE
        ORDER BY c.closed_at DESC
        LIMIT 200
      `;

  return rows.map((row) => ({
    id: String(row.id),
    zNumber: row.z_number == null ? null : Number(row.z_number),
    zLabel: row.z_label ? String(row.z_label) : `Tancament ${row.id}`,
    openedAt: new Date(String(row.opened_at)).toISOString(),
    closedAt: new Date(String(row.closed_at)).toISOString(),
    totalCash: toNumber(row.total_cash),
    totalCard: toNumber(row.total_card),
    totalSales: toNumber(row.total_sales),
    ticketCount: toNumber(row.ticket_count),
    cashCount: toNumber(row.cash_count),
    cardCount: toNumber(row.card_count),
    cancelledCount: toNumber(row.cancelled_count),
    totalRefunded: toNumber(row.total_refunded),
    firstInvoice: row.first_invoice ? String(row.first_invoice) : null,
    lastInvoice: row.last_invoice ? String(row.last_invoice) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
  })) satisfies CashClosingRecord[];
}

export async function listPosOrderLines(from?: string, to?: string) {
  if (!hasDatabase() || !isPosDataSource()) {
    return [];
  }

  const sql = getSql();
  await ensurePosBusinessUnitColumn(sql);
  const rows = from && to
    ? await sql`
        SELECT oi.id,
               oi.order_id,
               o.order_number,
               o.invoice_number,
               o.status,
               o.payment_method,
               o.table_number,
               e.name AS employee_name,
               ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(o.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS order_time,
               o.created_at,
               o.completed_at,
               oi.product_id,
               p.name AS product_name,
               c.name AS category_name,
               oi.qty,
               oi.unit_price,
               COALESCE(oi.vat_rate, p.vat_rate, 10) AS vat_rate,
               ROUND((oi.qty * oi.unit_price)::numeric, 2)::float AS line_total,
               ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, p.vat_rate, 10) / 100, 0))::numeric, 2)::float AS line_base,
               ROUND((oi.qty * oi.unit_price - (oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, p.vat_rate, 10) / 100, 0)))::numeric, 2)::float AS line_vat,
               COALESCE(o.total, 0)::float AS order_total,
               COALESCE(o.total_base, o.total, 0)::float AS order_base,
               COALESCE(o.total_vat, 0)::float AS order_vat,
               oi.notes
        FROM pos.order_items oi
        JOIN pos.orders o ON o.id = oi.order_id
        JOIN pos.products p ON p.id = oi.product_id
        LEFT JOIN pos.categories c ON c.id = p.category_id
        LEFT JOIN pos.employees e ON e.id = o.employee_id
        WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
          AND ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
          AND COALESCE(o.business_unit, 'hicream') = 'hicream'
        ORDER BY o.created_at DESC, oi.id ASC
        LIMIT 10000
      `
    : await sql`
        SELECT oi.id,
               oi.order_id,
               o.order_number,
               o.invoice_number,
               o.status,
               o.payment_method,
               o.table_number,
               e.name AS employee_name,
               ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(o.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS order_time,
               o.created_at,
               o.completed_at,
               oi.product_id,
               p.name AS product_name,
               c.name AS category_name,
               oi.qty,
               oi.unit_price,
               COALESCE(oi.vat_rate, p.vat_rate, 10) AS vat_rate,
               ROUND((oi.qty * oi.unit_price)::numeric, 2)::float AS line_total,
               ROUND((oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, p.vat_rate, 10) / 100, 0))::numeric, 2)::float AS line_base,
               ROUND((oi.qty * oi.unit_price - (oi.qty * oi.unit_price / NULLIF(1 + COALESCE(oi.vat_rate, p.vat_rate, 10) / 100, 0)))::numeric, 2)::float AS line_vat,
               COALESCE(o.total, 0)::float AS order_total,
               COALESCE(o.total_base, o.total, 0)::float AS order_base,
               COALESCE(o.total_vat, 0)::float AS order_vat,
               oi.notes
        FROM pos.order_items oi
        JOIN pos.orders o ON o.id = oi.order_id
        JOIN pos.products p ON p.id = oi.product_id
        LEFT JOIN pos.categories c ON c.id = p.category_id
        LEFT JOIN pos.employees e ON e.id = o.employee_id
        WHERE COALESCE(o.business_unit, 'hicream') = 'hicream'
        ORDER BY o.created_at DESC, oi.id ASC
        LIMIT 10000
      `;

  return rows.map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    orderNumber: String(row.order_number),
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    status: String(row.status),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    tableNumber: row.table_number ? String(row.table_number) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
    businessDate: normalizeDate(row.business_date),
    orderTime: String(row.order_time),
    createdAt: new Date(String(row.created_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    productId: String(row.product_id),
    productName: String(row.product_name),
    categoryName: row.category_name ? String(row.category_name) : null,
    qty: toNumber(row.qty),
    unitPrice: toNumber(row.unit_price),
    vatRate: toNumber(row.vat_rate),
    lineTotal: toNumber(row.line_total),
    lineBase: toNumber(row.line_base),
    lineVat: toNumber(row.line_vat),
    orderTotal: toNumber(row.order_total),
    orderBase: toNumber(row.order_base),
    orderVat: toNumber(row.order_vat),
    notes: row.notes ? String(row.notes) : null,
  })) satisfies PosOrderLineRecord[];
}

export async function listCookiesTransactions(from?: string, to?: string) {
  if (!hasDatabase() || !isPosDataSource()) {
    return [] satisfies CookiesTransactionRecord[];
  }

  const sql = getSql();
  await ensurePosBusinessUnitColumn(sql);
  const rows = from && to
    ? await sql`
        SELECT oi.id,
               o.id AS order_id,
               o.order_number,
               o.invoice_number,
               o.status,
               e.name AS employee_name,
               ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(o.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS order_time,
               o.created_at,
               COALESCE(o.total, 0)::float AS order_total,
               COALESCE(o.total_base, o.total, 0)::float AS order_base,
               COALESCE(o.total_vat, 0)::float AS order_vat,
               p.name AS product_name,
               oi.qty,
               oi.unit_price,
               ROUND((oi.qty * oi.unit_price)::numeric, 2)::float AS line_total,
               oi.notes
        FROM pos.order_items oi
        JOIN pos.orders o ON o.id = oi.order_id
        JOIN pos.products p ON p.id = oi.product_id
        LEFT JOIN pos.employees e ON e.id = o.employee_id
        WHERE ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
          AND ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
          AND COALESCE(o.business_unit, 'hicream') = 'cookies'
          AND o.payment_method <> 'parked'
        ORDER BY o.created_at DESC, oi.id ASC
        LIMIT 10000
      `
    : await sql`
        SELECT oi.id,
               o.id AS order_id,
               o.order_number,
               o.invoice_number,
               o.status,
               e.name AS employee_name,
               ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(o.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS order_time,
               o.created_at,
               COALESCE(o.total, 0)::float AS order_total,
               COALESCE(o.total_base, o.total, 0)::float AS order_base,
               COALESCE(o.total_vat, 0)::float AS order_vat,
               p.name AS product_name,
               oi.qty,
               oi.unit_price,
               ROUND((oi.qty * oi.unit_price)::numeric, 2)::float AS line_total,
               oi.notes
        FROM pos.order_items oi
        JOIN pos.orders o ON o.id = oi.order_id
        JOIN pos.products p ON p.id = oi.product_id
        LEFT JOIN pos.employees e ON e.id = o.employee_id
        WHERE COALESCE(o.business_unit, 'hicream') = 'cookies'
          AND o.payment_method <> 'parked'
        ORDER BY o.created_at DESC, oi.id ASC
        LIMIT 10000
      `;

  const grouped = new Map<string, CookiesTransactionRecord>();
  for (const row of rows) {
    const orderId = String(row.order_id);
    const existing = grouped.get(orderId);
    const item = {
      productName: String(row.product_name),
      qty: toNumber(row.qty),
      unitPrice: toNumber(row.unit_price),
      lineTotal: toNumber(row.line_total),
      notes: row.notes ? String(row.notes) : null,
    };

    if (!existing) {
      grouped.set(orderId, {
        id: orderId,
        orderNumber: String(row.order_number),
        invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
        status: String(row.status),
        businessDate: normalizeDate(row.business_date),
        orderTime: String(row.order_time),
        createdAt: new Date(String(row.created_at)).toISOString(),
        employeeName: row.employee_name ? String(row.employee_name) : null,
        total: toNumber(row.order_total),
        totalBase: toNumber(row.order_base),
        totalVat: toNumber(row.order_vat),
        itemCount: item.qty,
        summary: `${item.qty}x ${item.productName}`,
        items: [item],
      });
    } else {
      existing.itemCount += item.qty;
      existing.items.push(item);
      existing.summary = existing.items
        .slice(0, 3)
        .map((entry) => `${entry.qty}x ${entry.productName}`)
        .join(", ");
    }
  }

  return [...grouped.values()];
}

export async function listSupplierPayments(from?: string, to?: string) {
  if (!hasDatabase() || !isPosDataSource()) {
    return [] satisfies SupplierPaymentRecord[];
  }

  const sql = getSql();
  if (!(await hasPosTable(sql, "supplier_payments"))) {
    return [] satisfies SupplierPaymentRecord[];
  }

  const rows = from && to
    ? await sql`
        SELECT sp.id,
               sp.supplier_name,
               sp.amount,
               sp.reason,
               sp.status,
               ((sp.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(sp.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS payment_time,
               sp.created_at,
               sp.dispensed_at,
               e.name AS employee_name,
               sp.error_message
        FROM pos.supplier_payments sp
        LEFT JOIN pos.employees e ON e.id = sp.employee_id
        WHERE ((sp.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
          AND ((sp.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
        ORDER BY sp.created_at DESC, sp.id DESC
        LIMIT 10000
      `
    : await sql`
        SELECT sp.id,
               sp.supplier_name,
               sp.amount,
               sp.reason,
               sp.status,
               ((sp.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
               to_char(sp.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS payment_time,
               sp.created_at,
               sp.dispensed_at,
               e.name AS employee_name,
               sp.error_message
        FROM pos.supplier_payments sp
        LEFT JOIN pos.employees e ON e.id = sp.employee_id
        ORDER BY sp.created_at DESC, sp.id DESC
        LIMIT 10000
      `;

  return rows.map((row) => ({
    id: String(row.id),
    supplierName: String(row.supplier_name),
    amount: toNumber(row.amount),
    reason: row.reason ? String(row.reason) : null,
    status: String(row.status),
    businessDate: normalizeDate(row.business_date),
    paymentTime: String(row.payment_time),
    createdAt: normalizeDateTime(row.created_at),
    dispensedAt: row.dispensed_at == null ? null : normalizeDateTime(row.dispensed_at),
    employeeName: row.employee_name ? String(row.employee_name) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  })) satisfies SupplierPaymentRecord[];
}

export async function listPayrolls(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockPayrolls;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "payrolls"))) {
    return [];
  }
  const fromMonth = from ? from.slice(0, 7) : undefined;
  const toMonth = to ? to.slice(0, 7) : undefined;
  const rows = fromMonth && toMonth
    ? await sql`SELECT id, employee_name, pay_period, gross_amount, net_amount FROM payrolls WHERE pay_period >= ${fromMonth} AND pay_period <= ${toMonth} ORDER BY pay_period DESC`
    : await sql`SELECT id, employee_name, pay_period, gross_amount, net_amount FROM payrolls ORDER BY pay_period DESC LIMIT 200`;
  return rows.map((row) => ({
    id: String(row.id),
    employeeName: String(row.employee_name),
    payPeriod: String(row.pay_period),
    grossAmount: toNumber(row.gross_amount),
    netAmount: toNumber(row.net_amount),
  })) satisfies PayrollRecord[];
}

export async function listAlerts() {
  if (!hasDatabase()) {
    return mockAlerts;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "alerts"))) {
    return [];
  }
  const rows = await sql`SELECT id, title, description, severity, created_at FROM alerts ORDER BY created_at DESC LIMIT 10`;
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    severity: row.severity === "high" || row.severity === "medium" ? row.severity : "low",
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies AlertRecord[];
}

export async function listTelegramUsers() {
  if (!hasDatabase()) {
    return mockTelegramUsers;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "telegram_users"))) {
    return [];
  }
  const rows = await sql`SELECT id, telegram_user_id, username, display_name, is_active FROM telegram_users WHERE is_active = TRUE ORDER BY created_at ASC`;
  return rows.map((row) => ({
    id: String(row.id),
    telegramUserId: String(row.telegram_user_id),
    username: String(row.username),
    displayName: String(row.display_name),
    isActive: Boolean(row.is_active),
  })) satisfies TelegramUser[];
}

export async function listTelegramMessages() {
  if (!hasDatabase()) {
    return mockTelegramMessages;
  }

  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "telegram_messages"))) {
    return [];
  }
  const rows = await sql`SELECT id, telegram_user_id, username, question, answer, created_at FROM telegram_messages ORDER BY created_at DESC LIMIT 10`;
  return rows.map((row) => ({
    id: String(row.id),
    telegramUserId: String(row.telegram_user_id),
    username: String(row.username),
    question: String(row.question),
    answer: String(row.answer),
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies TelegramMessage[];
}

/* ---------- POS Catalog ---------- */

async function ensureCatalogChangeQueue() {
  if (!hasDatabase() || !isPosDataSource()) return;

  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS pos.catalog_change_queue (
      id TEXT PRIMARY KEY,
      entity_type VARCHAR(20) NOT NULL,
      action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'deactivate')),
      entity_id INTEGER,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'error')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requested_by TEXT,
      applied_at TIMESTAMPTZ,
      applied_entity_id INTEGER,
      error_message TEXT
    )
  `);
  await sql.query(`
    DO $$
    DECLARE
      constraint_def TEXT;
    BEGIN
      SELECT pg_get_constraintdef(c.oid)
      INTO constraint_def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'pos'
        AND t.relname = 'catalog_change_queue'
        AND c.conname = 'catalog_change_queue_entity_type_check';

      IF constraint_def IS NULL THEN
        ALTER TABLE pos.catalog_change_queue
        ADD CONSTRAINT catalog_change_queue_entity_type_check
        CHECK (entity_type IN ('category', 'product', 'modifier_group', 'employee'));
      ELSIF constraint_def NOT LIKE '%modifier_group%' OR constraint_def NOT LIKE '%employee%' THEN
        ALTER TABLE pos.catalog_change_queue
        DROP CONSTRAINT catalog_change_queue_entity_type_check;

        ALTER TABLE pos.catalog_change_queue
        ADD CONSTRAINT catalog_change_queue_entity_type_check
        CHECK (entity_type IN ('category', 'product', 'modifier_group', 'employee'));
      END IF;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
  `);
  await ensurePosModifierTables();
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_catalog_change_queue_status
    ON pos.catalog_change_queue(status, requested_at)
  `);
  await ensurePosEmployeeAccessColumns();
}

async function ensurePosModifierTables() {
  if (!hasDatabase() || !isPosDataSource()) return;

  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
      group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, category_id)
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
      product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
      included_count INTEGER NOT NULL DEFAULT 0,
      extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
    )
  `);
  await sql.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0
  `);
  await sql.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group
    ON pos.product_modifier_groups(group_id)
  `);
}

async function ensurePosEmployeeAccessColumns() {
  if (!hasDatabase() || !isPosDataSource()) return;

  const sql = getSql();
  await sql.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_cashlogy BOOLEAN NOT NULL DEFAULT true
  `);
  await sql.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true
  `);
  await sql.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_products BOOLEAN NOT NULL DEFAULT false
  `);
  await sql.query(`
    UPDATE pos.employees
    SET can_access_products = true,
        can_access_cashlogy = true,
        can_access_supplier_payments = true
    WHERE role = 'admin'
  `);
}

function mapCatalogChange(row: Record<string, unknown>): CatalogChangeRecord {
  const payload = row.payload && typeof row.payload === "object"
    ? (row.payload as Record<string, unknown>)
    : {};
  return {
    id: String(row.id),
    entityType: String(row.entity_type) as CatalogEntityType,
    action: String(row.action) as CatalogChangeAction,
    entityId: row.entity_id == null ? null : Number(row.entity_id),
    payload,
    status: String(row.status) as CatalogChangeRecord["status"],
    requestedAt: new Date(String(row.requested_at)).toISOString(),
    appliedAt: row.applied_at ? new Date(String(row.applied_at)).toISOString() : null,
    appliedEntityId: row.applied_entity_id == null ? null : Number(row.applied_entity_id),
    errorMessage: row.error_message ? String(row.error_message) : null,
  };
}

export async function listPosCatalog(): Promise<PosCatalog> {
  if (!hasDatabase() || !isPosDataSource()) {
    return {
      categories: [],
      products: [],
      modifierGroups: [],
      pendingChanges: [],
      syncStatus: { lastSyncedAt: null, ok: null, message: null },
    };
  }

  await ensureCatalogChangeQueue();
  const sql = getSql();
  const categories = await sql`
    SELECT id, name, sort_order, color
    FROM pos.categories
    ORDER BY sort_order ASC, name ASC
  `;
  const products = await sql`
    SELECT p.id, p.name, p.category_id, p.price, p.vat_rate, p.image_url, p.active, p.sort_order,
           COALESCE(c.name, 'Sense categoria') AS category_name,
           COALESCE(c.color, '#64748b') AS category_color,
           pmg.group_id AS modifier_group_id,
           pmg.included_count AS modifier_included_count,
           pmg.extra_price AS modifier_extra_price
    FROM pos.products p
    LEFT JOIN pos.categories c ON c.id = p.category_id
    LEFT JOIN pos.product_modifier_groups pmg ON pmg.product_id = p.id
    ORDER BY p.active DESC, c.sort_order ASC NULLS LAST, p.sort_order ASC, p.name ASC
  `;
  const modifierGroups = await sql`
    SELECT
      g.id,
      g.name,
      g.description,
      g.sort_order,
      g.active,
      COALESCE(
        array_agg(c.id ORDER BY mgc.sort_order, c.sort_order, c.name)
          FILTER (WHERE c.id IS NOT NULL),
        '{}'
      ) AS category_ids,
      COALESCE(
        array_agg(c.name ORDER BY mgc.sort_order, c.sort_order, c.name)
          FILTER (WHERE c.id IS NOT NULL),
        '{}'
      ) AS category_names
    FROM pos.modifier_groups g
    LEFT JOIN pos.modifier_group_categories mgc ON mgc.group_id = g.id
    LEFT JOIN pos.categories c ON c.id = mgc.category_id
    GROUP BY g.id
    ORDER BY g.sort_order ASC, g.name ASC
  `;
  const changes = await sql`
    SELECT id, entity_type, action, entity_id, payload, status, requested_at,
           applied_at, applied_entity_id, error_message
    FROM pos.catalog_change_queue
    WHERE entity_type IN ('category', 'product', 'modifier_group')
    ORDER BY requested_at DESC
    LIMIT 120
  `;
  const syncStatus = await readDashboardSyncStatus();

  return {
    categories: categories.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      sortOrder: Number(row.sort_order ?? 0),
      color: String(row.color ?? "#64748b"),
    })),
    products: products.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      categoryId: row.category_id == null ? null : Number(row.category_id),
      categoryName: String(row.category_name),
      categoryColor: String(row.category_color ?? "#64748b"),
      modifierGroupId: row.modifier_group_id == null ? null : Number(row.modifier_group_id),
      modifierIncludedCount: toNumber(row.modifier_included_count),
      modifierExtraPrice: toNumber(row.modifier_extra_price),
      price: toNumber(row.price),
      vatRate: toNumber(row.vat_rate),
      imageUrl: row.image_url ? String(row.image_url) : null,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order ?? 0),
    })),
    modifierGroups: modifierGroups.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      description: row.description == null ? null : String(row.description),
      sortOrder: Number(row.sort_order ?? 0),
      active: Boolean(row.active),
      categoryIds: normalizePgArray(row.category_ids).map(Number).filter((id) => Number.isFinite(id)),
      categoryNames: normalizePgArray(row.category_names).map(String),
    })),
    pendingChanges: changes.map(mapCatalogChange),
    syncStatus,
  };
}

async function readDashboardSyncStatus() {
  const fallback = { lastSyncedAt: null, ok: null, message: null };
  try {
    const sql = getSql();
    const exists = await sql`SELECT to_regclass('pos.dashboard_sync_status') AS table_name`;
    if (!exists[0]?.table_name) return fallback;
    const rows = await sql`
      SELECT synced_at, ok, message
      FROM pos.dashboard_sync_status
      WHERE id = 'main'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return fallback;
    return {
      lastSyncedAt: row.synced_at ? new Date(String(row.synced_at)).toISOString() : null,
      ok: row.ok == null ? null : Boolean(row.ok),
      message: row.message == null ? null : String(row.message),
    };
  } catch {
    return fallback;
  }
}

function normalizePgArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function enqueueCatalogChange(input: {
  entityType: CatalogEntityType;
  action: CatalogChangeAction;
  entityId?: number | null;
  payload: Record<string, unknown>;
  requestedBy?: string;
}) {
  if (!hasDatabase()) {
    throw new Error("No hi ha base de dades configurada.");
  }
  if (!isPosDataSource()) {
    throw new Error("El cataleg editable nomes esta disponible en mode POS.");
  }

  await ensureCatalogChangeQueue();
  const sql = getSql();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO pos.catalog_change_queue (id, entity_type, action, entity_id, payload, requested_by)
    VALUES (${id}, ${input.entityType}, ${input.action}, ${input.entityId ?? null}, ${JSON.stringify(input.payload)}::jsonb, ${input.requestedBy ?? "dashboard"})
    RETURNING id, entity_type, action, entity_id, payload, status, requested_at,
              applied_at, applied_entity_id, error_message
  `;
  return mapCatalogChange(rows[0]);
}

export async function enqueueCatalogChanges(changes: CatalogDraftChange[], requestedBy = "dashboard") {
  const created: CatalogChangeRecord[] = [];
  for (const change of changes) {
    created.push(
      await enqueueCatalogChange({
        entityType: change.entityType,
        action: change.action,
        entityId: change.entityId ?? null,
        payload: change.payload,
        requestedBy,
      }),
    );
  }
  return created;
}

/* ---------- Product Costs ---------- */

async function ensureProductCostTables() {
  if (!hasDatabase()) return;

  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS product_costs (
      id TEXT PRIMARY KEY,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Altres',
      unit_cost NUMERIC(8,4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(product_code)
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS product_cost_history (
      id TEXT PRIMARY KEY,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit_cost NUMERIC(8,4) NOT NULL,
      valid_from DATE NOT NULL,
      valid_until DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS product_cost_mappings (
      id TEXT PRIMARY KEY,
      pos_product_id TEXT NOT NULL,
      pos_product_name TEXT NOT NULL,
      pos_category TEXT NOT NULL,
      legacy_product_code TEXT,
      legacy_product_name TEXT,
      legacy_category TEXT,
      unit_cost NUMERIC(8,4) NOT NULL,
      source TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      effective_from DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_product_cost_mappings_pos_product
    ON product_cost_mappings(pos_product_id, created_at DESC)
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_cost_history_lookup
    ON product_cost_history(product_code, valid_from DESC)
  `);
}

function mapProductCost(row: Record<string, unknown>): ProductCost {
  return {
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    category: String(row.category),
    unitCost: toNumber(row.unit_cost),
  };
}

async function getFirstPosSaleDate() {
  if (!isPosDataSource()) return null;
  const sql = getSql();
  try {
    const exists = await sql.query("SELECT to_regclass('pos.orders') AS table_name");
    if (!exists[0]?.table_name) return null;
    await ensurePosBusinessUnitColumn(sql);
    const rows = await sql`
      SELECT MIN(((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date) AS first_date
      FROM pos.orders
      WHERE status <> 'cancelled'
        AND payment_method <> 'parked'
        AND COALESCE(business_unit, 'hicream') = 'hicream'
    `;
    return rows[0]?.first_date ? normalizeDate(rows[0].first_date) : null;
  } catch {
    return null;
  }
}

export async function listProductCosts() {
  if (!hasDatabase()) return [];

  const sql = getSql();
  if (isPosDataSource()) {
    if (await hasPublicTable(sql, "product_costs")) {
      const rows = await sql`
        SELECT pc.id, pc.product_code, pc.product_name, pc.category, pc.unit_cost,
               p.name AS pos_product_name
        FROM product_costs pc
        LEFT JOIN pos.products p ON p.id::text = pc.product_code
        ORDER BY pc.category ASC, pc.product_name ASC
      `;
      return rows
        .filter((row) => !row.pos_product_name || productNamesMatch(row.product_name, row.pos_product_name))
        .map(mapProductCost) satisfies ProductCost[];
    }

    const rows = await sql`
      SELECT p.id, p.name AS product_name, COALESCE(c.name, 'Sense categoria') AS category
      FROM pos.products p
      LEFT JOIN pos.categories c ON c.id = p.category_id
      WHERE p.active = TRUE
      ORDER BY c.sort_order ASC NULLS LAST, p.sort_order ASC, p.name ASC
    `;
    return rows.map((row) => ({
      id: String(row.id),
      productCode: String(row.id),
      productName: String(row.product_name),
      category: String(row.category),
      unitCost: 0,
    })) satisfies ProductCost[];
  }

  const rows = await sql`SELECT id, product_code, product_name, category, unit_cost FROM product_costs ORDER BY category ASC, product_name ASC`;
  return rows.map(mapProductCost) satisfies ProductCost[];
}

async function listAllRawProductCosts() {
  if (!hasDatabase()) return [] satisfies ProductCost[];
  await ensureProductCostTables();
  const sql = getSql();
  const rows = await sql`SELECT id, product_code, product_name, category, unit_cost FROM product_costs ORDER BY category ASC, product_name ASC`;
  return rows.map(mapProductCost) satisfies ProductCost[];
}

function buildCostCandidates(product: {
  name: string;
  categoryName: string;
}, costs: ProductCost[], currentCode: string) {
  const candidates: ProductCostCandidate[] = [];
  for (const cost of costs) {
    if (cost.productCode === currentCode && productNamesMatch(cost.productName, product.name)) continue;
    const confidence = roughNameConfidence(product.name, cost.productName);
    if (confidence < 45 || cost.unitCost <= 0) continue;
    const categoryCompatible = categoriesCompatible(product.categoryName, cost.category);
    const exactName = productNamesMatch(product.name, cost.productName);
    candidates.push({
      legacyProductCode: cost.productCode,
      legacyProductName: cost.productName,
      legacyCategory: cost.category,
      unitCost: cost.unitCost,
      confidence: exactName && categoryCompatible ? 100 : exactName ? 88 : confidence,
      matchType: exactName && categoryCompatible ? "exact" : exactName ? "same_name" : "fuzzy",
      categoryCompatible,
    });
  }
  return candidates
    .sort((a, b) => b.confidence - a.confidence || a.legacyProductName.localeCompare(b.legacyProductName))
    .slice(0, 8);
}

function chooseExactCandidate(candidates: ProductCostCandidate[]) {
  const exactCandidates = candidates.filter((candidate) => candidate.matchType === "exact" && candidate.categoryCompatible);
  const uniqueCosts = new Map<string, ProductCostCandidate>();
  for (const candidate of exactCandidates) {
    uniqueCosts.set(candidate.unitCost.toFixed(4), candidate);
  }
  if (uniqueCosts.size === 1) return [...uniqueCosts.values()][0];
  return null;
}

function calculateProductMargin(price: number, vatRate: number, unitCost: number | null) {
  if (unitCost == null) return { margin: null, marginPct: null };
  const netPrice = price / (1 + vatRate / 100);
  const margin = netPrice - unitCost;
  return {
    margin,
    marginPct: netPrice > 0 ? (margin / netPrice) * 100 : null,
  };
}

function isToppingLike(category: string, productName: string) {
  return categoryFamily(category) === "toppings" || categoryFamily(productName) === "toppings";
}

export async function listProductCostWorkspace(): Promise<ProductCostWorkspace> {
  if (!hasDatabase() || !isPosDataSource()) {
    return {
      products: [],
      categories: [],
      firstPosSaleDate: null,
      stats: { total: 0, active: 0, mapped: 0, exact: 0, review: 0, conflict: 0, missing: 0, toppings: 0 },
    };
  }

  await ensureProductCostTables();
  await ensurePosModifierTables();
  const sql = getSql();
  const [productRows, rawCosts, firstPosSaleDate] = await Promise.all([
    sql`
      SELECT p.id, p.name, p.price, p.vat_rate, p.active,
             COALESCE(c.name, 'Sense categoria') AS category_name,
             COALESCE(c.sort_order, 9999) AS category_sort,
             COALESCE(p.sort_order, 9999) AS product_sort
      FROM pos.products p
      LEFT JOIN pos.categories c ON c.id = p.category_id
      ORDER BY p.active DESC, category_sort ASC, product_sort ASC, p.name ASC
    `,
    listAllRawProductCosts(),
    getFirstPosSaleDate(),
  ]);

  const costsByCode = new Map<string, ProductCost[]>();
  for (const cost of rawCosts) {
    const list = costsByCode.get(cost.productCode) ?? [];
    list.push(cost);
    costsByCode.set(cost.productCode, list);
  }

  const products = productRows.map((row) => {
    const posProductId = String(row.id);
    const posProductName = String(row.name);
    const posCategory = String(row.category_name);
    const price = toNumber(row.price);
    const vatRate = toNumber(row.vat_rate);
    const currentCost = (costsByCode.get(posProductId) ?? [])
      .find((cost) => productNamesMatch(cost.productName, posProductName)) ?? null;
    const hasCodeConflict = (costsByCode.get(posProductId) ?? [])
      .some((cost) => !productNamesMatch(cost.productName, posProductName) && cost.unitCost > 0);
    const candidates = buildCostCandidates({ name: posProductName, categoryName: posCategory }, rawCosts, posProductId);
    const exactCandidate = chooseExactCandidate(candidates);
    const exactCandidateCosts = new Set(
      candidates
        .filter((candidate) => candidate.matchType === "exact" && candidate.categoryCompatible)
        .map((candidate) => candidate.unitCost.toFixed(4)),
    );
    const status: ProductCostReconcileRow["status"] = currentCost && currentCost.unitCost > 0
      ? "mapped"
      : exactCandidate
        ? "exact"
        : exactCandidateCosts.size > 1 || hasCodeConflict
          ? "conflict"
          : candidates.length > 0
            ? "review"
            : "missing";
    const effectiveCost = currentCost?.unitCost ?? exactCandidate?.unitCost ?? null;
    const { margin, marginPct } = calculateProductMargin(price, vatRate, effectiveCost);
    return {
      posProductId,
      posProductName,
      posCategory,
      price,
      vatRate,
      active: Boolean(row.active),
      isTopping: isToppingLike(posCategory, posProductName),
      unitCost: currentCost?.unitCost ?? null,
      margin,
      marginPct,
      status,
      currentCost,
      exactCandidate,
      candidates,
      hasCodeConflict,
    } satisfies ProductCostReconcileRow;
  });

  const stats = products.reduce<ProductCostWorkspace["stats"]>((acc, product) => {
    acc.total += 1;
    if (product.active) acc.active += 1;
    if (product.isTopping) acc.toppings += 1;
    acc[product.status] += 1;
    return acc;
  }, { total: 0, active: 0, mapped: 0, exact: 0, review: 0, conflict: 0, missing: 0, toppings: 0 });

  return {
    products,
    categories: [...new Set(products.map((product) => product.posCategory))].sort(),
    firstPosSaleDate,
    stats,
  };
}

async function recordProductCostMapping(input: {
  posProductId: string;
  posProductName: string;
  posCategory: string;
  legacyProductCode?: string | null;
  legacyProductName?: string | null;
  legacyCategory?: string | null;
  unitCost: number;
  source: string;
  confidence?: number;
  effectiveFrom: string;
}) {
  await ensureProductCostTables();
  const sql = getSql();
  await sql`
    INSERT INTO product_cost_mappings (
      id, pos_product_id, pos_product_name, pos_category,
      legacy_product_code, legacy_product_name, legacy_category,
      unit_cost, source, confidence, effective_from
    )
    VALUES (
      ${randomUUID()}, ${input.posProductId}, ${input.posProductName}, ${input.posCategory},
      ${input.legacyProductCode ?? null}, ${input.legacyProductName ?? null}, ${input.legacyCategory ?? null},
      ${input.unitCost}, ${input.source}, ${input.confidence ?? 0}, ${input.effectiveFrom}
    )
  `;
}

export async function applyExactProductCosts() {
  const workspace = await listProductCostWorkspace();
  const effectiveFrom = workspace.firstPosSaleDate ?? todayIsoLocal();
  let applied = 0;
  for (const product of workspace.products) {
    if (product.status !== "exact" || !product.exactCandidate) continue;
    await upsertProductCost({
      productCode: product.posProductId,
      productName: product.posProductName,
      category: product.posCategory,
      unitCost: product.exactCandidate.unitCost,
      effectiveFrom,
      mapping: {
        source: "exact",
        confidence: product.exactCandidate.confidence,
        legacyProductCode: product.exactCandidate.legacyProductCode,
        legacyProductName: product.exactCandidate.legacyProductName,
        legacyCategory: product.exactCandidate.legacyCategory,
      },
    });
    applied += 1;
  }
  return { applied, workspace: await listProductCostWorkspace() };
}

export async function applyProductCostAssignments(input: {
  items: Array<{
    posProductId: string;
    unitCost?: number | null;
    legacyProductCode?: string | null;
    effectiveFrom?: string | null;
  }>;
}) {
  const workspace = await listProductCostWorkspace();
  const byId = new Map(workspace.products.map((product) => [product.posProductId, product]));
  const effectiveFallback = todayIsoLocal();
  let applied = 0;

  for (const item of input.items) {
    const product = byId.get(String(item.posProductId));
    if (!product) continue;

    const candidate = item.legacyProductCode
      ? product.candidates.find((entry) => entry.legacyProductCode === String(item.legacyProductCode))
      : null;
    const unitCost = candidate ? candidate.unitCost : Number(item.unitCost ?? NaN);
    if (!Number.isFinite(unitCost) || unitCost < 0) continue;
    const effectiveFrom = item.effectiveFrom ? String(item.effectiveFrom) : effectiveFallback;

    await upsertProductCost({
      productCode: product.posProductId,
      productName: product.posProductName,
      category: product.posCategory,
      unitCost,
      effectiveFrom,
      mapping: {
        source: candidate ? "candidate" : "manual",
        confidence: candidate?.confidence ?? 0,
        legacyProductCode: candidate?.legacyProductCode ?? null,
        legacyProductName: candidate?.legacyProductName ?? null,
        legacyCategory: candidate?.legacyCategory ?? null,
      },
    });
    applied += 1;
  }

  return { applied, workspace: await listProductCostWorkspace() };
}

/** Updates or creates a product cost and logs the change in the history
 * table so future food-cost calculations can use the cost that was valid at
 * the sale's business_date. effectiveFrom defaults to today; pass an earlier
 * date if you're backfilling a known historical price. */
export async function upsertProductCost(input: {
  productCode: string;
  productName: string;
  category: string;
  unitCost: number;
  effectiveFrom?: string; // YYYY-MM-DD, defaults to today
  mapping?: {
    source: string;
    confidence?: number;
    legacyProductCode?: string | null;
    legacyProductName?: string | null;
    legacyCategory?: string | null;
  };
}) {
  if (!hasDatabase()) return;
  await ensureProductCostTables();

  const sql = getSql();
  const effective = input.effectiveFrom ?? todayIsoLocal();

  // Look up the currently-valid history row (if any). If the cost is
  // unchanged we can skip the history write entirely.
  const existing = await sql`
    SELECT id, unit_cost FROM product_cost_history
    WHERE product_code = ${input.productCode} AND valid_until IS NULL
    LIMIT 1
  `;
  const currentCost = existing[0] ? Number(existing[0].unit_cost) : null;
  const costChanged = currentCost === null || Math.abs(currentCost - input.unitCost) > 0.00005;

  if (costChanged) {
    if (existing[0]) {
      // Close the previous version right before the new effective date.
      // valid_until is exclusive in our lookup (valid_until > sale_date), so
      // setting it to the effective date closes the old cost on that day.
      await sql`
        UPDATE product_cost_history
        SET valid_until = ${effective}
        WHERE id = ${String(existing[0].id)}
      `;
    }
    await sql`
      INSERT INTO product_cost_history (id, product_code, product_name, unit_cost, valid_from, valid_until)
      VALUES (${randomUUID()}, ${input.productCode}, ${input.productName}, ${input.unitCost}, ${effective}, NULL)
    `;
  }

  // Keep the flat product_costs table in sync as the "current cost" view.
  const flatId = randomUUID();
  await sql`
    INSERT INTO product_costs (id, product_code, product_name, category, unit_cost, updated_at)
    VALUES (${flatId}, ${input.productCode}, ${input.productName}, ${input.category}, ${input.unitCost}, NOW())
    ON CONFLICT (product_code)
    DO UPDATE SET product_name = EXCLUDED.product_name, category = EXCLUDED.category, unit_cost = EXCLUDED.unit_cost, updated_at = NOW()
  `;

  if (input.mapping) {
    await recordProductCostMapping({
      posProductId: input.productCode,
      posProductName: input.productName,
      posCategory: input.category,
      legacyProductCode: input.mapping.legacyProductCode ?? null,
      legacyProductName: input.mapping.legacyProductName ?? null,
      legacyCategory: input.mapping.legacyCategory ?? null,
      unitCost: input.unitCost,
      source: input.mapping.source,
      confidence: input.mapping.confidence ?? 0,
      effectiveFrom: effective,
    });
  }
}

/** Returns the full cost history for a product, newest first. Used in the
 * product detail UI so the owner can audit when a price changed. */
export async function listProductCostHistory(productCode: string) {
  if (!hasDatabase()) return [];
  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "product_cost_history"))) return [];
  const rows = await sql`
    SELECT id, product_code, product_name, unit_cost, valid_from, valid_until, created_at
    FROM product_cost_history
    WHERE product_code = ${productCode}
    ORDER BY valid_from DESC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    unitCost: toNumber(row.unit_cost),
    validFrom: normalizeDate(row.valid_from),
    validUntil: row.valid_until ? normalizeDate(row.valid_until) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies ProductCostHistoryEntry[];
}

/** Returns every historical cost entry across all products. Used by the
 * analytics layer to resolve the cost valid at each sale's business_date
 * without issuing one query per sale. */
export async function listAllProductCostHistory() {
  if (!hasDatabase()) return [];
  const sql = getSql();
  if (isPosDataSource() && !(await hasPublicTable(sql, "product_cost_history"))) return [];
  const firstPosSaleDate = isPosDataSource() ? await getFirstPosSaleDate() : null;
  const rows = isPosDataSource()
    ? await sql`
        SELECT pch.id, pch.product_code, pch.product_name, pch.unit_cost,
               pch.valid_from, pch.valid_until, pch.created_at,
               p.name AS pos_product_name
        FROM product_cost_history pch
        LEFT JOIN pos.products p ON p.id::text = pch.product_code
        ORDER BY pch.product_code ASC, pch.valid_from DESC
      `
    : await sql`
        SELECT id, product_code, product_name, unit_cost, valid_from, valid_until, created_at,
               NULL AS pos_product_name
        FROM product_cost_history
        ORDER BY product_code ASC, valid_from DESC
      `;
  return rows.map((row) => ({
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    unitCost: toNumber(row.unit_cost),
    validFrom: normalizeDate(row.valid_from),
    validUntil: row.valid_until
      ? normalizeDate(row.valid_until)
      : firstPosSaleDate && row.pos_product_name && !productNamesMatch(row.product_name, row.pos_product_name)
        ? firstPosSaleDate
        : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies ProductCostHistoryEntry[];
}

/** Backfills product_cost_history from the flat product_costs table for any
 * product that doesn't yet have a history row. Used once during the initial
 * migration to historify costs that were entered before this feature. The
 * resulting row has valid_from = 2023-01-01 (i.e. "always applied") so
 * existing food-cost calculations don't change value. */
export async function backfillProductCostHistoryOnce() {
  if (!hasDatabase()) return { inserted: 0 };
  assertLegacyWritable();
  const sql = getSql();
  const result = await sql`
    INSERT INTO product_cost_history (id, product_code, product_name, unit_cost, valid_from, valid_until)
    SELECT
      gen_random_uuid()::text,
      pc.product_code,
      pc.product_name,
      pc.unit_cost,
      '2023-01-01'::date,
      NULL
    FROM product_costs pc
    WHERE NOT EXISTS (
      SELECT 1 FROM product_cost_history pch WHERE pch.product_code = pc.product_code
    )
    RETURNING id
  `;
  return { inserted: (result as unknown[]).length };
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- Employees ---------- */

let employeeCostTablesEnsured = false;

async function ensureEmployeeCostTables() {
  if (employeeCostTablesEnsured || !hasDatabase()) return;
  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS employee_hourly_cost_history (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      employee_name_snapshot TEXT NOT NULL,
      hourly_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      valid_from DATE NOT NULL,
      valid_until DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(employee_id, valid_from)
    )
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_employee_hourly_cost_history_employee_date
      ON employee_hourly_cost_history(employee_id, valid_from DESC)
  `);
  employeeCostTablesEnsured = true;
}

async function listEmployeeCurrentCostMap(atDate = todayIsoLocal()) {
  if (!hasDatabase()) return new Map<string, number>();
  await ensureEmployeeCostTables();
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT ON (employee_id) employee_id, hourly_cost
    FROM employee_hourly_cost_history
    WHERE valid_from <= ${atDate}::date
      AND (valid_until IS NULL OR valid_until > ${atDate}::date)
    ORDER BY employee_id, valid_from DESC
  `;
  return new Map(rows.map((row) => [String(row.employee_id), toNumber(row.hourly_cost)]));
}

export async function listEmployeeHourlyCostHistory(employeeId?: string) {
  if (!hasDatabase()) return [] satisfies EmployeeHourlyCostHistoryEntry[];
  await ensureEmployeeCostTables();
  const sql = getSql();
  const rows = employeeId
    ? await sql`
        SELECT id, employee_id, employee_name_snapshot, hourly_cost,
               valid_from, valid_until, created_at, updated_at
        FROM employee_hourly_cost_history
        WHERE employee_id = ${employeeId}
        ORDER BY valid_from DESC, created_at DESC
      `
    : await sql`
        SELECT id, employee_id, employee_name_snapshot, hourly_cost,
               valid_from, valid_until, created_at, updated_at
        FROM employee_hourly_cost_history
        ORDER BY employee_id ASC, valid_from DESC
      `;
  return rows.map(mapEmployeeHourlyCostHistoryEntry);
}

export async function listAllEmployeeHourlyCostHistory() {
  return listEmployeeHourlyCostHistory();
}

export async function upsertEmployeeHourlyCost(input: {
  employeeId: string;
  hourlyCost: number;
  validFrom: string;
  employeeName?: string;
}) {
  if (!hasDatabase()) return;
  await ensureEmployeeCostTables();

  const employeeId = String(input.employeeId ?? "").trim();
  const hourlyCost = Number(input.hourlyCost);
  const validFrom = String(input.validFrom ?? "").trim();
  if (!employeeId) throw new Error("Falta el empleado.");
  if (!Number.isFinite(hourlyCost) || hourlyCost < 0) throw new Error("Coste/hora no valido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) throw new Error("Fecha de vigencia no valida.");

  const sql = getSql();
  const employeeName = input.employeeName?.trim() || await resolveEmployeeNameSnapshot(sql, employeeId);
  const nextRows = await sql`
    SELECT valid_from
    FROM employee_hourly_cost_history
    WHERE employee_id = ${employeeId}
      AND valid_from > ${validFrom}::date
    ORDER BY valid_from ASC
    LIMIT 1
  `;
  const nextValidUntil = nextRows[0]?.valid_from ? normalizeDate(nextRows[0].valid_from) : null;

  await sql`
    UPDATE employee_hourly_cost_history
    SET valid_until = ${validFrom}::date,
        updated_at = NOW()
    WHERE employee_id = ${employeeId}
      AND valid_from < ${validFrom}::date
      AND (valid_until IS NULL OR valid_until > ${validFrom}::date)
  `;

  await sql`
    INSERT INTO employee_hourly_cost_history
      (id, employee_id, employee_name_snapshot, hourly_cost, valid_from, valid_until)
    VALUES
      (${randomUUID()}, ${employeeId}, ${employeeName}, ${hourlyCost}, ${validFrom}, ${nextValidUntil})
    ON CONFLICT (employee_id, valid_from)
    DO UPDATE SET
      employee_name_snapshot = EXCLUDED.employee_name_snapshot,
      hourly_cost = EXCLUDED.hourly_cost,
      valid_until = EXCLUDED.valid_until,
      updated_at = NOW()
  `;
}

async function resolveEmployeeNameSnapshot(sql: DashboardSql, employeeId: string) {
  if (isPosDataSource() && await hasPosTable(sql, "employees")) {
    const rows = await sql`SELECT name FROM pos.employees WHERE id::text = ${employeeId} LIMIT 1`;
    if (rows[0]?.name) return String(rows[0].name);
  }
  if (await hasPublicTable(sql, "employees")) {
    const rows = await sql`SELECT name FROM employees WHERE id = ${employeeId} LIMIT 1`;
    if (rows[0]?.name) return String(rows[0].name);
  }
  return employeeId;
}

function mapEmployeeHourlyCostHistoryEntry(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeNameSnapshot: String(row.employee_name_snapshot),
    hourlyCost: toNumber(row.hourly_cost),
    validFrom: normalizeDate(row.valid_from),
    validUntil: row.valid_until ? normalizeDate(row.valid_until) : null,
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
  } satisfies EmployeeHourlyCostHistoryEntry;
}

export async function listEmployees() {
  if (!hasDatabase()) {
    return mockEmployees;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    await ensurePosEmployeeAccessColumns();
    const currentCostMap = await listEmployeeCurrentCostMap();
    const rows = await sql`
      SELECT id, name, role, active,
             can_access_cashlogy, can_access_supplier_payments, can_access_products
      FROM pos.employees
      WHERE active = TRUE
      ORDER BY name ASC
    `;
    const employees = rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      shiftStart: "00:00",
      shiftEnd: "00:00",
      workingDaysPerMonth: 0,
      hourlyCost: currentCostMap.get(String(row.id)) ?? 0,
      isActive: Boolean(row.active),
      createdAt: "1970-01-01T00:00:00.000Z",
      role: String(row.role) === "admin" ? "admin" : "employee",
      canAccessCashlogy: Boolean(row.can_access_cashlogy),
      canAccessSupplierPayments: Boolean(row.can_access_supplier_payments),
      canAccessProducts: Boolean(row.can_access_products),
    })) satisfies Employee[];
    return mergePendingEmployeeChanges(sql, employees);
  }

  const currentCostMap = await listEmployeeCurrentCostMap();
  const rows = await sql`SELECT id, name, shift_start, shift_end, working_days_per_month, hourly_cost, is_active, created_at FROM employees WHERE is_active = TRUE ORDER BY name ASC`;
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
    workingDaysPerMonth: Number(row.working_days_per_month),
    hourlyCost: currentCostMap.get(String(row.id)) ?? toNumber(row.hourly_cost),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies Employee[];
}

async function mergePendingEmployeeChanges(sql: ReturnType<typeof getSql>, employees: Employee[]) {
  await ensureCatalogChangeQueue();
  const pending = await sql`
    SELECT id, action, entity_id, payload, requested_at
    FROM pos.catalog_change_queue
    WHERE entity_type = 'employee'
      AND status = 'pending'
    ORDER BY requested_at ASC
  `;
  if (!pending.length) return employees;

  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const extraEmployees: Employee[] = [];

  for (const change of pending) {
    const payload = normalizeJsonObject(change.payload) ?? {};
    const action = String(change.action) as CatalogChangeAction;
    const entityId = change.entity_id == null ? null : String(change.entity_id);
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const role = payload.role === "admin" ? "admin" : "employee";
    const access = employeeAccessFromPayload(payload, role);
    const requestedAt = normalizeDateTime(change.requested_at);

    if (action === "create") {
      extraEmployees.push({
        id: `pending:${String(change.id)}`,
        name: name || "Nuevo empleado",
        shiftStart: "00:00",
        shiftEnd: "00:00",
        workingDaysPerMonth: 0,
        hourlyCost: 0,
        isActive: true,
        createdAt: requestedAt,
        role,
        canAccessCashlogy: access.canAccessCashlogy,
        canAccessSupplierPayments: access.canAccessSupplierPayments,
        canAccessProducts: access.canAccessProducts,
        syncStatus: "pending",
        pendingAction: "create",
      });
      continue;
    }

    if (!entityId) continue;
    const current = byId.get(entityId);
    if (!current) continue;
    const currentAccess = employeeAccessFromPayload(payload, role, current);

    byId.set(entityId, {
      ...current,
      name: name || current.name,
      role,
      canAccessCashlogy: currentAccess.canAccessCashlogy,
      canAccessSupplierPayments: currentAccess.canAccessSupplierPayments,
      canAccessProducts: currentAccess.canAccessProducts,
      syncStatus: "pending",
      pendingAction: action,
    });
  }

  return [...Array.from(byId.values()), ...extraEmployees].sort((a, b) => {
    if (a.syncStatus === "pending" && b.syncStatus !== "pending") return -1;
    if (a.syncStatus !== "pending" && b.syncStatus === "pending") return 1;
    return a.name.localeCompare(b.name, "ca");
  });
}

function employeeAccessFromPayload(
  payload: Record<string, unknown>,
  role: "admin" | "employee",
  fallback?: Pick<Employee, "canAccessCashlogy" | "canAccessSupplierPayments" | "canAccessProducts">,
) {
  const isAdmin = role === "admin";
  return {
    canAccessCashlogy:
      payload.can_access_cashlogy == null
        ? fallback?.canAccessCashlogy ?? isAdmin
        : Boolean(payload.can_access_cashlogy),
    canAccessSupplierPayments:
      payload.can_access_supplier_payments == null
        ? fallback?.canAccessSupplierPayments ?? isAdmin
        : Boolean(payload.can_access_supplier_payments),
    canAccessProducts:
      payload.can_access_products == null
        ? fallback?.canAccessProducts ?? isAdmin
        : Boolean(payload.can_access_products),
  };
}

function employeeAccessFromInput(
  input: {
    canAccessCashlogy?: boolean;
    canAccessSupplierPayments?: boolean;
    canAccessProducts?: boolean;
  },
  role: "admin" | "employee",
) {
  const isAdmin = role === "admin";
  return {
    canAccessCashlogy: input.canAccessCashlogy ?? isAdmin,
    canAccessSupplierPayments: input.canAccessSupplierPayments ?? isAdmin,
    canAccessProducts: input.canAccessProducts ?? isAdmin,
  };
}

export async function createEmployee(input: {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  workingDaysPerMonth: number;
  hourlyCost: number;
  pin?: string;
  role?: "admin" | "employee";
  canAccessCashlogy?: boolean;
  canAccessSupplierPayments?: boolean;
  canAccessProducts?: boolean;
}) {
  const id = randomUUID();

  if (!hasDatabase()) {
    return { id, ...input, isActive: true, createdAt: new Date().toISOString() } satisfies Employee;
  }
  if (isPosDataSource()) {
    const name = input.name.trim();
    if (!name) throw new Error("Falta el nombre del empleado.");
    const pin = normalizeEmployeePin(input.pin);
    if (!pin) throw new Error("El PIN ha de tenir 4 numeros.");
    const role = input.role === "admin" ? "admin" : "employee";
    const access = employeeAccessFromInput(input, role);
    await enqueueCatalogChange({
      entityType: "employee",
      action: "create",
      payload: {
        name,
        pin,
        role,
        can_access_cashlogy: access.canAccessCashlogy,
        can_access_supplier_payments: access.canAccessSupplierPayments,
        can_access_products: access.canAccessProducts,
      },
      requestedBy: "dashboard-empleados",
    });
    return {
      id,
      name,
      shiftStart: "00:00",
      shiftEnd: "00:00",
      workingDaysPerMonth: 0,
      hourlyCost: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      role,
      canAccessCashlogy: access.canAccessCashlogy,
      canAccessSupplierPayments: access.canAccessSupplierPayments,
      canAccessProducts: access.canAccessProducts,
    } satisfies Employee;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`
    INSERT INTO employees (id, name, shift_start, shift_end, working_days_per_month, hourly_cost)
    VALUES (${id}, ${input.name}, ${input.shiftStart}, ${input.shiftEnd}, ${input.workingDaysPerMonth}, ${input.hourlyCost})
  `;

  return { id, ...input, isActive: true, createdAt: new Date().toISOString() } satisfies Employee;
}

export async function updateEmployee(
  id: string,
  input: {
    name: string;
    shiftStart: string;
    shiftEnd: string;
    workingDaysPerMonth: number;
    hourlyCost: number;
    pin?: string;
    role?: "admin" | "employee";
    canAccessCashlogy?: boolean;
    canAccessSupplierPayments?: boolean;
    canAccessProducts?: boolean;
  },
) {
  if (!hasDatabase()) return;
  if (isPosDataSource()) {
    const employeeId = Number(id);
    const name = input.name.trim();
    if (!Number.isInteger(employeeId) || employeeId <= 0) throw new Error("Empleado POS no valido.");
    if (!name) throw new Error("Falta el nombre del empleado.");
    const role = input.role === "admin" ? "admin" : "employee";
    const access = employeeAccessFromInput(input, role);
    const payload: Record<string, unknown> = {
      name,
      role,
      can_access_cashlogy: access.canAccessCashlogy,
      can_access_supplier_payments: access.canAccessSupplierPayments,
      can_access_products: access.canAccessProducts,
    };
    const pin = normalizeEmployeePin(input.pin);
    if (input.pin && !pin) throw new Error("El PIN ha de tenir 4 numeros.");
    if (pin) payload.pin = pin;

    await enqueueCatalogChange({
      entityType: "employee",
      action: "update",
      entityId: employeeId,
      payload,
      requestedBy: "dashboard-empleados",
    });
    return;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`
    UPDATE employees
    SET name = ${input.name}, shift_start = ${input.shiftStart}, shift_end = ${input.shiftEnd}, working_days_per_month = ${input.workingDaysPerMonth}, hourly_cost = ${input.hourlyCost}
    WHERE id = ${id}
  `;
}

export async function deleteEmployee(id: string) {
  if (!hasDatabase()) return;
  if (isPosDataSource()) {
    const employeeId = Number(id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) throw new Error("Empleado POS no valido.");
    await enqueueCatalogChange({
      entityType: "employee",
      action: "deactivate",
      entityId: employeeId,
      payload: {},
      requestedBy: "dashboard-empleados",
    });
    return;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`UPDATE employees SET is_active = FALSE WHERE id = ${id}`;
}

/* ---------- Employee Shifts ---------- */

export async function listEmployeeShifts(from?: string, to?: string) {
  if (!hasDatabase()) return [];

  const sql = getSql();
  if (isPosDataSource() && (!(await hasPublicTable(sql, "employee_shifts")) || !(await hasPublicTable(sql, "employees")))) return [];
  const rows = from && to
    ? await sql`SELECT s.id, s.employee_id, e.name AS employee_name, s.business_date, s.shift_start, s.shift_end FROM employee_shifts s JOIN employees e ON e.id = s.employee_id WHERE s.business_date >= ${from} AND s.business_date <= ${to} ORDER BY s.business_date DESC, e.name ASC`
    : await sql`SELECT s.id, s.employee_id, e.name AS employee_name, s.business_date, s.shift_start, s.shift_end FROM employee_shifts s JOIN employees e ON e.id = s.employee_id ORDER BY s.business_date DESC, e.name ASC LIMIT 200`;
  return rows.map((row) => ({
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    businessDate: normalizeDate(row.business_date),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
  })) satisfies EmployeeShift[];
}

/* ---------- Employee Schedule Planning ---------- */

let employeeScheduleTablesEnsured = false;

async function ensureEmployeeScheduleTables() {
  if (employeeScheduleTablesEnsured || !hasDatabase()) return;
  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS employee_schedule_shifts (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      business_date DATE NOT NULL,
      shift_start TEXT NOT NULL,
      shift_end TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(employee_id, business_date)
    )
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_employee_schedule_shifts_business_date
      ON employee_schedule_shifts(business_date DESC)
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS employee_schedule_links (
      employee_id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  employeeScheduleTablesEnsured = true;
}

export async function listEmployeeScheduleShifts(from?: string, to?: string) {
  if (!hasDatabase()) return [] satisfies EmployeeScheduleShift[];

  await ensureEmployeeScheduleTables();
  const sql = getSql();
  const canJoinPosEmployees = isPosDataSource() && await hasPosTable(sql, "employees");
  const canJoinLegacyEmployees = !isPosDataSource() && await hasPublicTable(sql, "employees");

  const employeeNameSelect = canJoinPosEmployees || canJoinLegacyEmployees
    ? "COALESCE(e.name, s.employee_id)"
    : "s.employee_id";
  const employeeJoin = canJoinPosEmployees
    ? "LEFT JOIN pos.employees e ON e.id::text = s.employee_id"
    : canJoinLegacyEmployees
      ? "LEFT JOIN employees e ON e.id = s.employee_id"
      : "";
  const where = from && to ? "WHERE s.business_date >= $1::date AND s.business_date <= $2::date" : "";
  const params = from && to ? [from, to] : [];

  const rows = await sql.query(
    `
      SELECT s.id, s.employee_id, ${employeeNameSelect} AS employee_name,
             s.business_date, s.shift_start, s.shift_end, s.created_at, s.updated_at
      FROM employee_schedule_shifts s
      ${employeeJoin}
      ${where}
      ORDER BY s.business_date ASC, employee_name ASC
    `,
    params,
  );

  return rows.map(mapEmployeeScheduleShift);
}

export async function ensureEmployeeScheduleLinks(employeeIds: string[]) {
  if (!hasDatabase()) return [] satisfies EmployeeScheduleShare[];
  const uniqueIds = [...new Set(employeeIds.filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return [] satisfies EmployeeScheduleShare[];

  await ensureEmployeeScheduleTables();
  const sql = getSql();

  for (const employeeId of uniqueIds) {
    await sql`
      INSERT INTO employee_schedule_links (employee_id, token)
      VALUES (${employeeId}, ${createScheduleToken()})
      ON CONFLICT (employee_id) DO NOTHING
    `;
  }

  const rows = await sql.query(
    `
    SELECT employee_id, token, created_at
    FROM employee_schedule_links
    WHERE employee_id = ANY($1::text[])
  `,
    [uniqueIds],
  );

  return rows.map((row) => ({
    employeeId: String(row.employee_id),
    token: String(row.token),
    createdAt: normalizeDateTime(row.created_at),
  })) satisfies EmployeeScheduleShare[];
}

export async function getEmployeeScheduleByToken(token: string, from: string, to: string) {
  if (!hasDatabase() || !token || !/^[a-zA-Z0-9_-]{20,80}$/.test(token)) return null;

  await ensureEmployeeScheduleTables();
  const sql = getSql();
  const linkRows = await sql`
    SELECT employee_id, token, created_at
    FROM employee_schedule_links
    WHERE token = ${token}
    LIMIT 1
  `;
  const link = linkRows[0];
  if (!link) return null;

  const employeeId = String(link.employee_id);
  const employees = await listEmployees();
  const employee = employees.find((item) => item.id === employeeId);
  if (!employee) return null;

  const shifts = (await listEmployeeScheduleShifts(from, to))
    .filter((shift) => shift.employeeId === employeeId);

  return {
    employee,
    share: {
      employeeId,
      token: String(link.token),
      createdAt: normalizeDateTime(link.created_at),
    } satisfies EmployeeScheduleShare,
    shifts,
  };
}

export async function upsertEmployeeScheduleShift(input: {
  employeeId: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
}) {
  if (!hasDatabase()) return;
  validateScheduleShiftInput(input);
  await ensureEmployeeScheduleTables();

  const sql = getSql();
  const id = randomUUID();
  await sql`
    INSERT INTO employee_schedule_shifts (id, employee_id, business_date, shift_start, shift_end)
    VALUES (${id}, ${input.employeeId}, ${input.businessDate}, ${input.shiftStart}, ${input.shiftEnd})
    ON CONFLICT (employee_id, business_date)
    DO UPDATE SET
      shift_start = EXCLUDED.shift_start,
      shift_end = EXCLUDED.shift_end,
      updated_at = NOW()
  `;
}

export async function deleteEmployeeScheduleShift(employeeId: string, businessDate: string) {
  if (!hasDatabase()) return;
  await ensureEmployeeScheduleTables();

  const sql = getSql();
  await sql`
    DELETE FROM employee_schedule_shifts
    WHERE employee_id = ${employeeId}
      AND business_date = ${businessDate}
  `;
}

function mapEmployeeScheduleShift(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    businessDate: normalizeDate(row.business_date),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
  } satisfies EmployeeScheduleShift;
}

function createScheduleToken() {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 12);
}

function validateScheduleShiftInput(input: {
  employeeId: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
}) {
  if (!input.employeeId || !input.businessDate || !input.shiftStart || !input.shiftEnd) {
    throw new Error("Faltan campos obligatorios.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
    throw new Error("Fecha no valida.");
  }
  const start = parseTimeMinutes(input.shiftStart);
  const end = parseTimeMinutes(input.shiftEnd);
  if (start == null || end == null) {
    throw new Error("Hora no valida.");
  }
  if (end <= start) {
    throw new Error("La hora fin debe ser posterior a la hora inicio.");
  }
}

function parseTimeMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/* ---------- Time Clock ---------- */

export async function listTimeClockSessions(from?: string, to?: string) {
  if (!hasDatabase() || !isPosDataSource()) return [];

  const sql = getSql();
  if (!(await hasPosTable(sql, "time_clock_sessions"))) return [];

  const rows = from && to
    ? await sql`
        SELECT s.id, s.employee_id, e.name AS employee_name, s.business_date,
               s.clock_in_at, s.clock_out_at, s.status, s.source, s.device_name,
               s.created_at, s.updated_at,
               CASE
                 WHEN s.clock_out_at IS NULL THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - s.clock_in_at)) / 60)
                 ELSE FLOOR(EXTRACT(EPOCH FROM (s.clock_out_at - s.clock_in_at)) / 60)
               END::int AS duration_minutes
        FROM pos.time_clock_sessions s
        JOIN pos.employees e ON e.id = s.employee_id
        WHERE s.business_date >= ${from}::date
          AND s.business_date <= ${to}::date
        ORDER BY s.business_date DESC, s.clock_in_at DESC
      `
    : await sql`
        SELECT s.id, s.employee_id, e.name AS employee_name, s.business_date,
               s.clock_in_at, s.clock_out_at, s.status, s.source, s.device_name,
               s.created_at, s.updated_at,
               CASE
                 WHEN s.clock_out_at IS NULL THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - s.clock_in_at)) / 60)
                 ELSE FLOOR(EXTRACT(EPOCH FROM (s.clock_out_at - s.clock_in_at)) / 60)
               END::int AS duration_minutes
        FROM pos.time_clock_sessions s
        JOIN pos.employees e ON e.id = s.employee_id
        ORDER BY s.business_date DESC, s.clock_in_at DESC
        LIMIT 500
      `;

  return rows.map(mapTimeClockSession);
}

export async function listTimeClockAudit(sessionId?: string) {
  if (!hasDatabase() || !isPosDataSource()) return [];

  const sql = getSql();
  if (!(await hasPosTable(sql, "time_clock_audit"))) return [];

  const rows = sessionId
    ? await sql`
        SELECT a.*, e.name AS employee_name
        FROM pos.time_clock_audit a
        LEFT JOIN pos.employees e ON e.id = a.employee_id
        WHERE a.session_id = ${Number(sessionId)}
        ORDER BY a.created_at DESC
      `
    : await sql`
        SELECT a.*, e.name AS employee_name
        FROM pos.time_clock_audit a
        LEFT JOIN pos.employees e ON e.id = a.employee_id
        ORDER BY a.created_at DESC
        LIMIT 100
      `;

  return rows.map((row) => ({
    id: String(row.id),
    sessionId: row.session_id == null ? null : String(row.session_id),
    employeeId: row.employee_id == null ? null : String(row.employee_id),
    employeeName: row.employee_name == null ? null : String(row.employee_name),
    action: String(row.action),
    previousData: normalizeJsonObject(row.previous_data),
    newData: normalizeJsonObject(row.new_data),
    reason: row.reason == null ? null : String(row.reason),
    changedBy: row.changed_by == null ? null : String(row.changed_by),
    createdAt: normalizeDateTime(row.created_at),
  })) satisfies TimeClockAuditRecord[];
}

export async function upsertEmployeeShift(input: {
  employeeId: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
}) {
  if (!hasDatabase()) return;
  assertLegacyWritable();

  const sql = getSql();
  const id = randomUUID();
  await sql`
    INSERT INTO employee_shifts (id, employee_id, business_date, shift_start, shift_end)
    VALUES (${id}, ${input.employeeId}, ${input.businessDate}, ${input.shiftStart}, ${input.shiftEnd})
    ON CONFLICT (employee_id, business_date)
    DO UPDATE SET shift_start = EXCLUDED.shift_start, shift_end = EXCLUDED.shift_end
  `;
}

export async function deleteEmployeeShift(employeeId: string, businessDate: string) {
  if (!hasDatabase()) return;
  assertLegacyWritable();

  const sql = getSql();
  await sql`DELETE FROM employee_shifts WHERE employee_id = ${employeeId} AND business_date = ${businessDate}`;
}

function normalizeEmployeePin(value: unknown) {
  const pin = String(value ?? "").trim();
  return /^\d{4}$/.test(pin) ? pin : null;
}

export async function findTelegramUser(telegramUserId: string) {
  const users = await listTelegramUsers();
  return users.find((user) => user.telegramUserId === telegramUserId && user.isActive) ?? null;
}

export async function getSyncState(syncKey: string) {
  if (!hasDatabase()) {
    return null;
  }
  if (isPosDataSource()) {
    return null;
  }

  const sql = getSql();
  const rows = await sql`SELECT sync_value FROM sync_state WHERE sync_key = ${syncKey} LIMIT 1`;
  return rows[0] ? String(rows[0].sync_value) : null;
}

export async function setSyncState(syncKey: string, syncValue: string) {
  if (!hasDatabase()) {
    return;
  }
  if (isPosDataSource()) {
    return;
  }

  const sql = getSql();
  await sql`
    INSERT INTO sync_state (sync_key, sync_value, updated_at)
    VALUES (${syncKey}, ${syncValue}, NOW())
    ON CONFLICT (sync_key)
    DO UPDATE SET sync_value = EXCLUDED.sync_value, updated_at = NOW()
  `;
}

export async function storeTelegramMessage(input: {
  telegramUserId: string;
  chatId: string;
  username: string;
  question: string;
  answer: string;
}) {
  if (!hasDatabase()) {
    return;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`
    INSERT INTO telegram_messages (id, telegram_user_id, chat_id, username, question, answer)
    VALUES (${randomUUID()}, ${input.telegramUserId}, ${input.chatId}, ${input.username}, ${input.question}, ${input.answer})
  `;
}

/** Returns the most recent N question/answer exchanges for a chat, oldest
 * first. Used to feed the Telegram bot's conversation history to Claude so it
 * remembers context from the previous turn. */
export async function listRecentMessagesForChat(chatId: string, limit = 6) {
  if (!hasDatabase()) return [];
  if (isPosDataSource()) return [];

  const sql = getSql();
  const rows = await sql`
    SELECT question, answer, created_at
    FROM telegram_messages
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows
    .map((row) => ({
      question: String(row.question),
      answer: String(row.answer),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }))
    .reverse(); // oldest → newest for chat replay
}

export async function findDocumentByHash(contentHash: string) {
  if (!hasDatabase()) {
    return null;
  }
  if (isPosDataSource()) {
    return null;
  }

  const sql = getSql();
  const rows = await sql`SELECT id, file_name, source_path, document_type, status, confidence, extractor_version, error_message, created_at FROM documents WHERE content_hash = ${contentHash} LIMIT 1`;
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function createDocument(input: {
  fileName: string;
  sourcePath: string;
  contentHash: string;
  documentType: DocumentRecord["documentType"];
  status: DocumentRecord["status"];
  confidence: number;
  extractorVersion: string;
  errorMessage?: string | null;
}) {
  const document: DocumentRecord = {
    id: randomUUID(),
    fileName: input.fileName,
    sourcePath: input.sourcePath,
    documentType: input.documentType,
    status: input.status,
    confidence: input.confidence,
    extractorVersion: input.extractorVersion,
    errorMessage: input.errorMessage ?? null,
    createdAt: new Date().toISOString(),
  };

  if (!hasDatabase()) {
    return document;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`
    INSERT INTO documents (id, file_name, source_path, content_hash, document_type, status, confidence, extractor_version, error_message)
    VALUES (
      ${document.id},
      ${document.fileName},
      ${document.sourcePath},
      ${input.contentHash},
      ${document.documentType},
      ${document.status},
      ${document.confidence},
      ${document.extractorVersion},
      ${document.errorMessage ?? null}
    )
  `;

  return document;
}

export async function updateDocumentProcessingState(input: {
  documentId: string;
  documentType: DocumentRecord["documentType"];
  status: DocumentRecord["status"];
  confidence: number;
  errorMessage?: string | null;
}) {
  if (!hasDatabase()) {
    return;
  }
  assertLegacyWritable();

  const sql = getSql();
  await sql`
    UPDATE documents
    SET
      document_type = ${input.documentType},
      status = ${input.status},
      confidence = ${input.confidence},
      error_message = ${input.errorMessage ?? null}
    WHERE id = ${input.documentId}
  `;
}

export async function persistExtraction(documentId: string, result: ExtractionResult): Promise<string | null> {
  if (!hasDatabase()) {
    return "no-database";
  }
  assertLegacyWritable();

  const sql = getSql();
  console.log(`[persistExtraction] docId=${documentId}, type=${result.documentType}, confidence=${result.confidence}`);
  console.log(`[persistExtraction] normalizedData keys:`, Object.keys(result.normalizedData ?? {}));

  try {
    await _persistExtractionInner(sql, documentId, result);
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[persistExtraction] FAILED for doc ${documentId}:`, msg);
    return msg;
  }
}

async function _persistExtractionInner(sql: ReturnType<typeof getSql>, documentId: string, result: ExtractionResult) {
  console.log(`[_persistExtractionInner] type=${result.documentType}, data=${JSON.stringify(result.normalizedData).slice(0, 400)}`);

  if (result.documentType === "sales_report") {
    const data = result.normalizedData as SalesReport;
    // Replace any existing sales_report for this date (cascades to product_sales via FK).
    await sql`DELETE FROM sales_reports WHERE business_date = ${data.businessDate}`;
    await sql`
      INSERT INTO sales_reports (id, document_id, business_date, total_sales, order_count, average_ticket, payment_mix)
      VALUES (${data.id}, ${documentId}, ${data.businessDate}, ${data.totalSales}, ${data.orderCount}, ${data.averageTicket}, ${JSON.stringify(data.paymentMix)})
    `;
    if (result.auxiliaryData?.productSales?.length) {
      for (const item of result.auxiliaryData.productSales) {
        await sql`
          INSERT INTO product_sales (id, sales_report_id, business_date, product_code, product_name, units, amount)
          VALUES (${item.id}, ${data.id}, ${item.businessDate}, ${item.productCode}, ${item.productName}, ${item.units}, ${item.amount})
        `;
      }
      // Auto-register any new product code into product_costs so the user can
      // fill in costs later without having to manually add each product.
      await sql`
        INSERT INTO product_costs (id, product_code, product_name, category, unit_cost)
        SELECT gen_random_uuid()::text, ps.product_code, ps.product_name, 'Altres', 0
        FROM (SELECT DISTINCT product_code, product_name FROM product_sales WHERE sales_report_id = ${data.id}) ps
        WHERE NOT EXISTS (SELECT 1 FROM product_costs pc WHERE pc.product_code = ps.product_code)
      `;
      // And mirror each new product as a history entry valid from 2023-01-01
      // so any old sale of the same code also uses this placeholder cost
      // until the owner sets a real one.
      await sql`
        INSERT INTO product_cost_history (id, product_code, product_name, unit_cost, valid_from, valid_until)
        SELECT gen_random_uuid()::text, ps.product_code, ps.product_name, 0, '2023-01-01'::date, NULL
        FROM (SELECT DISTINCT product_code, product_name FROM product_sales WHERE sales_report_id = ${data.id}) ps
        WHERE NOT EXISTS (SELECT 1 FROM product_cost_history pch WHERE pch.product_code = ps.product_code)
      `;
    }
    return;
  }

  if (result.documentType === "hourly_report") {
    const entries = result.normalizedData as HourlySalesEntry[];
    const businessDate = entries[0]?.businessDate;
    if (businessDate) {
      // Replace any existing hourly data for this date so re-uploads refresh the day.
      await sql`DELETE FROM hourly_sales WHERE business_date = ${businessDate}`;
      await sql`DELETE FROM hourly_product_sales WHERE business_date = ${businessDate}`;
    }
    for (const entry of entries) {
      await sql`
        INSERT INTO hourly_sales (id, document_id, business_date, hour_label, sales, order_count)
        VALUES (${entry.id}, ${documentId}, ${entry.businessDate}, ${entry.hour}, ${entry.sales}, ${entry.orderCount})
      `;
    }
    // Persist hourly product details if available
    if (result.auxiliaryData?.hourlyProductSales?.length) {
      for (const item of result.auxiliaryData.hourlyProductSales) {
        await sql`
          INSERT INTO hourly_product_sales (id, document_id, business_date, hour_label, product_code, product_name, units, amount)
          VALUES (${item.id}, ${documentId}, ${item.businessDate}, ${item.hourLabel}, ${item.productCode}, ${item.productName}, ${item.units}, ${item.amount})
        `;
      }
    }
    return;
  }

  if (result.documentType === "invoice") {
    const raw = result.normalizedData as Record<string, unknown>;
    console.log("[persistExtraction] invoice raw keys:", Object.keys(raw), "raw snippet:", JSON.stringify(raw).slice(0, 500));
    const supplierName = raw.supplierName ?? raw.supplier_name;
    const issueDate = raw.issueDate ?? raw.issue_date;
    const totalAmount = raw.totalAmount ?? raw.total_amount;
    if (!supplierName || !issueDate || totalAmount == null) {
      const missing = [!supplierName && "proveidor", !issueDate && "data", totalAmount == null && "import"].filter(Boolean).join(", ");
      throw new Error(`No s'ha pogut guardar la factura: falten camps (${missing}). Comprova que el document sigui una factura clara.`);
    }
    const id = raw.id ? String(raw.id) : randomUUID();
    const dueDate = raw.dueDate ?? raw.due_date ?? null;
    const taxAmount = Number(raw.taxAmount ?? raw.tax_amount ?? 0);
    const category = String(raw.category ?? "otros");
    console.log(`[persistExtraction] Inserting invoice: ${supplierName}, ${issueDate}, ${totalAmount} EUR`);
    await sql`
      INSERT INTO invoices (id, document_id, supplier_name, issue_date, due_date, total_amount, tax_amount, category)
      VALUES (${id}, ${documentId}, ${String(supplierName)}, ${String(issueDate)}, ${dueDate ? String(dueDate) : null}, ${Number(totalAmount)}, ${taxAmount}, ${category})
      ON CONFLICT (id) DO NOTHING
    `;
    // Persist invoice line items
    const lineItems = (raw._lineItems ?? raw.lineItems ?? raw.line_items ?? []) as Array<Record<string, unknown>>;
    for (const line of lineItems) {
      const desc = line.description ?? line.descripcion ?? "";
      if (!desc) continue;
      const lineId = randomUUID();
      await sql`
        INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price, amount, vat_rate, vat_amount)
        VALUES (${lineId}, ${id}, ${String(desc)}, ${Number(line.quantity ?? 1)}, ${Number(line.unitPrice ?? line.unit_price ?? 0)}, ${Number(line.amount ?? 0)}, ${Number(line.vatRate ?? line.vat_rate ?? 0)}, ${Number(line.vatAmount ?? line.vat_amount ?? 0)})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`[persistExtraction] Inserted ${lineItems.length} invoice lines`);
    return;
  }

  if (result.documentType === "payroll") {
    const data = result.normalizedData as PayrollRecord;
    await sql`
      INSERT INTO payrolls (id, document_id, employee_name, pay_period, gross_amount, net_amount)
      VALUES (${data.id}, ${documentId}, ${data.employeeName}, ${data.payPeriod}, ${data.grossAmount}, ${data.netAmount})
      ON CONFLICT (id) DO NOTHING
    `;
    return;
  }
}

/** Normalizes a DATE column value to "YYYY-MM-DD" regardless of driver format.
 * IMPORTANT: for JS Date objects returned by the driver, we must use the LOCAL
 * date parts (not toISOString) because the Neon driver returns DATE columns as
 * local-midnight Date instances. Using toISOString() would shift the date back
 * one day in positive-UTC timezones (e.g. Europe/Madrid = GMT+1/+2). */
function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value);
  // ISO date or datetime: just take the first 10 chars if they match YYYY-MM-DD
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  // Legacy fallback: parse and use local parts
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return str.slice(0, 10);
}

function normalizeDateTime(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return String(value);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mapTimeClockSession(row: Record<string, unknown>): TimeClockSessionRecord {
  const status = String(row.status);
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name ?? "Sense empleat"),
    businessDate: normalizeDate(row.business_date),
    clockInAt: normalizeDateTime(row.clock_in_at),
    clockOutAt: row.clock_out_at == null ? null : normalizeDateTime(row.clock_out_at),
    status,
    source: String(row.source ?? "pos"),
    deviceName: row.device_name == null ? null : String(row.device_name),
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
  };
}

function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    sourcePath: String(row.source_path),
    documentType: String(row.document_type) as DocumentRecord["documentType"],
    status: String(row.status) as DocumentRecord["status"],
    confidence: toNumber(row.confidence),
    extractorVersion: String(row.extractor_version),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
