import { randomUUID, createHash } from "crypto";

import { getSql, hasDatabase, isPosDataSource } from "@/lib/db";
import {
  listInvoices,
  listPayrolls,
  listSalesReports,
  listSupplierPayments,
} from "@/lib/repositories";
import type {
  AccountingAccount,
  AccountingAccountType,
  AccountingEntryStatus,
  AccountingJournalEntry,
  AccountingJournalLine,
  AccountingPeriod,
  AccountingWorkspace,
  BankAccount,
  BankTransaction,
  BankTransactionStatus,
  InvoiceRecord,
  PayrollRecord,
  SalesReport,
  SupplierPaymentRecord,
} from "@/lib/types";

type Sql = ReturnType<typeof getSql>;
type JournalLineInput = {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
};

const ACCOUNTING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounting_accounts (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS accounting_journal_entries (
    id TEXT PRIMARY KEY,
    entry_date DATE NOT NULL,
    period TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_type, source_id)
  )`,
  `CREATE TABLE IF NOT EXISTS accounting_journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    debit NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit NUMERIC(12,2) NOT NULL DEFAULT 0,
    memo TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS accounting_periods (
    period TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'open',
    closed_at TIMESTAMPTZ,
    closed_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    iban TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bank_transactions (
    id TEXT PRIMARY KEY,
    bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    value_date DATE,
    description TEXT NOT NULL,
    counterparty TEXT,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    external_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
    id TEXT PRIMARY KEY,
    bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    entry_id TEXT REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
    match_type TEXT NOT NULL,
    confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_accounting_entries_date ON accounting_journal_entries(entry_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_accounting_entries_period ON accounting_journal_entries(period, status)`,
  `CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry ON accounting_journal_lines(entry_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(status)`,
] as const;

const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; type: AccountingAccountType }> = [
  { code: "100", name: "Capital social", type: "equity" },
  { code: "400", name: "Proveedores", type: "liability" },
  { code: "410", name: "Acreedores por prestaciones de servicios", type: "liability" },
  { code: "430", name: "Clientes", type: "asset" },
  { code: "465", name: "Remuneraciones pendientes de pago", type: "liability" },
  { code: "472", name: "Hacienda Pública, IVA soportado", type: "asset" },
  { code: "475", name: "Hacienda Pública, acreedora", type: "liability" },
  { code: "477", name: "Hacienda Pública, IVA repercutido", type: "liability" },
  { code: "555", name: "Partidas pendientes de aplicación", type: "liability" },
  { code: "570", name: "Caja", type: "asset" },
  { code: "572", name: "Bancos", type: "asset" },
  { code: "600", name: "Compras de mercaderías", type: "expense" },
  { code: "621", name: "Arrendamientos y cánones", type: "expense" },
  { code: "622", name: "Reparaciones y conservación", type: "expense" },
  { code: "623", name: "Servicios profesionales independientes", type: "expense" },
  { code: "625", name: "Primas de seguros", type: "expense" },
  { code: "626", name: "Servicios bancarios y similares", type: "expense" },
  { code: "627", name: "Publicidad, propaganda y relaciones públicas", type: "expense" },
  { code: "628", name: "Suministros", type: "expense" },
  { code: "629", name: "Otros servicios", type: "expense" },
  { code: "640", name: "Sueldos y salarios", type: "expense" },
  { code: "642", name: "Seguridad Social a cargo de la empresa", type: "expense" },
  { code: "700", name: "Ventas de mercaderías", type: "income" },
  { code: "705", name: "Prestaciones de servicios", type: "income" },
];

export async function ensureAccountingSchema() {
  if (!hasDatabase()) return;
  const sql = getSql();
  for (const statement of ACCOUNTING_SCHEMA) {
    await sql.query(statement);
  }
  await seedDefaultAccounts(sql);
  await ensureDefaultBankAccount(sql);
}

export async function getAccountingWorkspace(from: string, to: string): Promise<AccountingWorkspace> {
  await ensureAccountingSchema();
  const [accounts, entries, bankAccounts, bankTransactions, periods] = await Promise.all([
    listAccountingAccounts(),
    listJournalEntries(from, to),
    listBankAccounts(),
    listBankTransactions(from, to),
    listAccountingPeriods(),
  ]);

  const totals = entries.reduce(
    (acc, entry) => {
      acc.debit += entry.totalDebit;
      acc.credit += entry.totalCredit;
      if (entry.status === "draft") acc.draftEntries += 1;
      if (entry.status === "validated") acc.validatedEntries += 1;
      if (entry.status === "locked") acc.lockedEntries += 1;
      if (!entry.isBalanced) acc.unbalancedEntries += 1;
      return acc;
    },
    {
      draftEntries: 0,
      validatedEntries: 0,
      lockedEntries: 0,
      unbalancedEntries: 0,
      bankPending: bankTransactions.filter((item) => item.status === "pending").length,
      debit: 0,
      credit: 0,
    },
  );

  return {
    accounts,
    entries,
    bankAccounts,
    bankTransactions,
    periods,
    vatSummary: computeVatSummary(entries),
    totals,
  };
}

export async function listAccountingAccounts(): Promise<AccountingAccount[]> {
  await ensureAccountingSchema();
  const rows = await getSql()`SELECT id, code, name, type, is_active, created_at FROM accounting_accounts ORDER BY code ASC`;
  return rows.map(mapAccount);
}

export async function upsertAccountingAccount(input: {
  code: string;
  name: string;
  type: AccountingAccountType;
  isActive?: boolean;
}) {
  await ensureAccountingSchema();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!/^\d{3,8}$/.test(code)) throw new Error("Código contable inválido.");
  if (!name) throw new Error("El nombre de la cuenta es obligatorio.");
  await getSql()`
    INSERT INTO accounting_accounts (id, code, name, type, is_active)
    VALUES (${randomUUID()}, ${code}, ${name}, ${input.type}, ${input.isActive ?? true})
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      is_active = EXCLUDED.is_active
  `;
}

export async function generateAccountingDrafts(from: string, to: string) {
  await ensureAccountingSchema();
  const [sales, invoices, supplierPayments, payrolls] = await Promise.all([
    listAccountingSalesReports(from, to),
    listInvoices(from, to),
    listSupplierPayments(from, to),
    listPayrolls(from, to),
  ]);
  let created = 0;
  let skipped = 0;

  for (const sale of sales) {
    const ok = await createSalesDraft(sale);
    ok ? created += 1 : skipped += 1;
  }
  for (const invoice of invoices) {
    const ok = await createInvoiceDraft(invoice);
    ok ? created += 1 : skipped += 1;
  }
  for (const payment of supplierPayments.filter((item) => item.status === "dispensed")) {
    const ok = await createSupplierPaymentDraft(payment);
    ok ? created += 1 : skipped += 1;
  }
  for (const payroll of payrolls) {
    const ok = await createPayrollDraft(payroll);
    ok ? created += 1 : skipped += 1;
  }

  return { created, skipped };
}

async function listAccountingSalesReports(from: string, to: string): Promise<SalesReport[]> {
  if (!hasDatabase()) return [];
  if (!isPosDataSource()) return listSalesReports(from, to);

  const sql = getSql();
  await sql.query("ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS business_unit TEXT NOT NULL DEFAULT 'hicream'");
  const rows = await sql`
    SELECT ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date AS business_date,
           payment_method,
           COALESCE(SUM(COALESCE(total_base, total)), 0)::float AS total_sales,
           COUNT(*)::int AS order_count
    FROM pos.orders
    WHERE ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date >= ${from}::date
      AND ((created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date <= ${to}::date
      AND status <> 'cancelled'
      AND payment_method <> 'parked'
      AND COALESCE(business_unit, 'hicream') = 'hicream'
    GROUP BY 1, payment_method
    ORDER BY business_date DESC
  `;
  const byDate = new Map<string, SalesReport>();
  for (const row of rows) {
    const businessDate = normalizeDate(row.business_date);
    const report = byDate.get(businessDate) ?? {
      id: `accounting-pos-sales-${businessDate}`,
      businessDate,
      totalSales: 0,
      orderCount: 0,
      averageTicket: 0,
      paymentMix: {},
    };
    const amount = Number(row.total_sales ?? 0);
    const method = normalizePaymentMethod(row.payment_method);
    report.totalSales += amount;
    report.orderCount += Number(row.order_count ?? 0);
    report.paymentMix[method] = (report.paymentMix[method] ?? 0) + amount;
    byDate.set(businessDate, report);
  }
  return [...byDate.values()].map((report) => ({
    ...report,
    averageTicket: report.orderCount > 0 ? report.totalSales / report.orderCount : 0,
  }));
}

export async function validateBalancedDrafts(from?: string, to?: string) {
  await ensureAccountingSchema();
  const sql = getSql();
  const entries = await listJournalEntries(from, to);
  const balancedDrafts = entries.filter((entry) => entry.status === "draft" && entry.isBalanced);
  for (const entry of balancedDrafts) {
    await sql`
      UPDATE accounting_journal_entries
      SET status = 'validated', updated_at = NOW()
      WHERE id = ${entry.id} AND status = 'draft'
    `;
  }
  return { validated: balancedDrafts.length };
}

export async function closeAccountingPeriod(period: string, closedBy = "dashboard") {
  await ensureAccountingSchema();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Periodo inválido.");
  const sql = getSql();
  await sql`
    INSERT INTO accounting_periods (period, status, closed_at, closed_by)
    VALUES (${period}, 'closed', NOW(), ${closedBy})
    ON CONFLICT (period) DO UPDATE SET
      status = 'closed',
      closed_at = NOW(),
      closed_by = EXCLUDED.closed_by
  `;
  await sql`
    UPDATE accounting_journal_entries
    SET status = 'locked', updated_at = NOW()
    WHERE period = ${period} AND status = 'validated'
  `;
}

export async function importBankTransactions(input: {
  accountName?: string;
  iban?: string | null;
  rows: Array<{
    transactionDate: string;
    valueDate?: string | null;
    description: string;
    counterparty?: string | null;
    amount: number;
    externalSeed: string;
  }>;
}) {
  await ensureAccountingSchema();
  const sql = getSql();
  const account = await ensureDefaultBankAccount(sql, input.accountName || "Banco principal", input.iban ?? null);
  let inserted = 0;
  let skipped = 0;

  for (const row of input.rows) {
    if (!row.transactionDate || !row.description || !Number.isFinite(row.amount)) {
      skipped += 1;
      continue;
    }
    const externalId = bankExternalId(account.id, row);
    const result = await sql`
      INSERT INTO bank_transactions (
        id, bank_account_id, transaction_date, value_date, description,
        counterparty, amount, status, external_id
      )
      VALUES (
        ${randomUUID()}, ${account.id}, ${row.transactionDate}, ${row.valueDate ?? null},
        ${row.description}, ${row.counterparty ?? null}, ${round2(row.amount)}, 'pending', ${externalId}
      )
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id
    `;
    result.length > 0 ? inserted += 1 : skipped += 1;
  }

  return { inserted, skipped };
}

export async function listJournalEntries(from?: string, to?: string): Promise<AccountingJournalEntry[]> {
  await ensureAccountingSchema();
  const sql = getSql();
  const entryRows = from && to
    ? await sql`
        SELECT id, entry_date, period, source_type, source_id, description, status, created_at, updated_at
        FROM accounting_journal_entries
        WHERE entry_date >= ${from}::date AND entry_date <= ${to}::date
        ORDER BY entry_date DESC, created_at DESC
      `
    : await sql`
        SELECT id, entry_date, period, source_type, source_id, description, status, created_at, updated_at
        FROM accounting_journal_entries
        ORDER BY entry_date DESC, created_at DESC
        LIMIT 1000
      `;
  const ids = entryRows.map((row) => String(row.id));
  const lineRows = ids.length
    ? await sql.query(
        `SELECT id, entry_id, account_code, account_name, debit, credit, memo
         FROM accounting_journal_lines
         WHERE entry_id = ANY($1)
         ORDER BY account_code ASC`,
        [ids],
      )
    : [];
  const linesByEntry = new Map<string, AccountingJournalLine[]>();
  for (const row of lineRows) {
    const line = mapJournalLine(row);
    const group = linesByEntry.get(line.entryId) ?? [];
    group.push(line);
    linesByEntry.set(line.entryId, group);
  }
  return entryRows.map((row) => mapJournalEntry(row, linesByEntry.get(String(row.id)) ?? []));
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  await ensureAccountingSchema();
  const rows = await getSql()`SELECT id, name, iban, currency, created_at FROM bank_accounts ORDER BY created_at ASC`;
  return rows.map(mapBankAccount);
}

export async function listBankTransactions(from?: string, to?: string): Promise<BankTransaction[]> {
  await ensureAccountingSchema();
  const rows = from && to
    ? await getSql()`
        SELECT id, bank_account_id, transaction_date, value_date, description, counterparty, amount, status, external_id, created_at
        FROM bank_transactions
        WHERE transaction_date >= ${from}::date AND transaction_date <= ${to}::date
        ORDER BY transaction_date DESC, created_at DESC
      `
    : await getSql()`
        SELECT id, bank_account_id, transaction_date, value_date, description, counterparty, amount, status, external_id, created_at
        FROM bank_transactions
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 1000
      `;
  return rows.map(mapBankTransaction);
}

export async function listAccountingPeriods(): Promise<AccountingPeriod[]> {
  await ensureAccountingSchema();
  const rows = await getSql()`SELECT period, status, closed_at, closed_by FROM accounting_periods ORDER BY period DESC`;
  return rows.map((row) => ({
    period: String(row.period),
    status: String(row.status) === "closed" ? "closed" : "open",
    closedAt: row.closed_at == null ? null : normalizeDateTime(row.closed_at),
    closedBy: row.closed_by == null ? null : String(row.closed_by),
  }));
}

export function buildLedger(entries: AccountingJournalEntry[]) {
  const ledger = new Map<string, { accountCode: string; accountName: string; debit: number; credit: number; balance: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const item = ledger.get(line.accountCode) ?? {
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      item.debit += line.debit;
      item.credit += line.credit;
      item.balance = item.debit - item.credit;
      ledger.set(line.accountCode, item);
    }
  }
  return [...ledger.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export function buildProfitAndLoss(entries: AccountingJournalEntry[]) {
  const ledger = buildLedger(entries);
  const income = ledger.filter((item) => item.accountCode.startsWith("7")).reduce((sum, item) => sum + item.credit - item.debit, 0);
  const expenses = ledger.filter((item) => item.accountCode.startsWith("6")).reduce((sum, item) => sum + item.debit - item.credit, 0);
  return { income, expenses, result: income - expenses };
}

async function seedDefaultAccounts(sql: Sql) {
  for (const account of DEFAULT_ACCOUNTS) {
    await sql`
      INSERT INTO accounting_accounts (id, code, name, type, is_active)
      VALUES (${randomUUID()}, ${account.code}, ${account.name}, ${account.type}, true)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        is_active = TRUE
    `;
  }
}

async function ensureDefaultBankAccount(sql: Sql, name = "Banco principal", iban: string | null = null): Promise<BankAccount> {
  const existing = await sql`SELECT id, name, iban, currency, created_at FROM bank_accounts ORDER BY created_at ASC LIMIT 1`;
  if (existing[0]) return mapBankAccount(existing[0]);
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO bank_accounts (id, name, iban, currency)
    VALUES (${id}, ${name}, ${iban}, 'EUR')
    RETURNING id, name, iban, currency, created_at
  `;
  return mapBankAccount(rows[0]);
}

async function createSalesDraft(sale: SalesReport) {
  const base = round2(sale.totalSales);
  if (base <= 0) return false;
  const vat = round2(base * 0.10);
  const gross = round2(base + vat);
  const debitLines = paymentMixToDebitLines(sale.paymentMix, gross, base);
  return insertEntry({
    date: sale.businessDate,
    sourceType: "sales_day",
    sourceId: sale.businessDate,
    description: `Ventas POS ${sale.businessDate}`,
    lines: [
      ...debitLines,
      { accountCode: "700", credit: base, memo: "Base ventas Hi Cream" },
      { accountCode: "477", credit: vat, memo: "IVA repercutido ventas 10%" },
    ],
  });
}

async function createInvoiceDraft(invoice: InvoiceRecord) {
  const gross = round2(invoice.totalAmount);
  if (gross <= 0) return false;
  const vat = round2(invoice.taxAmount);
  const net = round2(gross - vat);
  return insertEntry({
    date: invoice.issueDate,
    sourceType: "supplier_invoice",
    sourceId: invoice.id,
    description: `Factura ${invoice.supplierName}`,
    lines: compactLines([
      { accountCode: expenseAccountForCategory(invoice.category, invoice.supplierName), debit: net, memo: invoice.category },
      { accountCode: "472", debit: vat, memo: "IVA soportado" },
      { accountCode: "400", credit: gross, memo: invoice.supplierName },
    ]),
  });
}

async function createSupplierPaymentDraft(payment: SupplierPaymentRecord) {
  if (payment.amount <= 0) return false;
  return insertEntry({
    date: payment.businessDate,
    sourceType: "supplier_payment",
    sourceId: payment.id,
    description: `Pago proveedor ${payment.supplierName}`,
    lines: [
      { accountCode: "629", debit: round2(payment.amount), memo: payment.reason || payment.supplierName },
      { accountCode: "570", credit: round2(payment.amount), memo: "Salida Cashlogy" },
    ],
  });
}

async function createPayrollDraft(payroll: PayrollRecord) {
  const gross = round2(payroll.grossAmount);
  const net = round2(payroll.netAmount);
  if (gross <= 0) return false;
  const withheld = round2(Math.max(0, gross - net));
  return insertEntry({
    date: `${payroll.payPeriod.slice(0, 7)}-01`,
    sourceType: "payroll",
    sourceId: payroll.id,
    description: `Nomina ${payroll.employeeName} ${payroll.payPeriod}`,
    lines: compactLines([
      { accountCode: "640", debit: gross, memo: payroll.employeeName },
      { accountCode: "465", credit: net, memo: "Neto pendiente/pagado" },
      { accountCode: "475", credit: withheld, memo: "Retenciones y seguros sociales estimados" },
    ]),
  });
}

async function insertEntry(input: {
  date: string;
  sourceType: string;
  sourceId: string;
  description: string;
  lines: JournalLineInput[];
}) {
  const sql = getSql();
  const existing = await sql`
    SELECT id FROM accounting_journal_entries
    WHERE source_type = ${input.sourceType} AND source_id = ${input.sourceId}
    LIMIT 1
  `;
  if (existing.length > 0) return false;

  const entryId = randomUUID();
  const period = input.date.slice(0, 7);
  const entryRows = await sql`
    INSERT INTO accounting_journal_entries (id, entry_date, period, source_type, source_id, description, status)
    VALUES (${entryId}, ${input.date}, ${period}, ${input.sourceType}, ${input.sourceId}, ${input.description}, 'draft')
    ON CONFLICT (source_type, source_id) DO NOTHING
    RETURNING id
  `;
  if (entryRows.length === 0) return false;

  for (const line of compactLines(input.lines)) {
    const account = await accountByCode(line.accountCode);
    await sql`
      INSERT INTO accounting_journal_lines (id, entry_id, account_code, account_name, debit, credit, memo)
      VALUES (
        ${randomUUID()}, ${entryId}, ${account.code}, ${account.name},
        ${round2(line.debit ?? 0)}, ${round2(line.credit ?? 0)}, ${line.memo ?? null}
      )
    `;
  }
  return true;
}

async function accountByCode(code: string) {
  const rows = await getSql()`SELECT id, code, name, type, is_active, created_at FROM accounting_accounts WHERE code = ${code} LIMIT 1`;
  if (rows[0]) return mapAccount(rows[0]);
  const fallback = DEFAULT_ACCOUNTS.find((item) => item.code === code) ?? { code, name: `Cuenta ${code}`, type: "expense" as const };
  await upsertAccountingAccount(fallback);
  return fallback;
}

function paymentMixToDebitLines(paymentMix: Record<string, number>, gross: number, base: number): JournalLineInput[] {
  const entries = Object.entries(paymentMix).filter(([, amount]) => amount > 0);
  if (entries.length === 0 || base <= 0) {
    return [{ accountCode: "570", debit: gross, memo: "Cobro ventas" }];
  }
  return compactLines(entries.map(([method, methodBase]) => {
    const methodGross = round2(gross * (methodBase / base));
    const accountCode = method === "cash" ? "570" : method === "card" || method === "manual" ? "572" : "430";
    return { accountCode, debit: methodGross, memo: paymentMethodLabel(method) };
  }));
}

function expenseAccountForCategory(category: string, supplierName: string) {
  const text = normalize(`${category} ${supplierName}`);
  if (/(compra|mercader|aliment|proveedor|gelat|helad|beguda|bebida|materia)/.test(text)) return "600";
  if (/(alquiler|lloguer|arrend)/.test(text)) return "621";
  if (/(repar|manten)/.test(text)) return "622";
  if (/(gestor|asesor|profesional|consult)/.test(text)) return "623";
  if (/(seguro|asseguran)/.test(text)) return "625";
  if (/(banco|bank|comision)/.test(text)) return "626";
  if (/(public|marketing|ads)/.test(text)) return "627";
  if (/(luz|agua|electric|suministro|subministr)/.test(text)) return "628";
  return "629";
}

function compactLines(lines: JournalLineInput[]) {
  return lines.filter((line) => round2(line.debit ?? 0) > 0 || round2(line.credit ?? 0) > 0);
}

function computeVatSummary(entries: AccountingJournalEntry[]) {
  let outputVat = 0;
  let inputVat = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountCode === "477") outputVat += line.credit - line.debit;
      if (line.accountCode === "472") inputVat += line.debit - line.credit;
    }
  }
  return { outputVat, inputVat, payableVat: outputVat - inputVat };
}

function mapAccount(row: Record<string, unknown>): AccountingAccount {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    type: String(row.type) as AccountingAccountType,
    isActive: Boolean(row.is_active),
    createdAt: normalizeDateTime(row.created_at),
  };
}

function mapJournalEntry(row: Record<string, unknown>, lines: AccountingJournalLine[]): AccountingJournalEntry {
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  return {
    id: String(row.id),
    entryDate: normalizeDate(row.entry_date),
    period: String(row.period),
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    description: String(row.description),
    status: String(row.status) as AccountingEntryStatus,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
    lines,
  };
}

function mapJournalLine(row: Record<string, unknown>): AccountingJournalLine {
  return {
    id: String(row.id),
    entryId: String(row.entry_id),
    accountCode: String(row.account_code),
    accountName: String(row.account_name),
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    memo: row.memo == null ? null : String(row.memo),
  };
}

function mapBankAccount(row: Record<string, unknown>): BankAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    iban: row.iban == null ? null : String(row.iban),
    currency: String(row.currency ?? "EUR"),
    createdAt: normalizeDateTime(row.created_at),
  };
}

