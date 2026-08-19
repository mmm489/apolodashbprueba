import { randomUUID } from "node:crypto";

import { getSql, hasDatabase, isPosDataSource } from "@/lib/db";
import { toDashboardDateOnly } from "@/lib/timezone";
import type {
  ConsumableProductUsage,
  ProcurementConsumable,
  ProcurementProduct,
  ProcurementSuggestion,
  ProcurementWorkspace,
  PurchaseOrder,
  PurchaseOrderStatus,
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

type DashboardSql = ReturnType<typeof getSql>;

let procurementSchemaEnsured = false;

export async function ensureProcurementSchema(sql: DashboardSql = getSql()) {
  if (procurementSchemaEnsured) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS procurement_consumables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      supplier_name TEXT NOT NULL DEFAULT 'Sin proveedor',
      unit TEXT NOT NULL DEFAULT 'ud',
      pack_size NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (pack_size > 0),
      pack_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pack_cost >= 0),
      current_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
      safety_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
      coverage_days INTEGER NOT NULL DEFAULT 7 CHECK (coverage_days BETWEEN 1 AND 90),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      stock_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS procurement_product_usage (
      id TEXT PRIMARY KEY,
      consumable_id TEXT NOT NULL REFERENCES procurement_consumables(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      quantity_per_sale NUMERIC(12,4) NOT NULL CHECK (quantity_per_sale > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(consumable_id, product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS procurement_purchase_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      supplier_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
      analysis_from DATE,
      analysis_to DATE,
      notes TEXT,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ordered_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS procurement_purchase_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES procurement_purchase_orders(id) ON DELETE CASCADE,
      consumable_id TEXT NOT NULL REFERENCES procurement_consumables(id),
      consumable_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      packs NUMERIC(12,2) NOT NULL CHECK (packs > 0),
      pack_size NUMERIC(12,3) NOT NULL CHECK (pack_size > 0),
      ordered_units NUMERIC(12,3) NOT NULL CHECK (ordered_units > 0),
      pack_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_usage_consumable ON procurement_product_usage(consumable_id)`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_usage_product ON procurement_product_usage(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_orders_created ON procurement_purchase_orders(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_orders_status ON procurement_purchase_orders(status, created_at DESC)`,
  ];

  for (const statement of statements) await sql.query(statement);
  procurementSchemaEnsured = true;
}

export function defaultProcurementRange() {
  const to = toDashboardDateOnly(new Date());
  return { from: addIsoDays(to, -27), to };
}

export async function getProcurementWorkspace(from?: string, to?: string): Promise<ProcurementWorkspace> {
  const fallbackRange = defaultProcurementRange();
  const safeFrom = validIsoDate(from) ? from! : fallbackRange.from;
  const safeTo = validIsoDate(to) ? to! : fallbackRange.to;
  if (safeFrom > safeTo) throw new Error("La fecha inicial no puede ser posterior a la final.");

  if (!hasDatabase()) {
    return { from: safeFrom, to: safeTo, analysisDays: inclusiveDays(safeFrom, safeTo), products: [], consumables: [], suggestions: [], orders: [] };
  }

  const sql = getSql();
  await ensureProcurementSchema(sql);
  const products = await listProcurementProducts(sql);
  const consumableRows = await sql.query(`
    SELECT id, name, sku, supplier_name, unit, pack_size, pack_cost, current_stock,
           safety_stock, coverage_days, active, stock_updated_at, updated_at
    FROM procurement_consumables
    ORDER BY active DESC, supplier_name ASC, name ASC
  `);
  const mappingRows = await sql.query(`
    SELECT u.id, u.consumable_id, u.product_id, u.quantity_per_sale,
           COALESCE(p.name, 'Producto no disponible') AS product_name,
           COALESCE(c.name, 'Sin categoria') AS category_name
    FROM procurement_product_usage u
    LEFT JOIN pos.products p ON p.id::text = u.product_id
    LEFT JOIN pos.categories c ON c.id = p.category_id
    ORDER BY product_name ASC
  `).catch(() => [] as Record<string, unknown>[]);
  const consumptionRows = await listConsumption(sql, safeFrom, safeTo);
  const orders = await listPurchaseOrders(sql);
  const mappingsByConsumable = new Map<string, ConsumableProductUsage[]>();

  for (const row of mappingRows) {
    const consumableId = String(row.consumable_id);
    const items = mappingsByConsumable.get(consumableId) ?? [];
    items.push({
      id: String(row.id),
      consumableId,
      productId: String(row.product_id),
      productName: String(row.product_name),
      categoryName: String(row.category_name),
      quantityPerSale: toNumber(row.quantity_per_sale),
    });
    mappingsByConsumable.set(consumableId, items);
  }

  const consumables = consumableRows.map((row) => mapConsumable(row, mappingsByConsumable.get(String(row.id)) ?? []));
  const consumedById = new Map(consumptionRows.map((row) => [String(row.consumable_id), toNumber(row.consumed)]));
  const analysisDays = inclusiveDays(safeFrom, safeTo);
  const suggestions = consumables
    .filter((item) => item.active)
    .map((item) => buildSuggestion(item, consumedById.get(item.id) ?? 0, analysisDays))
    .sort((a, b) => Number(b.suggestedPacks > 0) - Number(a.suggestedPacks > 0) || a.supplierName.localeCompare(b.supplierName) || a.name.localeCompare(b.name));

  return { from: safeFrom, to: safeTo, analysisDays, products, consumables, suggestions, orders };
}

export async function upsertConsumable(input: {
  id?: string;
  name: string;
  sku?: string | null;
  supplierName?: string;
  unit?: string;
  packSize?: number;
  packCost?: number;
  currentStock?: number;
  safetyStock?: number;
  coverageDays?: number;
  active?: boolean;
}) {
  assertDatabase();
  const sql = getSql();
  await ensureProcurementSchema(sql);
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre del consumible.");
  const supplierName = input.supplierName?.trim() || "Sin proveedor";
  const unit = input.unit?.trim() || "ud";
  const packSize = positiveNumber(input.packSize, 1, "El contenido por paquete debe ser mayor que cero.");
  const packCost = nonNegativeNumber(input.packCost, 0, "El coste del paquete no puede ser negativo.");
  const currentStock = nonNegativeNumber(input.currentStock, 0, "El stock no puede ser negativo.");
  const safetyStock = nonNegativeNumber(input.safetyStock, 0, "El stock de seguridad no puede ser negativo.");
  const coverageDays = Math.max(1, Math.min(90, Math.round(nonNegativeNumber(input.coverageDays, 7, "Los dias de cobertura no son validos."))));
  const active = input.active !== false;
  const id = input.id?.trim() || randomUUID();

  if (input.id) {
    const rows = await sql.query(`
      UPDATE procurement_consumables
      SET name = $2, sku = $3, supplier_name = $4, unit = $5, pack_size = $6,
          pack_cost = $7,
          stock_updated_at = CASE WHEN current_stock IS DISTINCT FROM $8::numeric THEN NOW() ELSE stock_updated_at END,
          current_stock = $8, safety_stock = $9, coverage_days = $10, active = $11, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [id, name, input.sku?.trim() || null, supplierName, unit, packSize, packCost, currentStock, safetyStock, coverageDays, active]);
    if (!rows[0]) throw new Error("No se ha encontrado el consumible.");
  } else {
    await sql.query(`
      INSERT INTO procurement_consumables
        (id, name, sku, supplier_name, unit, pack_size, pack_cost, current_stock, safety_stock, coverage_days, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, name, input.sku?.trim() || null, supplierName, unit, packSize, packCost, currentStock, safetyStock, coverageDays, active]);
  }
  return id;
}

export async function upsertConsumableUsage(input: {
  consumableId: string;
  productId: string;
  quantityPerSale: number;
}) {
  assertDatabase();
  const sql = getSql();
  await ensureProcurementSchema(sql);
  const quantity = positiveNumber(input.quantityPerSale, 0, "El consumo por venta debe ser mayor que cero.");
  const productRows = await sql.query("SELECT id FROM pos.products WHERE id::text = $1", [input.productId]);
  if (!productRows[0]) throw new Error("No se ha encontrado el producto del POS.");
  const consumableRows = await sql.query("SELECT id FROM procurement_consumables WHERE id = $1", [input.consumableId]);
  if (!consumableRows[0]) throw new Error("No se ha encontrado el consumible.");
  const id = randomUUID();
  await sql.query(`
    INSERT INTO procurement_product_usage (id, consumable_id, product_id, quantity_per_sale)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (consumable_id, product_id)
    DO UPDATE SET quantity_per_sale = EXCLUDED.quantity_per_sale, updated_at = NOW()
  `, [id, input.consumableId, input.productId, quantity]);
}

export async function deleteConsumableUsage(consumableId: string, productId: string) {
  assertDatabase();
  const sql = getSql();
  await ensureProcurementSchema(sql);
  await sql.query("DELETE FROM procurement_product_usage WHERE consumable_id = $1 AND product_id = $2", [consumableId, productId]);
}

export async function createSuggestedPurchaseOrders(input: {
  from: string;
  to: string;
  notes?: string;
  items: Array<{ consumableId: string; packs: number }>;
}) {
  assertDatabase();
  if (!validIsoDate(input.from) || !validIsoDate(input.to)) throw new Error("El periodo de analisis no es valido.");
  const requested = input.items
    .map((item) => ({ consumableId: String(item.consumableId), packs: Number(item.packs) }))
    .filter((item) => item.consumableId && Number.isFinite(item.packs) && item.packs > 0);
  if (requested.length === 0) throw new Error("Selecciona al menos un consumible para crear el pedido.");

  const sql = getSql();
  await ensureProcurementSchema(sql);
  const ids = [...new Set(requested.map((item) => item.consumableId))];
  const rows = await sql.query(`
    SELECT id, name, supplier_name, unit, pack_size, pack_cost
    FROM procurement_consumables
    WHERE active = TRUE AND id = ANY($1::text[])
  `, [ids]);
  const consumables = new Map(rows.map((row) => [String(row.id), row]));
  const grouped = new Map<string, typeof requested>();

  for (const item of requested) {
    const consumable = consumables.get(item.consumableId);
    if (!consumable) continue;
    const supplier = String(consumable.supplier_name || "Sin proveedor");
    const group = grouped.get(supplier) ?? [];
    group.push(item);
    grouped.set(supplier, group);
  }
  if (grouped.size === 0) throw new Error("No hay consumibles validos para crear el pedido.");

  const created: string[] = [];
  for (const [supplierName, items] of grouped) {
    const orderId = randomUUID();
    const orderNumber = buildOrderNumber();
    const lines = items.map((item) => {
      const consumable = consumables.get(item.consumableId)!;
      const packSize = toNumber(consumable.pack_size, 1);
      const packCost = toNumber(consumable.pack_cost);
      return {
        id: randomUUID(),
        consumableId: item.consumableId,
        name: String(consumable.name),
        unit: String(consumable.unit),
        packs: roundQuantity(item.packs),
        packSize,
        packCost,
        orderedUnits: roundQuantity(item.packs * packSize),
        lineTotal: roundMoney(item.packs * packCost),
      };
    });
    const total = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    await sql.query(`
      INSERT INTO procurement_purchase_orders
        (id, order_number, supplier_name, status, analysis_from, analysis_to, notes, total_amount)
      VALUES ($1, $2, $3, 'draft', $4::date, $5::date, $6, $7)
    `, [orderId, orderNumber, supplierName, input.from, input.to, input.notes?.trim() || null, total]);
    for (const line of lines) {
      await sql.query(`
        INSERT INTO procurement_purchase_order_items
          (id, order_id, consumable_id, consumable_name, unit, packs, pack_size, ordered_units, pack_cost, line_total)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [line.id, orderId, line.consumableId, line.name, line.unit, line.packs, line.packSize, line.orderedUnits, line.packCost, line.lineTotal]);
    }
    created.push(orderId);
  }
  return created;
}

export async function updatePurchaseOrderStatus(orderId: string, status: PurchaseOrderStatus) {
  assertDatabase();
  if (!["draft", "ordered", "received", "cancelled"].includes(status)) throw new Error("Estado de pedido no valido.");
  const sql = getSql();
  await ensureProcurementSchema(sql);
  const currentRows = await sql.query("SELECT status FROM procurement_purchase_orders WHERE id = $1", [orderId]);
  const currentStatus = currentRows[0] ? String(currentRows[0].status) as PurchaseOrderStatus : null;
  if (!currentStatus) throw new Error("No se ha encontrado el pedido.");
  if (currentStatus === "received" && status !== "received") throw new Error("Un pedido recibido ya ha actualizado el stock y no se puede reabrir.");

  if (status === "received" && currentStatus !== "received") {
    await sql.query(`
      UPDATE procurement_consumables c
      SET current_stock = c.current_stock + i.ordered_units,
          stock_updated_at = NOW(), updated_at = NOW()
      FROM procurement_purchase_order_items i
      WHERE i.order_id = $1 AND i.consumable_id = c.id
    `, [orderId]);
  }
  await sql.query(`
    UPDATE procurement_purchase_orders
    SET status = $2,
        ordered_at = CASE WHEN $2 = 'ordered' AND ordered_at IS NULL THEN NOW() ELSE ordered_at END,
        received_at = CASE WHEN $2 = 'received' AND received_at IS NULL THEN NOW() ELSE received_at END,
        updated_at = NOW()
    WHERE id = $1
  `, [orderId, status]);
}

async function listProcurementProducts(sql: DashboardSql): Promise<ProcurementProduct[]> {
  if (!isPosDataSource()) return [];
  const exists = await sql.query("SELECT to_regclass('pos.products') AS table_name");
  if (!exists[0]?.table_name) return [];
  const rows = await sql.query(`
    SELECT p.id, p.name, p.active, COALESCE(c.name, 'Sin categoria') AS category_name
    FROM pos.products p
    LEFT JOIN pos.categories c ON c.id = p.category_id
    ORDER BY p.active DESC, c.name ASC, p.name ASC
  `);
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    categoryName: String(row.category_name),
    active: Boolean(row.active),
  }));
}

async function listConsumption(sql: DashboardSql, from: string, to: string) {
  if (!isPosDataSource()) return [] as Record<string, unknown>[];
  const exists = await sql.query("SELECT to_regclass('pos.orders') AS orders, to_regclass('pos.order_items') AS items");
  if (!exists[0]?.orders || !exists[0]?.items) return [] as Record<string, unknown>[];
  return sql.query(`
    SELECT u.consumable_id, SUM(COALESCE(oi.qty, 0) * u.quantity_per_sale)::float AS consumed
    FROM procurement_product_usage u
    JOIN pos.order_items oi ON oi.product_id::text = u.product_id
    JOIN pos.orders o ON o.id = oi.order_id
    WHERE o.status = 'completed'
      AND COALESCE(o.business_unit, 'hicream') = 'hicream'
      AND ((o.created_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date BETWEEN $1::date AND $2::date
    GROUP BY u.consumable_id
  `, [from, to]);
}

async function listPurchaseOrders(sql: DashboardSql): Promise<PurchaseOrder[]> {
  const orderRows = await sql.query(`
    SELECT id, order_number, supplier_name, status, analysis_from, analysis_to, notes,
           total_amount, created_at, ordered_at, received_at
    FROM procurement_purchase_orders
    ORDER BY created_at DESC
    LIMIT 200
  `);
  const itemRows = await sql.query(`
    SELECT id, order_id, consumable_id, consumable_name, unit, packs, pack_size,
           ordered_units, pack_cost, line_total
    FROM procurement_purchase_order_items
    WHERE order_id = ANY($1::text[])
    ORDER BY created_at ASC
  `, [orderRows.map((row) => String(row.id))]);
  const byOrder = new Map<string, PurchaseOrder["items"]>();
  for (const row of itemRows) {
    const orderId = String(row.order_id);
    const items = byOrder.get(orderId) ?? [];
    items.push({
      id: String(row.id),
      consumableId: String(row.consumable_id),
      consumableName: String(row.consumable_name),
      unit: String(row.unit),
      packs: toNumber(row.packs),
      packSize: toNumber(row.pack_size),
      orderedUnits: toNumber(row.ordered_units),
      packCost: toNumber(row.pack_cost),
      lineTotal: toNumber(row.line_total),
    });
    byOrder.set(orderId, items);
  }
  return orderRows.map((row) => ({
    id: String(row.id),
    orderNumber: String(row.order_number),
    supplierName: String(row.supplier_name),
    status: String(row.status) as PurchaseOrderStatus,
    analysisFrom: row.analysis_from ? dateOnly(row.analysis_from) : null,
    analysisTo: row.analysis_to ? dateOnly(row.analysis_to) : null,
    notes: row.notes ? String(row.notes) : null,
    totalAmount: toNumber(row.total_amount),
    createdAt: new Date(String(row.created_at)).toISOString(),
    orderedAt: row.ordered_at ? new Date(String(row.ordered_at)).toISOString() : null,
    receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : null,
    items: byOrder.get(String(row.id)) ?? [],
  }));
}

function mapConsumable(row: Record<string, unknown>, mappings: ConsumableProductUsage[]): ProcurementConsumable {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: row.sku ? String(row.sku) : null,
    supplierName: String(row.supplier_name || "Sin proveedor"),
    unit: String(row.unit || "ud"),
    packSize: toNumber(row.pack_size, 1),
    packCost: toNumber(row.pack_cost),
    currentStock: toNumber(row.current_stock),
    safetyStock: toNumber(row.safety_stock),
    coverageDays: Math.max(1, Math.round(toNumber(row.coverage_days, 7))),
    active: Boolean(row.active),
    stockUpdatedAt: new Date(String(row.stock_updated_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    mappings,
  };
}

function buildSuggestion(item: ProcurementConsumable, consumed: number, analysisDays: number): ProcurementSuggestion {
  const averageDailyUsage = analysisDays > 0 ? consumed / analysisDays : 0;
  const targetStock = averageDailyUsage * item.coverageDays + item.safetyStock;
  const neededUnits = Math.max(0, targetStock - item.currentStock);
  const suggestedPacks = neededUnits > 0 ? Math.ceil(neededUnits / item.packSize) : 0;
  return {
    consumableId: item.id,
    name: item.name,
    supplierName: item.supplierName,
    unit: item.unit,
    currentStock: roundQuantity(item.currentStock),
    consumedInPeriod: roundQuantity(consumed),
    averageDailyUsage: roundQuantity(averageDailyUsage),
    coverageDays: item.coverageDays,
    currentCoverageDays: averageDailyUsage > 0 ? roundQuantity(item.currentStock / averageDailyUsage) : null,
    safetyStock: item.safetyStock,
    targetStock: roundQuantity(targetStock),
    neededUnits: roundQuantity(neededUnits),
    packSize: item.packSize,
    suggestedPacks,
    packCost: item.packCost,
    estimatedCost: roundMoney(suggestedPacks * item.packCost),
    mappingCount: item.mappings.length,
  };
}

function assertDatabase() {
  if (!hasDatabase()) throw new Error("No hay una base de datos configurada.");
}

function positiveNumber(value: unknown, fallback: number, message: string) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(message);
  return parsed;
}

function nonNegativeNumber(value: unknown, fallback: number, message: string) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(message);
  return parsed;
}

function validIsoDate(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()));
}

function inclusiveDays(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? toDashboardDateOnly(new Date(text));
}

function buildOrderNumber() {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(/\D/g, "");
  return `COMP-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
