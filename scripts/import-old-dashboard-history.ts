import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { schemaSql } from "../src/lib/schema";

type TableSpec = {
  name: string;
  columns: string[];
  conflictColumns: string[];
  orderBy?: string[];
  dateColumns?: string[];
  totalColumn?: string;
};

type TableDryRunSummary = {
  table: string;
  exists: boolean;
  rows: number;
  importedColumns: string[];
  missingColumns: string[];
  dateRange?: { column: string; min: string | null; max: string | null };
  overlapWithPosDays?: number;
  totalsByYear?: Array<{ year: string; total: number }>;
  sampleRows?: QueryResultRow[];
  note?: string;
};

type ImportSummary = {
  tables: Array<{ table: string; selected: number; upserted: number; skipped: number; note?: string }>;
  startedAt: string;
  finishedAt?: string;
};

const TABLES: TableSpec[] = [
  {
    name: "documents",
    columns: [
      "id",
      "file_name",
      "source_path",
      "content_hash",
      "document_type",
      "status",
      "confidence",
      "extractor_version",
      "error_message",
      "created_at",
    ],
    conflictColumns: ["id"],
    orderBy: ["created_at", "id"],
    dateColumns: ["created_at"],
  },
  {
    name: "sales_reports",
    columns: ["id", "document_id", "business_date", "total_sales", "order_count", "average_ticket", "payment_mix"],
    conflictColumns: ["id"],
    orderBy: ["business_date", "id"],
    dateColumns: ["business_date"],
    totalColumn: "total_sales",
  },
  {
    name: "hourly_sales",
    columns: ["id", "document_id", "business_date", "hour_label", "sales", "order_count"],
    conflictColumns: ["id"],
    orderBy: ["business_date", "hour_label", "id"],
    dateColumns: ["business_date"],
    totalColumn: "sales",
  },
  {
    name: "product_sales",
    columns: [
      "id",
      "sales_report_id",
      "business_date",
      "product_code",
      "product_name",
      "units",
      "amount",
    ],
    conflictColumns: ["id"],
    orderBy: ["business_date", "product_name", "id"],
    dateColumns: ["business_date"],
    totalColumn: "amount",
  },
  {
    name: "hourly_product_sales",
    columns: [
      "id",
      "document_id",
      "business_date",
      "hour_label",
      "product_code",
      "product_name",
      "units",
      "amount",
    ],
    conflictColumns: ["id"],
    orderBy: ["business_date", "hour_label", "product_name", "id"],
    dateColumns: ["business_date"],
    totalColumn: "amount",
  },
  {
    name: "invoices",
    columns: [
      "id",
      "document_id",
      "supplier_name",
      "issue_date",
      "due_date",
      "total_amount",
      "tax_amount",
      "category",
    ],
    conflictColumns: ["id"],
    orderBy: ["issue_date", "id"],
    dateColumns: ["issue_date"],
    totalColumn: "total_amount",
  },
  {
    name: "invoice_lines",
    columns: ["id", "invoice_id", "description", "quantity", "unit_price", "amount", "vat_rate", "vat_amount"],
    conflictColumns: ["id"],
    orderBy: ["invoice_id", "id"],
    totalColumn: "amount",
  },
  {
    name: "payrolls",
    columns: ["id", "document_id", "employee_name", "pay_period", "gross_amount", "net_amount"],
    conflictColumns: ["id"],
    orderBy: ["pay_period", "employee_name", "id"],
    totalColumn: "net_amount",
  },
  {
    name: "alerts",
    columns: ["id", "title", "description", "severity", "created_at"],
    conflictColumns: ["id"],
    orderBy: ["created_at", "id"],
    dateColumns: ["created_at"],
  },
  {
    name: "telegram_users",
    columns: ["id", "telegram_user_id", "username", "display_name", "is_active", "created_at"],
    conflictColumns: ["id"],
    orderBy: ["created_at", "id"],
    dateColumns: ["created_at"],
  },
  {
    name: "telegram_messages",
    columns: ["id", "telegram_user_id", "username", "question", "answer", "created_at", "chat_id"],
    conflictColumns: ["id"],
    orderBy: ["created_at", "id"],
    dateColumns: ["created_at"],
  },
  {
    name: "sync_state",
    columns: ["sync_key", "sync_value", "updated_at"],
    conflictColumns: ["sync_key"],
    orderBy: ["sync_key"],
    dateColumns: ["updated_at"],
  },
  {
    name: "employees",
    columns: [
      "id",
      "name",
      "shift_start",
      "shift_end",
      "working_days_per_month",
      "hourly_cost",
      "is_active",
      "created_at",
    ],
    conflictColumns: ["id"],
    orderBy: ["name", "id"],
    dateColumns: ["created_at"],
  },
  {
    name: "employee_shifts",
    columns: ["id", "employee_id", "business_date", "shift_start", "shift_end", "created_at"],
    conflictColumns: ["employee_id", "business_date"],
    orderBy: ["business_date", "employee_id"],
    dateColumns: ["business_date", "created_at"],
  },
  {
    name: "product_costs",
    columns: ["id", "product_code", "product_name", "category", "unit_cost", "updated_at"],
    conflictColumns: ["product_code"],
    orderBy: ["product_code"],
    dateColumns: ["updated_at"],
    totalColumn: "unit_cost",
  },
  {
    name: "product_cost_history",
    columns: ["id", "product_code", "product_name", "unit_cost", "valid_from", "valid_until", "created_at"],
    conflictColumns: ["id"],
    orderBy: ["valid_from", "product_code", "id"],
    dateColumns: ["valid_from", "created_at"],
    totalColumn: "unit_cost",
  },
];

