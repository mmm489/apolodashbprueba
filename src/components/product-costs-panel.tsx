"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Filter, PackageCheck, RefreshCw, Save, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProductCostReconcileRow, ProductCostWorkspace } from "@/lib/types";

const MONEY = new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" });
const PCT = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 1 });

export function ProductCostsPanel({ initialWorkspace }: { initialWorkspace: ProductCostWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultEffectiveFrom = todayIso();

  const visibleProducts = useMemo(() => {
    const term = normalize(query);
    return workspace.products.filter((product) => {
      if (!showInactive && !product.active) return false;
      if (category !== "all" && product.posCategory !== category) return false;
      if (!term) return true;
      return normalize(`${product.posProductName} ${product.posCategory} ${product.posProductId}`).includes(term);
    });
  }, [workspace.products, query, category, showInactive]);

  function refresh() {
    startTransition(async () => {
      setMessage(null);
      const next = await fetch("/api/product-costs", { cache: "no-store" }).then((res) => res.json()) as ProductCostWorkspace;
      setWorkspace(next);
      setMessage("Datos actualizados.");
    });
  }

  function saveManual(product: ProductCostReconcileRow, unitCost: number, effectiveFrom?: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await fetch("/api/product-costs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posProductId: product.posProductId,
          unitCost,
          effectiveFrom,
        }),
      }).then((res) => res.json()) as { applied: number; workspace: ProductCostWorkspace };
      setWorkspace(result.workspace);
      setMessage(`${product.posProductName}: coste guardado.`);
    });
  }

  return (
    <div className="space-y-5">
      <Header
        workspace={workspace}
        isPending={isPending}
        message={message}
        onRefresh={refresh}
      />

      <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto, categoria o codigo"
              className="w-full rounded-xl border border-[var(--line)] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="all">Todas las categorias</option>
            {workspace.categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
              showInactive ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-[var(--line)] bg-white text-slate-500",
            )}
          >
            <Filter className="size-4" />
            Inactivos
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50/70 text-[11px] font-black uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Producto POS</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Venta s/IVA</th>
                <th className="px-4 py-3 text-right">Coste y fecha</th>
                <th className="px-4 py-3 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => (
                <ProductCostRow
                  key={product.posProductId}
                  product={product}
                  defaultEffectiveFrom={defaultEffectiveFrom}
                  isPending={isPending}
                  onSaveManual={saveManual}
                />
              ))}
            </tbody>
          </table>
          {visibleProducts.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              No hay productos con este filtro.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProductCostRow({
  product,
  defaultEffectiveFrom,
  isPending,
  onSaveManual,
}: {
  product: ProductCostReconcileRow;
  defaultEffectiveFrom: string;
  isPending: boolean;
  onSaveManual: (product: ProductCostReconcileRow, unitCost: number, effectiveFrom?: string) => void;
}) {
  const [costValue, setCostValue] = useState(formatCostInput(product.unitCost));
  const [effectiveFrom, setEffectiveFrom] = useState(defaultEffectiveFrom);

  useEffect(() => {
    setCostValue(formatCostInput(product.unitCost));
    setEffectiveFrom(defaultEffectiveFrom);
  }, [defaultEffectiveFrom, product.posProductId, product.unitCost]);

  const parsedCost = parseMoney(costValue);
  const costChanged = parsedCost != null && (product.unitCost == null || Math.abs(parsedCost - product.unitCost) > 0.00005);
  const dateChanged = Boolean(effectiveFrom && effectiveFrom !== defaultEffectiveFrom);
  const canSave = parsedCost != null && (costChanged || dateChanged);

  return (
    <tr className="border-b border-[var(--line)] text-sm transition hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-900">{product.posProductName}</span>
          {!product.active && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Inactivo</span>}
          {product.isTopping && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Topping</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-400">POS #{product.posProductId}</p>
      </td>
      <td className="px-4 py-3 text-slate-600">{product.posCategory}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-700">{MONEY.format(netPrice(product))}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-1.5">
            <div>
              <p className="mb-1 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">Coste</p>
              <input
                value={costValue}
                onChange={(event) => setCostValue(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                inputMode="decimal"
                aria-label={`Coste de ${product.posProductName}`}
                className={cn(
                  "w-24 rounded-xl border bg-white px-3 py-2 text-right text-sm font-black outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10",
                  parsedCost == null && costValue.trim() !== "" ? "border-rose-200 text-rose-600" : "border-[var(--line)] text-rose-600",
                )}
              />
            </div>
            <div>
              <p className="mb-1 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">Desde</p>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                aria-label={`Fecha desde ${product.posProductName}`}
                className="w-36 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={isPending || !canSave}
            onClick={() => {
              if (parsedCost != null) onSaveManual(product, parsedCost, effectiveFrom || defaultEffectiveFrom);
            }}
            title="Guardar coste"
            className="inline-flex size-9 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Save className="size-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {product.margin == null ? (
          <span className="text-slate-300">--</span>
        ) : (
          <div>
            <p className={cn("font-black", product.margin >= 0 ? "text-emerald-700" : "text-rose-600")}>{MONEY.format(product.margin)}</p>
            <p className="text-xs text-slate-400">{product.marginPct == null ? "--" : `${PCT.format(product.marginPct)}%`}</p>
          </div>
        )}
      </td>
    </tr>
  );
}

function Header({
  workspace,
  isPending,
  message,
  onRefresh,
}: {
  workspace: ProductCostWorkspace;
  isPending: boolean;
  message: string | null;
  onRefresh: () => void;
}) {
  const withCost = workspace.products.filter((product) => product.active && product.unitCost != null).length;
  const pendingCost = Math.max(0, workspace.stats.active - withCost);
  const coverage = workspace.stats.active > 0 ? (withCost / workspace.stats.active) * 100 : 0;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <PackageCheck className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Coste productos</h2>
            <p className="text-sm text-slate-500">
              Edita el coste unitario y la fecha desde la que aplica. Por defecto se propone la fecha de hoy.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
          Refrescar
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Productos POS" value={String(workspace.stats.total)} />
        <Metric label="Activos" value={String(workspace.stats.active)} />
        <Metric label="Coste introducido" value={String(withCost)} tone="emerald" />
        <Metric label="Pendiente de introducir" value={`${pendingCost} (${PCT.format(100 - coverage)}%)`} tone="amber" />
      </div>
      {message && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">{message}</p>}
    </section>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={cn("rounded-2xl p-4", tones[tone])}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function netPrice(product: Pick<ProductCostReconcileRow, "price" | "vatRate">) {
  return product.price / (1 + product.vatRate / 100);
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatCostInput(value: number | null) {
  return value == null ? "" : String(value).replace(".", ",");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
