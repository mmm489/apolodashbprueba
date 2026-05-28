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
  CatalogChangeRecord,
  CatalogEntityType,
  DocumentRecord,
  Employee,
  EmployeeShift,
  ExtractionResult,
  HourlyProductSale,
  ProductCost,
  ProductCostHistoryEntry,
  HourlySalesEntry,
  InvoiceLineRecord,
  InvoiceRecord,
  PayrollRecord,
  PosCatalog,
  ProductSaleRecord,
  SalesReport,
  TelegramMessage,
  TelegramUser,
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

const READ_ONLY_POS_MESSAGE = "Apolodashprueba esta conectado al POS en modo solo lectura.";

function assertLegacyWritable() {
  if (isPosDataSource()) {
    throw new Error(READ_ONLY_POS_MESSAGE);
  }
}

function normalizePaymentMethod(value: unknown): string {
  const method = String(value ?? "otros").toLowerCase();
  if (method === "cash") return "efectivo";
  if (method === "card") return "tarjeta";
  if (method === "manual") return "manual";
  return method || "otros";
}

export async function listDocuments(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockDocuments;
  }
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
    const rows = from && to
      ? await sql`
          SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date, payment_method,
                 COALESCE(SUM(total), 0)::float AS total_sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE (created_at AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
            AND (created_at AT TIME ZONE 'Europe/Madrid')::date <= ${to}::date
            AND status <> 'cancelled'
          GROUP BY 1, payment_method
          ORDER BY business_date DESC
        `
      : await sql`
          SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date, payment_method,
                 COALESCE(SUM(total), 0)::float AS total_sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE status <> 'cancelled'
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

    return [...byDate.values()].map((report) => ({
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
    paymentMix: (row.payment_mix as Record<string, number>) ?? {},
  })) satisfies SalesReport[];
}

export async function listHourlySales(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockHourlySales;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    const rows = from && to
      ? await sql`
          SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 COALESCE(SUM(total), 0)::float AS sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE (created_at AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
            AND (created_at AT TIME ZONE 'Europe/Madrid')::date <= ${to}::date
            AND status <> 'cancelled'
          GROUP BY 1, 2
          ORDER BY business_date DESC, hour_num ASC
        `
      : await sql`
          SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 COALESCE(SUM(total), 0)::float AS sales,
                 COUNT(*)::int AS order_count
          FROM pos.orders
          WHERE status <> 'cancelled'
          GROUP BY 1, 2
          ORDER BY business_date DESC, hour_num ASC
          LIMIT 10000
        `;

    return rows.map((row) => {
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
    const rows = from && to
      ? await sql`
          SELECT (o.created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(oi.qty * oi.unit_price)::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE (o.created_at AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
            AND (o.created_at AT TIME ZONE 'Europe/Madrid')::date <= ${to}::date
            AND o.status <> 'cancelled'
          GROUP BY 1, 2, oi.product_id, p.name
          ORDER BY business_date DESC, hour_num ASC, amount DESC
        `
      : await sql`
          SELECT (o.created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Madrid')::int AS hour_num,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(oi.qty * oi.unit_price)::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE o.status <> 'cancelled'
          GROUP BY 1, 2, oi.product_id, p.name
          ORDER BY business_date DESC, hour_num ASC, amount DESC
          LIMIT 50000
        `;

    return rows.map((row) => {
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
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
  if (isPosDataSource()) return [];

  const sql = getSql();
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
    const rows = from && to
      ? await sql`
          SELECT (o.created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(oi.qty * oi.unit_price)::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE (o.created_at AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
            AND (o.created_at AT TIME ZONE 'Europe/Madrid')::date <= ${to}::date
            AND o.status <> 'cancelled'
          GROUP BY 1, oi.product_id, p.name
          ORDER BY business_date DESC, amount DESC
        `
      : await sql`
          SELECT (o.created_at AT TIME ZONE 'Europe/Madrid')::date AS business_date,
                 oi.product_id,
                 p.name AS product_name,
                 SUM(oi.qty)::float AS units,
                 SUM(oi.qty * oi.unit_price)::float AS amount
          FROM pos.order_items oi
          JOIN pos.orders o ON o.id = oi.order_id
          JOIN pos.products p ON p.id = oi.product_id
          WHERE o.status <> 'cancelled'
          GROUP BY 1, oi.product_id, p.name
          ORDER BY business_date DESC, amount DESC
          LIMIT 20000
        `;

    return rows.map((row) => {
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
  const rows = from && to
    ? await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               c.total_cash, c.total_card, c.total_sales,
               c.ticket_count, c.cash_count, c.card_count,
               c.cancelled_count, c.total_refunded,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
        WHERE (c.closed_at AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
          AND (c.closed_at AT TIME ZONE 'Europe/Madrid')::date <= ${to}::date
        ORDER BY c.closed_at DESC
      `
    : await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               c.total_cash, c.total_card, c.total_sales,
               c.ticket_count, c.cash_count, c.card_count,
               c.cancelled_count, c.total_refunded,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
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

export async function listPayrolls(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockPayrolls;
  }
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
  if (isPosDataSource()) {
    return [];
  }

  const sql = getSql();
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
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('category', 'product')),
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
    CREATE INDEX IF NOT EXISTS idx_catalog_change_queue_status
    ON pos.catalog_change_queue(status, requested_at)
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
    return { categories: [], products: [], pendingChanges: [] };
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
           COALESCE(c.color, '#64748b') AS category_color
    FROM pos.products p
    LEFT JOIN pos.categories c ON c.id = p.category_id
    ORDER BY p.active DESC, c.sort_order ASC NULLS LAST, p.sort_order ASC, p.name ASC
  `;
  const changes = await sql`
    SELECT id, entity_type, action, entity_id, payload, status, requested_at,
           applied_at, applied_entity_id, error_message
    FROM pos.catalog_change_queue
    ORDER BY requested_at DESC
    LIMIT 120
  `;

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
      price: toNumber(row.price),
      vatRate: toNumber(row.vat_rate),
      imageUrl: row.image_url ? String(row.image_url) : null,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order ?? 0),
    })),
    pendingChanges: changes.map(mapCatalogChange),
  };
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

/* ---------- Product Costs ---------- */

export async function listProductCosts() {
  if (!hasDatabase()) return [];

  const sql = getSql();
  if (isPosDataSource()) {
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
  return rows.map((row) => ({
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    category: String(row.category),
    unitCost: toNumber(row.unit_cost),
  })) satisfies ProductCost[];
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
}) {
  if (!hasDatabase()) return;
  assertLegacyWritable();

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
}

/** Returns the full cost history for a product, newest first. Used in the
 * product detail UI so the owner can audit when a price changed. */
export async function listProductCostHistory(productCode: string) {
  if (!hasDatabase()) return [];
  if (isPosDataSource()) return [];
  const sql = getSql();
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
  if (isPosDataSource()) return [];
  const sql = getSql();
  const rows = await sql`
    SELECT id, product_code, product_name, unit_cost, valid_from, valid_until, created_at
    FROM product_cost_history
    ORDER BY product_code ASC, valid_from DESC
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

export async function listEmployees() {
  if (!hasDatabase()) {
    return mockEmployees;
  }

  const sql = getSql();
  if (isPosDataSource()) {
    const rows = await sql`
      SELECT id, name, active
      FROM pos.employees
      WHERE active = TRUE
      ORDER BY name ASC
    `;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      shiftStart: "00:00",
      shiftEnd: "00:00",
      workingDaysPerMonth: 0,
      hourlyCost: 0,
      isActive: Boolean(row.active),
      createdAt: "1970-01-01T00:00:00.000Z",
    })) satisfies Employee[];
  }

  const rows = await sql`SELECT id, name, shift_start, shift_end, working_days_per_month, hourly_cost, is_active, created_at FROM employees WHERE is_active = TRUE ORDER BY name ASC`;
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
    workingDaysPerMonth: Number(row.working_days_per_month),
    hourlyCost: toNumber(row.hourly_cost),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
  })) satisfies Employee[];
}

export async function createEmployee(input: {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  workingDaysPerMonth: number;
  hourlyCost: number;
}) {
  const id = randomUUID();

  if (!hasDatabase()) {
    return { id, ...input, isActive: true, createdAt: new Date().toISOString() } satisfies Employee;
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
  input: { name: string; shiftStart: string; shiftEnd: string; workingDaysPerMonth: number; hourlyCost: number },
) {
  if (!hasDatabase()) return;
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
  assertLegacyWritable();

  const sql = getSql();
  await sql`UPDATE employees SET is_active = FALSE WHERE id = ${id}`;
}

/* ---------- Employee Shifts ---------- */

export async function listEmployeeShifts(from?: string, to?: string) {
  if (!hasDatabase()) return [];
  if (isPosDataSource()) return [];

  const sql = getSql();
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
  assertLegacyWritable();

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