function mapBankTransaction(row: Record<string, unknown>): BankTransaction {
  return {
    id: String(row.id),
    bankAccountId: String(row.bank_account_id),
    transactionDate: normalizeDate(row.transaction_date),
    valueDate: row.value_date == null ? null : normalizeDate(row.value_date),
    description: String(row.description),
    counterparty: row.counterparty == null ? null : String(row.counterparty),
    amount: Number(row.amount ?? 0),
    status: String(row.status) as BankTransactionStatus,
    externalId: String(row.external_id),
    createdAt: normalizeDateTime(row.created_at),
  };
}

function bankExternalId(accountId: string, row: { transactionDate: string; description: string; amount: number; externalSeed: string }) {
  return createHash("sha256")
    .update(`${accountId}|${row.transactionDate}|${row.description}|${row.amount}|${row.externalSeed}`)
    .digest("hex");
}

function paymentMethodLabel(method: string) {
  if (method === "cash") return "Cobros efectivo";
  if (method === "card") return "Cobros tarjeta";
  if (method === "manual") return "Cobros manual/tarjeta";
  return `Cobros ${method}`;
}

function normalizePaymentMethod(value: unknown) {
  const method = String(value ?? "").toLowerCase();
  if (method === "cash" || method === "efectivo") return "cash";
  if (method === "card" || method === "tarjeta" || method === "targeta") return "card";
  if (method === "manual") return "manual";
  return method || "unknown";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return str.slice(0, 10);
}

function normalizeDateTime(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return String(value);
}

function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
