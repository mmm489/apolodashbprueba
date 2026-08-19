"use client";

import { useState, useTransition } from "react";
import {
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Link2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { formatDashboardDate, formatDashboardDateTime } from "@/lib/timezone";
import type {
  ProcurementConsumable,
  ProcurementProduct,
  ProcurementSuggestion,
  ProcurementWorkspace,
  PurchaseOrder,
  PurchaseOrderStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const NUMBER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });

type Tab = "suggestions" | "consumables" | "orders";
type ConsumableForm = {
  id?: string;
  name: string;
  sku: string;
  supplierName: string;
  unit: string;
  packSize: string;
  packCost: string;
  currentStock: string;
  safetyStock: string;
  coverageDays: string;
  active: boolean;
};

export function ProcurementPanel({ initialWorkspace }: { initialWorkspace: ProcurementWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState<Tab>("suggestions");
  const [from, setFrom] = useState(initialWorkspace.from);
  const [to, setTo] = useState(initialWorkspace.to);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packOverrides, setPackOverrides] = useState<Record<string, number>>(() => suggestionPacks(initialWorkspace));
  const [editingConsumable, setEditingConsumable] = useState<ProcurementConsumable | "new" | null>(null);
  const [mappingConsumableId, setMappingConsumableId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const mappingConsumable = workspace.consumables.find((item) => item.id === mappingConsumableId) ?? null;
  const selectedOrderItems = workspace.suggestions
    .filter((item) => selected.has(item.consumableId) && (packOverrides[item.consumableId] ?? 0) > 0)
    .map((item) => ({ consumableId: item.consumableId, packs: packOverrides[item.consumableId] }));

  function refresh(customFrom = from, customTo = to, successMessage?: string) {
    startTransition(async () => {
      try {
        setMessage(null);
        const next = await fetch(`/api/procurement?from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`, { cache: "no-store" });
        const data = await parseResponse<ProcurementWorkspace>(next);
        setWorkspace(data);
        setFrom(data.from);
        setTo(data.to);
        setPackOverrides(suggestionPacks(data));
        setSelected(new Set());
        if (successMessage) setMessage({ tone: "ok", text: successMessage });
      } catch (error) {
        setMessage({ tone: "error", text: errorMessage(error) });
      }
    });
  }

  function runMutation(body: Record<string, unknown>, successMessage: string, after?: () => void) {
    startTransition(async () => {
      try {
        setMessage(null);
        const response = await fetch("/api/procurement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await parseResponse(response);
        after?.();
        const next = await fetch(`/api/procurement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
        const data = await parseResponse<ProcurementWorkspace>(next);
        setWorkspace(data);
        setPackOverrides(suggestionPacks(data));
        setMessage({ tone: "ok", text: successMessage });
      } catch (error) {
        setMessage({ tone: "error", text: errorMessage(error) });
      }
    });
  }

  function createOrders() {
    if (selectedOrderItems.length === 0) {
      setMessage({ tone: "error", text: "Selecciona consumibles e indica al menos un paquete." });
      return;
    }
    runMutation(
      { action: "create-orders", from, to, items: selectedOrderItems },
      "Pedidos en borrador creados y agrupados por proveedor.",
      () => {
        setSelected(new Set());
        setTab("orders");
      },
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <ProcurementHeader
        workspace={workspace}
        from={from}
        to={to}
        isPending={isPending}
        onFromChange={setFrom}
        onToChange={setTo}
        onRefresh={() => refresh()}
      />

      {message && (
        <div className={cn(
          "rounded-xl border px-4 py-3 text-sm font-semibold",
          message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700",
        )}>
          {message.text}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--line)] bg-white p-1 shadow-sm">
        <TabButton active={tab === "suggestions"} icon={ShoppingCart} onClick={() => setTab("suggestions")}>
          Propuesta <Count value={workspace.suggestions.filter((item) => item.suggestedPacks > 0).length} />
        </TabButton>
        <TabButton active={tab === "consumables"} icon={Box} onClick={() => setTab("consumables")}>
          Consumibles <Count value={workspace.consumables.filter((item) => item.active).length} />
        </TabButton>
        <TabButton active={tab === "orders"} icon={ClipboardList} onClick={() => setTab("orders")}>
          Pedidos <Count value={workspace.orders.length} />
        </TabButton>
      </div>

      {tab === "suggestions" && (
        <SuggestionsView
          workspace={workspace}
          selected={selected}
          packOverrides={packOverrides}
          isPending={isPending}
          onToggle={(id) => setSelected((current) => toggleSet(current, id))}
          onPacksChange={(id, packs) => setPackOverrides((current) => ({ ...current, [id]: packs }))}
          onCreateOrders={createOrders}
          onAddConsumable={() => setEditingConsumable("new")}
          onOpenMappings={setMappingConsumableId}
        />
      )}

      {tab === "consumables" && (
        <ConsumablesView
          consumables={workspace.consumables}
          onAdd={() => setEditingConsumable("new")}
          onEdit={setEditingConsumable}
          onMappings={setMappingConsumableId}
        />
      )}

      {tab === "orders" && (
        <OrdersView
          orders={workspace.orders}
          isPending={isPending}
          onStatus={(order, status) => runMutation(
            { action: "update-order-status", orderId: order.id, status },
            status === "received" ? "Pedido recibido: el stock se ha actualizado." : "Estado del pedido actualizado.",
          )}
        />
      )}

      {editingConsumable && (
        <ConsumableModal
          consumable={editingConsumable === "new" ? null : editingConsumable}
          isPending={isPending}
          onClose={() => setEditingConsumable(null)}
          onSave={(form) => runMutation(
            { action: "save-consumable", ...serializeConsumableForm(form) },
            form.id ? "Consumible actualizado." : "Consumible creado. Ahora relaciona los productos que lo consumen.",
            () => setEditingConsumable(null),
          )}
        />
      )}

      {mappingConsumable && (
        <MappingsModal
          consumable={mappingConsumable}
          products={workspace.products}
          isPending={isPending}
          onClose={() => setMappingConsumableId(null)}
          onSave={(productId, quantityPerSale) => runMutation(
            { action: "save-usage", consumableId: mappingConsumable.id, productId, quantityPerSale },
            "Relación guardada. La propuesta ya tendrá en cuenta esas ventas.",
          )}
          onDelete={(productId) => runMutation(
            { action: "delete-usage", consumableId: mappingConsumable.id, productId },
            "Relación eliminada.",
          )}
        />
      )}
    </div>
  );
}

function ProcurementHeader({
  workspace,
  from,
  to,
  isPending,
  onFromChange,
  onToChange,
  onRefresh,
}: {
  workspace: ProcurementWorkspace;
  from: string;
  to: string;
  isPending: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const needsOrder = workspace.suggestions.filter((item) => item.suggestedPacks > 0);
  const estimated = needsOrder.reduce((sum, item) => sum + item.estimatedCost, 0);
  const mapped = workspace.consumables.filter((item) => item.active && item.mappings.length > 0).length;
  const drafts = workspace.orders.filter((order) => order.status === "draft").length;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <PackageCheck className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Necesidades de compra</h2>
            <p className="text-sm text-slate-500">Consumo calculado con {workspace.analysisDays} dias de ventas completadas.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <DateField label="Desde" value={from} onChange={onFromChange} />
          <DateField label="Hasta" value={to} onChange={onToChange} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
            Calcular
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Necesitan pedido" value={String(needsOrder.length)} tone="amber" />
        <Metric label="Compra estimada" value={MONEY.format(estimated)} tone="emerald" />
        <Metric label="Con consumo configurado" value={`${mapped}/${workspace.consumables.filter((item) => item.active).length}`} />
        <Metric label="Borradores" value={String(drafts)} />
      </div>
    </section>
  );
}

function SuggestionsView({
  workspace,
  selected,
  packOverrides,
  isPending,
  onToggle,
  onPacksChange,
  onCreateOrders,
  onAddConsumable,
  onOpenMappings,
}: {
  workspace: ProcurementWorkspace;
  selected: Set<string>;
  packOverrides: Record<string, number>;
  isPending: boolean;
  onToggle: (id: string) => void;
  onPacksChange: (id: string, value: number) => void;
  onCreateOrders: () => void;
  onAddConsumable: () => void;
  onOpenMappings: (id: string) => void;
}) {
  const total = workspace.suggestions
    .filter((item) => selected.has(item.consumableId))
    .reduce((sum, item) => sum + (packOverrides[item.consumableId] ?? 0) * item.packCost, 0);

  if (workspace.consumables.length === 0) {
    return (
      <EmptyState
        icon={Box}
        title="Empieza por tus consumibles"
        text="Añade vasos, cucharas, servilletas, envases o ingredientes. Después indica qué productos vendidos consumen cada uno."
        action="Añadir primer consumible"
        onAction={onAddConsumable}
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-black text-slate-950">Propuesta según ventas</h3>
          <p className="text-xs text-slate-500">Objetivo = consumo diario × cobertura + stock de seguridad.</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 sm:justify-end">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-slate-400">Pedido seleccionado</p>
            <p className="font-black text-slate-900">{MONEY.format(total)}</p>
          </div>
          <button
            type="button"
            onClick={onCreateOrders}
            disabled={isPending || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <ShoppingCart className="size-4" />
            Crear pedido
          </button>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-slate-50/70 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-12 px-4 py-3" />
              <th className="px-3 py-3">Consumible / proveedor</th>
              <th className="px-3 py-3 text-right">Consumo periodo</th>
              <th className="px-3 py-3 text-right">Stock actual</th>
              <th className="px-3 py-3 text-right">Cobertura</th>
              <th className="px-3 py-3 text-right">Necesidad</th>
              <th className="px-3 py-3 text-right">Paquetes</th>
              <th className="px-4 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {workspace.suggestions.map((item) => (
              <SuggestionRow
                key={item.consumableId}
                item={item}
                selected={selected.has(item.consumableId)}
                packs={packOverrides[item.consumableId] ?? 0}
                onToggle={() => onToggle(item.consumableId)}
                onPacksChange={(value) => onPacksChange(item.consumableId, value)}
                onOpenMappings={() => onOpenMappings(item.consumableId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line)] md:hidden">
        {workspace.suggestions.map((item) => (
          <SuggestionCard
            key={item.consumableId}
            item={item}
            selected={selected.has(item.consumableId)}
            packs={packOverrides[item.consumableId] ?? 0}
            onToggle={() => onToggle(item.consumableId)}
            onPacksChange={(value) => onPacksChange(item.consumableId, value)}
            onOpenMappings={() => onOpenMappings(item.consumableId)}
          />
        ))}
      </div>
    </section>
  );
}

function SuggestionRow({ item, selected, packs, onToggle, onPacksChange, onOpenMappings }: SuggestionProps) {
  return (
    <tr className={cn("border-b border-[var(--line)] transition", selected ? "bg-emerald-50/50" : "hover:bg-slate-50")}>
      <td className="px-4 py-3"><CheckBox checked={selected} onChange={onToggle} /></td>
      <td className="px-3 py-3">
        <p className="font-black text-slate-900">{item.name}</p>
        <p className="text-xs text-slate-400">{item.supplierName} · {item.mappingCount} productos</p>
        {item.mappingCount === 0 && (
          <button type="button" onClick={onOpenMappings} className="mt-1 text-xs font-bold text-amber-700 underline">Configurar consumo</button>
        )}
      </td>
      <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatQty(item.consumedInPeriod, item.unit)}</td>
      <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatQty(item.currentStock, item.unit)}</td>
      <td className="px-3 py-3 text-right">
        <CoverageBadge current={item.currentCoverageDays} target={item.coverageDays} />
      </td>
      <td className="px-3 py-3 text-right font-bold text-slate-700">{formatQty(item.neededUnits, item.unit)}</td>
      <td className="px-3 py-3 text-right">
        <PackInput value={packs} onChange={onPacksChange} />
        <p className="mt-1 text-[10px] text-slate-400">× {formatQty(item.packSize, item.unit)}</p>
      </td>
      <td className="px-4 py-3 text-right font-black text-slate-950">{MONEY.format(packs * item.packCost)}</td>
    </tr>
  );
}

function SuggestionCard({ item, selected, packs, onToggle, onPacksChange, onOpenMappings }: SuggestionProps) {
  return (
    <div className={cn("p-4", selected && "bg-emerald-50/50")}>
      <div className="flex items-start gap-3">
        <CheckBox checked={selected} onChange={onToggle} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-black text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-400">{item.supplierName}</p>
            </div>
            <CoverageBadge current={item.currentCoverageDays} target={item.coverageDays} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <SmallValue label="Consumido" value={formatQty(item.consumedInPeriod, item.unit)} />
            <SmallValue label="Stock" value={formatQty(item.currentStock, item.unit)} />
            <SmallValue label="Falta" value={formatQty(item.neededUnits, item.unit)} />
          </div>
          {item.mappingCount === 0 && (
            <button type="button" onClick={onOpenMappings} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
              <Link2 className="size-3.5" /> Configurar productos
            </button>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
            <div className="flex items-center gap-2">
              <PackInput value={packs} onChange={onPacksChange} />
              <span className="text-xs text-slate-400">paquetes</span>
            </div>
            <p className="font-black text-slate-950">{MONEY.format(packs * item.packCost)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type SuggestionProps = {
  item: ProcurementSuggestion;
  selected: boolean;
  packs: number;
  onToggle: () => void;
  onPacksChange: (value: number) => void;
  onOpenMappings: () => void;
};

function ConsumablesView({
  consumables,
  onAdd,
  onEdit,
  onMappings,
}: {
  consumables: ProcurementConsumable[];
  onAdd: () => void;
  onEdit: (item: ProcurementConsumable) => void;
  onMappings: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = consumables.filter((item) => normalize(`${item.name} ${item.supplierName} ${item.sku ?? ""}`).includes(normalize(query)));
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar consumible o proveedor" className="field pl-10" />
        </div>
        <button type="button" onClick={onAdd} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
          <Plus className="size-4" /> Añadir consumible
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="p-10 text-center text-sm font-semibold text-slate-400">No hay consumibles con este filtro.</div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {filtered.map((item) => (
            <div key={item.id} className={cn("grid gap-3 p-4 sm:grid-cols-[minmax(180px,1.4fr)_1fr_1fr_auto] sm:items-center", !item.active && "opacity-55")}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-black text-slate-900">{item.name}</p>
                  {!item.active && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Inactivo</span>}
                </div>
                <p className="text-xs text-slate-400">{item.supplierName}{item.sku ? ` · ${item.sku}` : ""}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:block">
                <SmallValue label="Stock" value={formatQty(item.currentStock, item.unit)} />
                <p className="mt-1 hidden text-xs text-slate-400 sm:block">Revisado {formatDashboardDate(item.stockUpdatedAt)}</p>
                <SmallValue label="Formato" value={`${formatQty(item.packSize, item.unit)} · ${MONEY.format(item.packCost)}`} className="sm:hidden" />
              </div>
              <button type="button" onClick={() => onMappings(item.id)} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-left transition hover:bg-slate-50">
                <span>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Consumo vinculado</span>
                  <span className="text-sm font-bold text-slate-700">{item.mappings.length} productos</span>
                </span>
                <Link2 className="size-4 text-indigo-500" />
              </button>
              <button type="button" onClick={() => onEdit(item)} title="Editar consumible" className="inline-flex size-10 items-center justify-center justify-self-end rounded-lg border border-[var(--line)] text-slate-500 transition hover:bg-slate-50">
                <Pencil className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OrdersView({
  orders,
  isPending,
  onStatus,
}: {
  orders: PurchaseOrder[];
  isPending: boolean;
  onStatus: (order: PurchaseOrder, status: PurchaseOrderStatus) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (orders.length === 0) {
    return <EmptyState icon={ClipboardList} title="Todavía no hay pedidos" text="Selecciona consumibles en la propuesta y crea el primer borrador." />;
  }
  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const open = expanded.has(order.id);
        return (
          <article key={order.id} className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm">
            <button type="button" onClick={() => setExpanded((current) => toggleSet(current, order.id))} className="grid w-full gap-3 p-4 text-left sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center">
              <div>
                <p className="font-black text-slate-950">{order.supplierName}</p>
                <p className="text-xs text-slate-400">{order.orderNumber} · {formatDashboardDateTime(order.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 sm:justify-center">
                <OrderStatus status={order.status} />
                <span className="text-xs text-slate-400">{order.items.length} líneas</span>
              </div>
              <p className="text-xl font-black text-slate-950 sm:text-right">{MONEY.format(order.totalAmount)}</p>
              {open ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
            </button>
            {open && (
              <div className="border-t border-[var(--line)] bg-slate-50/60 p-4">
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                      <div>
                        <p className="font-bold text-slate-800">{item.consumableName}</p>
                        <p className="text-xs text-slate-400">{NUMBER.format(item.packs)} paquetes · {formatQty(item.orderedUnits, item.unit)}</p>
                      </div>
                      <p className="font-black text-slate-900">{MONEY.format(item.lineTotal)}</p>
                    </div>
                  ))}
                </div>
                {order.notes && <p className="mt-3 text-sm text-slate-500">{order.notes}</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {order.status === "draft" && (
                    <>
                      <ActionButton icon={Truck} disabled={isPending} onClick={() => onStatus(order, "ordered")}>Marcar pedido</ActionButton>
                      <ActionButton icon={X} tone="danger" disabled={isPending} onClick={() => onStatus(order, "cancelled")}>Cancelar</ActionButton>
                    </>
                  )}
                  {order.status === "ordered" && (
                    <ActionButton icon={PackageCheck} tone="success" disabled={isPending} onClick={() => onStatus(order, "received")}>Marcar recibido</ActionButton>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ConsumableModal({
  consumable,
  isPending,
  onClose,
  onSave,
}: {
  consumable: ProcurementConsumable | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (form: ConsumableForm) => void;
}) {
  const [form, setForm] = useState<ConsumableForm>(() => formFromConsumable(consumable));
  function update<K extends keyof ConsumableForm>(key: K, value: ConsumableForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <Modal title={consumable ? "Editar consumible" : "Nuevo consumible"} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2"><input className="field" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Vaso 500 ml" autoFocus /></Field>
        <Field label="Proveedor"><input className="field" value={form.supplierName} onChange={(event) => update("supplierName", event.target.value)} placeholder="Nombre del proveedor" /></Field>
        <Field label="Referencia / SKU"><input className="field" value={form.sku} onChange={(event) => update("sku", event.target.value)} placeholder="Opcional" /></Field>
        <Field label="Unidad de consumo"><input className="field" value={form.unit} onChange={(event) => update("unit", event.target.value)} placeholder="ud, g, ml..." /></Field>
        <Field label="Contenido por paquete"><NumberField value={form.packSize} onChange={(value) => update("packSize", value)} /></Field>
        <Field label="Coste por paquete"><NumberField value={form.packCost} onChange={(value) => update("packCost", value)} /></Field>
        <Field label="Stock actual"><NumberField value={form.currentStock} onChange={(value) => update("currentStock", value)} /></Field>
        <Field label="Stock de seguridad"><NumberField value={form.safetyStock} onChange={(value) => update("safetyStock", value)} /></Field>
        <Field label="Días de cobertura"><NumberField value={form.coverageDays} onChange={(value) => update("coverageDays", value)} integer /></Field>
        <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} className="size-4 accent-indigo-600" /> Activo
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-bold text-slate-600">Cancelar</button>
        <button type="button" onClick={() => onSave(form)} disabled={isPending || !form.name.trim()} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Guardar</button>
      </div>
    </Modal>
  );
}

function MappingsModal({
  consumable,
  products,
  isPending,
  onClose,
  onSave,
  onDelete,
}: {
  consumable: ProcurementConsumable;
  products: ProcurementProduct[];
  isPending: boolean;
  onClose: () => void;
  onSave: (productId: string, quantityPerSale: number) => void;
  onDelete: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const mappedIds = new Set(consumable.mappings.map((item) => item.productId));
  const matches = products
    .filter((product) => product.active && !mappedIds.has(product.id) && normalize(`${product.name} ${product.categoryName}`).includes(normalize(query)))
    .slice(0, 12);
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  return (
    <Modal title={`Consumo de ${consumable.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">Indica cuántas {consumable.unit} se gastan cada vez que se vende un producto.</p>
      {consumable.mappings.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-black uppercase text-slate-400">Productos vinculados</p>
          {consumable.mappings.map((mapping) => (
            <div key={mapping.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5">
              <div>
                <p className="text-sm font-bold text-slate-800">{mapping.productName}</p>
                <p className="text-xs text-slate-400">{mapping.categoryName} · {formatQty(mapping.quantityPerSale, consumable.unit)} por venta</p>
              </div>
              <button type="button" onClick={() => onDelete(mapping.productId)} disabled={isPending} title="Eliminar relación" className="inline-flex size-9 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 disabled:opacity-40">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-slate-50 p-3 sm:p-4">
        <p className="mb-3 text-xs font-black uppercase text-slate-500">Añadir producto</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedProductId(""); }} placeholder="Buscar producto del POS" className="field bg-white pl-10" />
        </div>
        {query && !selectedProduct && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--line)] bg-white p-1">
            {matches.map((product) => (
              <button key={product.id} type="button" onClick={() => { setSelectedProductId(product.id); setQuery(product.name); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-700">{product.name}</span>
                <span className="text-xs text-slate-400">{product.categoryName}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="p-3 text-sm text-slate-400">No hay resultados.</p>}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={`Cantidad (${consumable.unit})`} className="sm:w-48"><NumberField value={quantity} onChange={setQuantity} /></Field>
          <button
            type="button"
            disabled={isPending || !selectedProductId || Number(quantity) <= 0}
            onClick={() => { onSave(selectedProductId, Number(quantity)); setSelectedProductId(""); setQuery(""); setQuantity("1"); }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white disabled:bg-slate-200"
          >
            <Plus className="size-4" /> Vincular
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={cn("max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-xl")}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-4 sm:px-5">
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--line)] text-slate-500"><X className="size-4" /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function TabButton({ active, icon: Icon, children, onClick }: { active: boolean; icon: typeof ShoppingCart; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition", active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50")}>
      <Icon className="size-4" /> {children}
    </button>
  );
}

function Count({ value }: { value: number }) {
  return <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px]">{value}</span>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-[136px] flex-1 sm:flex-none">
      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm font-semibold text-slate-700 outline-none" />
    </label>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" | "emerald" }) {
  const tones = { slate: "bg-slate-50 text-slate-900", amber: "bg-amber-50 text-amber-800", emerald: "bg-emerald-50 text-emerald-800" };
  return <div className={cn("rounded-xl px-3 py-3", tones[tone])}><p className="text-[10px] font-bold uppercase opacity-65">{label}</p><p className="mt-0.5 text-xl font-black sm:text-2xl">{value}</p></div>;
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" onClick={onChange} className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded border transition", checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white")} aria-label={checked ? "Deseleccionar" : "Seleccionar"}>{checked && <Check className="size-3.5" />}</button>;
}

function CoverageBadge({ current, target }: { current: number | null; target: number }) {
  if (current == null) return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">Sin consumo</span>;
  const tone = current < target * 0.5 ? "bg-rose-50 text-rose-700" : current < target ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  return <span className={cn("rounded-md px-2 py-1 text-xs font-bold", tone)}>{NUMBER.format(current)} / {target} días</span>;
}

function PackInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" min="0" step="1" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-9 w-20 rounded-lg border border-[var(--line)] bg-white px-2 text-right text-sm font-black text-slate-800 outline-none focus:border-indigo-300" />;
}

function SmallValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className={className}><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-700">{value}</p></div>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}

function NumberField({ value, onChange, integer = false }: { value: string; onChange: (value: string) => void; integer?: boolean }) {
  return <input type="number" min="0" step={integer ? "1" : "0.001"} value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="field" />;
}

function OrderStatus({ status }: { status: PurchaseOrderStatus }) {
  const values = {
    draft: ["Borrador", "bg-amber-50 text-amber-700"],
    ordered: ["Pedido", "bg-indigo-50 text-indigo-700"],
    received: ["Recibido", "bg-emerald-50 text-emerald-700"],
    cancelled: ["Cancelado", "bg-rose-50 text-rose-700"],
  } as const;
  return <span className={cn("rounded-md px-2 py-1 text-xs font-bold", values[status][1])}>{values[status][0]}</span>;
}

function ActionButton({ icon: Icon, children, disabled, onClick, tone = "default" }: { icon: typeof Truck; children: React.ReactNode; disabled: boolean; onClick: () => void; tone?: "default" | "success" | "danger" }) {
  const tones = { default: "bg-slate-950 text-white", success: "bg-emerald-600 text-white", danger: "border border-rose-200 bg-white text-rose-600" };
  return <button type="button" disabled={disabled} onClick={onClick} className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40", tones[tone])}><Icon className="size-4" />{children}</button>;
}

function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Box; title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon className="size-6" /></div>
      <h3 className="mt-4 font-black text-slate-900">{title}</h3><p className="mt-1 max-w-lg text-sm text-slate-500">{text}</p>
      {action && onAction && <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"><Plus className="size-4" />{action}</button>}
    </section>
  );
}

function formFromConsumable(item: ProcurementConsumable | null): ConsumableForm {
  return item ? {
    id: item.id,
    name: item.name,
    sku: item.sku ?? "",
    supplierName: item.supplierName,
    unit: item.unit,
    packSize: String(item.packSize),
    packCost: String(item.packCost),
    currentStock: String(item.currentStock),
    safetyStock: String(item.safetyStock),
    coverageDays: String(item.coverageDays),
    active: item.active,
  } : { name: "", sku: "", supplierName: "", unit: "ud", packSize: "1", packCost: "0", currentStock: "0", safetyStock: "0", coverageDays: "7", active: true };
}

function serializeConsumableForm(form: ConsumableForm) {
  return { ...form, packSize: Number(form.packSize), packCost: Number(form.packCost), currentStock: Number(form.currentStock), safetyStock: Number(form.safetyStock), coverageDays: Number(form.coverageDays) };
}

function suggestionPacks(workspace: ProcurementWorkspace) {
  return Object.fromEntries(workspace.suggestions.map((item) => [item.consumableId, item.suggestedPacks]));
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatQty(value: number, unit: string) {
  return `${NUMBER.format(value)} ${unit}`;
}

async function parseResponse<T = unknown>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se ha podido completar la operacion.");
  return data;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se ha podido completar la operacion.";
}
