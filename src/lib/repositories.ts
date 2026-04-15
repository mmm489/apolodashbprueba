import { randomUUID } from "node:crypto";

import { getSql, hasDatabase } from "@/lib/db";
import {
  mockAlerts,
  mockBankTransactions,
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
  BankTransaction,
  DocumentRecord,
  Employee,
  EmployeeShift,
  ExtractionResult,
  HourlyProductSale,
  ProductCost,
  HourlySalesEntry,
  InvoiceLineRecord,
  InvoiceRecord,
  PayrollRecord,
  ProductSaleRecord,
  SalesReport,
  TelegramMessage,
  TelegramUser,
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

export async function listDocuments(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockDocuments;
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

export async function listPayrolls(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockPayrolls;
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

export async function listBankTransactions(from?: string, to?: string) {
  if (!hasDatabase()) {
    return mockBankTransactions;
  }

  const sql = getSql();
  const rows = from && to
    ? await sql`SELECT id, booked_at, concept, amount, direction, category FROM bank_transactions WHERE booked_at::date >= ${from} AND booked_at::date <= ${to} ORDER BY booked_at DESC`
    : await sql`SELECT id, booked_at, concept, amount, direction, category FROM bank_transactions ORDER BY booked_at DESC LIMIT 500`;
  return rows.map((row) => ({
    id: String(row.id),
    bookedAt: new Date(String(row.booked_at)).toISOString(),
    concept: String(row.concept),
    amount: toNumber(row.amount),
    direction: row.direction === "out" ? "out" : "in",
    category: String(row.category),
  })) satisfies BankTransaction[];
}

export async function listAlerts() {
  if (!hasDatabase()) {
    return mockAlerts;
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

/* ---------- Product Costs ---------- */

export async function listProductCosts() {
  if (!hasDatabase()) return [];

  const sql = getSql();
  const rows = await sql`SELECT id, product_code, product_name, category, unit_cost FROM product_costs ORDER BY category ASC, product_name ASC`;
  return rows.map((row) => ({
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    category: String(row.category),
    unitCost: toNumber(row.unit_cost),
  })) satisfies ProductCost[];
}

export async function upsertProductCost(input: {
  productCode: string;
  productName: string;
  category: string;
  unitCost: number;
}) {
  if (!hasDatabase()) return;

  const sql = getSql();
  const id = randomUUID();
  await sql`
    INSERT INTO product_costs (id, product_code, product_name, category, unit_cost, updated_at)
    VALUES (${id}, ${input.productCode}, ${input.productName}, ${input.category}, ${input.unitCost}, NOW())
    ON CONFLICT (product_code)
    DO UPDATE SET product_name = EXCLUDED.product_name, category = EXCLUDED.category, unit_cost = EXCLUDED.unit_cost, updated_at = NOW()
  `;
}

export async function syncProductCostsFromSales() {
  if (!hasDatabase()) return;

  const sql = getSql();
  // Insert any product from product_sales that doesn't exist yet in product_costs
  await sql`
    INSERT INTO product_costs (id, product_code, product_name, category, unit_cost)
    SELECT gen_random_uuid()::text, ps.product_code, ps.product_name, 'Altres', 0
    FROM (SELECT DISTINCT product_code, product_name FROM product_sales) ps
    WHERE NOT EXISTS (SELECT 1 FROM product_costs pc WHERE pc.product_code = ps.product_code)
  `;
}

/* ---------- Employees ---------- */

export async function listEmployees() {
  if (!hasDatabase()) {
    return mockEmployees;
  }

  const sql = getSql();
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

  const sql = getSql();
  await sql`
    UPDATE employees
    SET name = ${input.name}, shift_start = ${input.shiftStart}, shift_end = ${input.shiftEnd}, working_days_per_month = ${input.workingDaysPerMonth}, hourly_cost = ${input.hourlyCost}
    WHERE id = ${id}
  `;
}

export async function deleteEmployee(id: string) {
  if (!hasDatabase()) return;

  const sql = getSql();
  await sql`UPDATE employees SET is_active = FALSE WHERE id = ${id}`;
}

/* ---------- Employee Shifts ---------- */

export async function listEmployeeShifts(from?: string, to?: string) {
  if (!hasDatabase()) return [];

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

  const sql = getSql();
  const rows = await sql`SELECT sync_value FROM sync_state WHERE sync_key = ${syncKey} LIMIT 1`;
  return rows[0] ? String(rows[0].sync_value) : null;
}

export async function setSyncState(syncKey: string, syncValue: string) {
  if (!hasDatabase()) {
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
  username: string;
  question: string;
  answer: string;
}) {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSql();
  await sql`
    INSERT INTO telegram_messages (id, telegram_user_id, username, question, answer)
    VALUES (${randomUUID()}, ${input.telegramUserId}, ${input.username}, ${input.question}, ${input.answer})
  `;
}

export async function findDocumentByHash(contentHash: string) {
  if (!hasDatabase()) {
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
    await sql`
      INSERT INTO sales_reports (id, document_id, business_date, total_sales, order_count, average_ticket, payment_mix)
      VALUES (${data.id}, ${documentId}, ${data.businessDate}, ${data.totalSales}, ${data.orderCount}, ${data.averageTicket}, ${JSON.stringify(data.paymentMix)})
      ON CONFLICT (id) DO NOTHING
    `;
    if (result.auxiliaryData?.productSales?.length) {
      for (const item of result.auxiliaryData.productSales) {
        await sql`
          INSERT INTO product_sales (id, sales_report_id, business_date, product_code, product_name, units, amount)
          VALUES (${item.id}, ${data.id}, ${item.businessDate}, ${item.productCode}, ${item.productName}, ${item.units}, ${item.amount})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }
    return;
  }

  if (result.documentType === "hourly_report") {
    const entries = result.normalizedData as HourlySalesEntry[];
    for (const entry of entries) {
      await sql`
        INSERT INTO hourly_sales (id, document_id, business_date, hour_label, sales, order_count)
        VALUES (${entry.id}, ${documentId}, ${entry.businessDate}, ${entry.hour}, ${entry.sales}, ${entry.orderCount})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    // Persist hourly product details if available
    if (result.auxiliaryData?.hourlyProductSales?.length) {
      for (const item of result.auxiliaryData.hourlyProductSales) {
        await sql`
          INSERT INTO hourly_product_sales (id, document_id, business_date, hour_label, product_code, product_name, units, amount)
          VALUES (${item.id}, ${documentId}, ${item.businessDate}, ${item.hourLabel}, ${item.productCode}, ${item.productName}, ${item.units}, ${item.amount})
          ON CONFLICT (id) DO NOTHING
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

  if (result.documentType === "bank_statement") {
    const items = result.normalizedData as BankTransaction[];
    for (const item of items) {
      await sql`
        INSERT INTO bank_transactions (id, document_id, booked_at, concept, amount, direction, category)
        VALUES (${item.id}, ${documentId}, ${item.bookedAt}, ${item.concept}, ${item.amount}, ${item.direction}, ${item.category})
        ON CONFLICT (id) DO NOTHING
      `;
    }
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