const BATCH_SIZE = 500;

function usage() {
  console.log(`
Usage:
  tsx scripts/import-old-dashboard-history.ts --dry-run
  tsx scripts/import-old-dashboard-history.ts --execute

Required env:
  OLD_DASHBOARD_DATABASE_URL  source database from old apolodash
  DASHBOARD_DATABASE_URL      target database from apolodashbprueba

Notes:
  --dry-run is the default and never writes.
  --execute creates/updates only public dashboard tables in the target.
  The script never writes into pos.orders or any POS operational table.
`);
}

function loadDotenvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt < 1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadDotenvFile(resolve(process.cwd(), ".env.local"));
  loadDotenvFile(resolve(process.cwd(), ".env"));
}

function quoteIdent(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function tableName(name: string) {
  return `public.${quoteIdent(name)}`;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function getColumns(client: Pool | PoolClient, table: string) {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function tableExists(client: Pool | PoolClient, table: string) {
  const result = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${table}`],
  );
  return Boolean(result.rows[0]?.exists);
}

async function targetHasPosOrders(client: Pool | PoolClient) {
  const result = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('pos.orders') IS NOT NULL AS exists",
  );
  return Boolean(result.rows[0]?.exists);
}

async function getTargetPosDays(client: Pool | PoolClient) {
  if (!(await targetHasPosOrders(client))) return new Set<string>();
  const result = await client.query<{ business_date: string }>(`
    SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Madrid')::date::text AS business_date
    FROM pos.orders
    WHERE status <> 'cancelled'
      AND payment_method <> 'parked'
  `);
  return new Set(result.rows.map((row) => row.business_date));
}

async function inspectTickets(source: Pool) {
  const result = await source.query<{ table_schema: string; table_name: string }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('public', 'pos')
      AND (
        table_name ILIKE '%order%'
        OR table_name ILIKE '%ticket%'
        OR table_name ILIKE '%line%'
      )
    ORDER BY table_schema, table_name
  `);
  const tables: Array<{ table_schema: string; table_name: string; row_count: string }> = [];
  for (const table of result.rows) {
    const count = await source.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`,
    );
    tables.push({ ...table, row_count: count.rows[0]?.count ?? "0" });
  }
  return tables;
}

async function getDateRange(source: Pool, spec: TableSpec, availableColumns: Set<string>) {
  const dateColumn = spec.dateColumns?.find((column) => availableColumns.has(column));
  if (!dateColumn) return undefined;
  const result = await source.query<{ min_value: unknown; max_value: unknown }>(
    `
      SELECT MIN(${quoteIdent(dateColumn)}) AS min_value, MAX(${quoteIdent(dateColumn)}) AS max_value
      FROM ${tableName(spec.name)}
    `,
  );
  return {
    column: dateColumn,
    min: normalizeDate(result.rows[0]?.min_value),
    max: normalizeDate(result.rows[0]?.max_value),
  };
}

async function getTotalsByYear(source: Pool, spec: TableSpec, availableColumns: Set<string>) {
  if (!spec.totalColumn || !availableColumns.has(spec.totalColumn)) return undefined;
  const dateColumn = spec.dateColumns?.find((column) => availableColumns.has(column));
  if (!dateColumn) return undefined;
  const result = await source.query<{ year: string; total: string }>(
    `
      SELECT EXTRACT(YEAR FROM ${quoteIdent(dateColumn)})::int::text AS year,
             COALESCE(SUM(${quoteIdent(spec.totalColumn)}), 0)::text AS total
      FROM ${tableName(spec.name)}
      WHERE ${quoteIdent(dateColumn)} IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `,
  );
  return result.rows.map((row) => ({ year: row.year, total: toNumber(row.total) }));
}

async function getOverlapWithPosDays(
  source: Pool,
  spec: TableSpec,
  availableColumns: Set<string>,
  targetPosDays: Set<string>,
) {
  if (!availableColumns.has("business_date") || targetPosDays.size === 0) return undefined;
  const result = await source.query<{ business_date: string }>(
    `SELECT DISTINCT business_date::date::text AS business_date FROM ${tableName(spec.name)}`,
  );
  let overlap = 0;
  for (const row of result.rows) {
    if (targetPosDays.has(row.business_date)) overlap += 1;
  }
  return overlap;
}

async function runDryRun(source: Pool, target: Pool) {
  console.log("Dry-run: no se escribira nada.");
  console.log("Conectando origen antiguo y destino nuevo...");

  const targetPosDays = await getTargetPosDays(target);
  const ticketTables = await inspectTickets(source);

  console.log(`Dias con pedidos reales POS en destino: ${targetPosDays.size}`);
  if (ticketTables.length > 0) {
    console.log("Posibles tablas de tickets reales encontradas en origen:");
    for (const table of ticketTables) {
      console.log(`  - ${table.table_schema}.${table.table_name}: ${table.row_count} filas`);
    }
  } else {
    console.log("No se han detectado tablas claras de tickets reales en origen.");
  }

  const summaries: TableDryRunSummary[] = [];
  for (const spec of TABLES) {
    const exists = await tableExists(source, spec.name);
    if (!exists) {
      summaries.push({
        table: spec.name,
        exists: false,
        rows: 0,
        importedColumns: [],
        missingColumns: spec.columns,
        note: "No existe en origen.",
      });
      continue;
    }

    const columns = await getColumns(source, spec.name);
    const importedColumns = spec.columns.filter((column) => columns.has(column));
    const missingColumns = spec.columns.filter((column) => !columns.has(column));
    const missingKeys = spec.conflictColumns.filter((column) => !columns.has(column));
    const countResult = await source.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName(spec.name)}`);
    const dateRange = await getDateRange(source, spec, columns);
    const overlapWithPosDays = await getOverlapWithPosDays(source, spec, columns, targetPosDays);
    const totalsByYear = await getTotalsByYear(source, spec, columns);
    const sampleResult = importedColumns.length > 0
      ? await source.query(
          `
            SELECT ${importedColumns.map(quoteIdent).join(", ")}
            FROM ${tableName(spec.name)}
            ${buildOrderBy(spec, importedColumns)}
            LIMIT 3
          `,
        )
      : { rows: [] };

    summaries.push({
      table: spec.name,
      exists: true,
      rows: Number(countResult.rows[0]?.count ?? 0),
      importedColumns,
      missingColumns,
      dateRange,
      overlapWithPosDays,
      totalsByYear,
      sampleRows: sampleResult.rows,
      note: missingKeys.length > 0 ? `No se puede importar: faltan claves ${missingKeys.join(", ")}.` : undefined,
    });
  }

  console.log("\nResumen de tablas antiguas:");
  for (const summary of summaries) {
    const range = summary.dateRange
      ? ` rango ${summary.dateRange.column}: ${summary.dateRange.min ?? "-"} -> ${summary.dateRange.max ?? "-"}`
      : "";
    const overlap = summary.overlapWithPosDays != null ? ` solape POS: ${summary.overlapWithPosDays} dias` : "";
    console.log(`  - ${summary.table}: ${summary.exists ? `${summary.rows} filas` : "no existe"}${range}${overlap}`);
    if (summary.note) console.log(`    ${summary.note}`);
    if (summary.missingColumns.length > 0 && summary.exists) {
      console.log(`    Columnas no disponibles: ${summary.missingColumns.join(", ")}`);
    }
    if (summary.totalsByYear && summary.totalsByYear.length > 0) {
      const totals = summary.totalsByYear.map((row) => `${row.year}: ${row.total.toFixed(2)}`).join(" | ");
      console.log(`    Totales por anyo: ${totals}`);
    }
  }

  console.log("\nDry-run terminado. Para importar de verdad: tsx scripts/import-old-dashboard-history.ts --execute");
}

function buildOrderBy(spec: TableSpec, selectedColumns: string[]) {
  const orderColumns = spec.orderBy?.filter((column) => selectedColumns.includes(column)) ?? [];
  if (orderColumns.length === 0) return "";
  return `ORDER BY ${orderColumns.map(quoteIdent).join(", ")}`;
}

async function readIdSet(client: Pool | PoolClient, table: string) {
  if (!(await tableExists(client, table))) return new Set<string>();
  const result = await client.query<{ id: string }>(`SELECT id FROM ${tableName(table)}`);
  return new Set(result.rows.map((row) => String(row.id)));
}

async function sanitizeRows(
  target: PoolClient,
  spec: TableSpec,
  selectedColumns: string[],
  rows: QueryResultRow[],
) {
  let sanitized = rows;

  if (selectedColumns.includes("document_id")) {
    const documentIds = await readIdSet(target, "documents");
    sanitized = sanitized.map((row) => {
      if (!row.document_id || documentIds.has(String(row.document_id))) return row;
      return { ...row, document_id: null };
    });
  }

  if (spec.name === "product_sales" && selectedColumns.includes("sales_report_id")) {
    const reportIds = await readIdSet(target, "sales_reports");
    sanitized = sanitized.map((row) => {
      if (!row.sales_report_id || reportIds.has(String(row.sales_report_id))) return row;
      return { ...row, sales_report_id: null };
    });
  }

  if (spec.name === "invoice_lines") {
    const invoiceIds = await readIdSet(target, "invoices");
    sanitized = sanitized.filter((row) => row.invoice_id && invoiceIds.has(String(row.invoice_id)));
  }

  if (spec.name === "employee_shifts") {
    const employeeIds = await readIdSet(target, "employees");
    sanitized = sanitized.filter((row) => row.employee_id && employeeIds.has(String(row.employee_id)));
  }

  return sanitized;
}

function buildUpsertSql(spec: TableSpec, selectedColumns: string[], rowCount: number) {
  const columnSql = selectedColumns.map(quoteIdent).join(", ");
  const valuesSql: string[] = [];
  let index = 1;
  for (let row = 0; row < rowCount; row += 1) {
    const params: string[] = [];
    for (let column = 0; column < selectedColumns.length; column += 1) {
      params.push(`$${index}`);
      index += 1;
    }
    valuesSql.push(`(${params.join(", ")})`);
  }

  const updateColumns = selectedColumns.filter((column) => !spec.conflictColumns.includes(column));
  const conflictSql = spec.conflictColumns.map(quoteIdent).join(", ");
  const updateSql = updateColumns.length > 0
    ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(", ")}`
    : "DO NOTHING";

  return `
    INSERT INTO ${tableName(spec.name)} (${columnSql})
    VALUES ${valuesSql.join(", ")}
    ON CONFLICT (${conflictSql}) ${updateSql}
  `;
}

async function importTable(source: Pool, target: PoolClient, spec: TableSpec) {
  const exists = await tableExists(source, spec.name);
  if (!exists) {
    return { table: spec.name, selected: 0, upserted: 0, skipped: 0, note: "No existe en origen." };
  }

  const sourceColumns = await getColumns(source, spec.name);
  const targetColumns = await getColumns(target, spec.name);
  const selectedColumns = spec.columns.filter((column) => sourceColumns.has(column) && targetColumns.has(column));
  const missingKeys = spec.conflictColumns.filter((column) => !selectedColumns.includes(column));
  if (missingKeys.length > 0 || selectedColumns.length === 0) {
    return {
      table: spec.name,
      selected: 0,
      upserted: 0,
      skipped: 0,
      note: `Saltada: faltan claves ${missingKeys.join(", ") || "columnas"}.`,
    };
  }

  const countResult = await source.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName(spec.name)}`);
  const selected = Number(countResult.rows[0]?.count ?? 0);
  let offset = 0;
  let upserted = 0;
  let skipped = 0;

  while (offset < selected) {
    const result = await source.query(
      `
        SELECT ${selectedColumns.map(quoteIdent).join(", ")}
        FROM ${tableName(spec.name)}
        ${buildOrderBy(spec, selectedColumns)}
        LIMIT $1 OFFSET $2
      `,
      [BATCH_SIZE, offset],
    );
    offset += BATCH_SIZE;
    if (result.rows.length === 0) continue;

    const rows = await sanitizeRows(target, spec, selectedColumns, result.rows);
    skipped += result.rows.length - rows.length;
    if (rows.length === 0) continue;

    const params = rows.flatMap((row) => selectedColumns.map((column) => row[column]));
    const sql = buildUpsertSql(spec, selectedColumns, rows.length);
    await target.query(sql, params);
    upserted += rows.length;
  }

  return { table: spec.name, selected, upserted, skipped };
}

async function ensureImportAudit(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS legacy_import_batches (
      id TEXT PRIMARY KEY,
      source_label TEXT NOT NULL,
      dry_run BOOLEAN NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
}

async function executeImport(source: Pool, target: Pool) {
  console.log("Importacion real: se escribira solo en tablas publicas del dashboard nuevo.");
  const client = await target.connect();
  const summary: ImportSummary = { tables: [], startedAt: new Date().toISOString() };
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await ensureImportAudit(client);

    for (const spec of TABLES) {
      const tableSummary = await importTable(source, client, spec);
      summary.tables.push(tableSummary);
      const note = tableSummary.note ? ` (${tableSummary.note})` : "";
      console.log(
        `  - ${spec.name}: ${tableSummary.upserted}/${tableSummary.selected} filas preparadas, ${tableSummary.skipped} saltadas${note}`,
      );
    }

    summary.finishedAt = new Date().toISOString();
    await client.query(
      `
        INSERT INTO legacy_import_batches (id, source_label, dry_run, started_at, finished_at, summary)
        VALUES ($1, $2, false, $3, $4, $5)
      `,
      [randomUUID(), "legacy_dashboard", summary.startedAt, summary.finishedAt, JSON.stringify(summary)],
    );
    await client.query("COMMIT");
    console.log("Importacion terminada.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const execute = args.includes("--execute");
  const isDryRun = args.includes("--dry-run") || !execute;
  if (execute && args.includes("--dry-run")) {
    throw new Error("Usa --dry-run o --execute, no ambos.");
  }

  const oldUrl = process.env.OLD_DASHBOARD_DATABASE_URL;
  const targetUrl = process.env.DASHBOARD_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!oldUrl) {
    throw new Error("Falta OLD_DASHBOARD_DATABASE_URL. No pegues la URL en codigo; ponla en .env.local o en el entorno.");
  }
  if (!targetUrl) {
    throw new Error("Falta DASHBOARD_DATABASE_URL o DATABASE_URL para el dashboard nuevo.");
  }
  if (oldUrl === targetUrl) {
    throw new Error("Origen y destino parecen la misma BD. Abortado para evitar duplicados.");
  }

  const source = new Pool({ connectionString: oldUrl, max: 3 });
  const target = new Pool({ connectionString: targetUrl, max: 3 });

  try {
    if (isDryRun) {
      await dryRunImportSafety(source, target);
      await runDryRun(source, target);
      return;
    }
    await dryRunImportSafety(source, target);
    await executeImport(source, target);
  } finally {
    await source.end();
    await target.end();
  }
}

async function dryRunImportSafety(source: Pool, target: Pool) {
  await source.query("SELECT 1");
  await target.query("SELECT 1");
  console.log("Conexiones OK. URLs ocultas por seguridad.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
