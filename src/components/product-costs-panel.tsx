"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  History,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ProductCostCandidate,
  ProductCostHistoryEntry,
  ProductCostReconcileRow,
  ProductCostReconcileStatus,
  ProductCostWorkspace,
} from "@/lib/types";

type StatusFilter = "all" | ProductCostReconcileStatus | "toppings";

const MONEY = new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" });
const PCT = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 1 });

const statusLabels: Record<ProductCostReconcileStatus, string> = {
  mapped: "Amb cost",
  exact: "Exacte",
  review: "Revisar",
  conflict: "Conflicte",
  missing: "Sense cost",
};

const statusStyles: Record<ProductCostReconcileStatus, string> = {
  mapped: "bg-emerald-50 text-emerald-700",
  exact: "bg-indigo-50 text-indigo-700",
  review: "bg-amber-50 text-amber-700",
  conflict: "bg-rose-50 text-rose-700",
  missing: "bg-slate-100 text-slate-500",
};

export function ProductCostsPanel({ initialWorkspace }: { initialWorkspace: ProductCostWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState(initialWorkspace.products[0]?.posProductId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = workspace.products.find((product) => product.posProductId === selectedId)
    ?? workspace.products[0]
    ?? null;
  const defaultEffectiveFrom = workspace.firstPosSaleDate ?? todayIso();

  const visibleProducts = useMemo(() => {
    const term = normalize(query);
    return workspace.products.filter((product) => {
      if (!showInactive && !product.active) return false;
      if (category !== "all" && product.posCategory !== category) return false;
      if (status === "toppings" && !product.isTopping) return false;
      if (status !== "all" && status !== "toppings" && product.status !== status) return false;
      if (!term) return true;
      return normalize(`${product.posProductName} ${product.posCategory} ${product.posProductId}`).includes(term);
    });
  }, [workspace.products, query, category, status, showInactive]);

  function refresh() {
    startTransition(async () => {
      const next = await fetch("/api/product-costs", { cache: "no-store" }).then((res) => res.json()) as ProductCostWorkspace;
      setWorkspace(next);
      setSelectedId((current) => next.products.some((product) => product.posProductId === current)
        ? current
        : next.products[0]?.posProductId ?? "");
      setMessage("Dades actualitzades.");
    });
  }

  function applyExact() {
    startTransition(async () => {
      setMessage(null);
      const result = await fetch("/api/product-costs/apply-exact", { method: "POST" }).then((res) => res.json()) as { applied: number; workspace: ProductCostWorkspace };
      setWorkspace(result.workspace);
      setMessage(`${result.applied} coincidencies exactes aplicades.`);
    });
  }

  function applyCandidate(product: ProductCostReconcileRow, candidate: ProductCostCandidate, effectiveFrom?: string) {
    startTransition(async () => {
      const result = await fetch("/api/product-costs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posProductId: product.posProductId,
          legacyProductCode: candidate.legacyProductCode,
          effectiveFrom,
        }),
      }).then((res) => res.json()) as { applied: number; workspace: ProductCostWorkspace };
      setWorkspace(result.workspace);
      setMessage(`${product.posProductName}: cost aplicat des del candidat.`);
    });
  }

  function saveManual(product: ProductCostReconcileRow, unitCost: number, effectiveFrom?: string) {
    startTransition(async () => {
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
      setMessage(`${product.posProductName}: cost guardat.`);
    });
  }

  return (
    <div className="space-y-5">
      <Header
        workspace={workspace}
        isPending={isPending}
        message={message}
        onRefresh={refresh}
        onApplyExact={applyExact}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producte, categoria o codi"
                className="w-full rounded-xl border border-[var(--line)] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="all">Totes les categories</option>
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
              Inactius
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 py-3">
            <StatusButton value="all" current={status} onChange={setStatus} label="Tots" count={workspace.stats.total} />
            <StatusButton value="mapped" current={status} onChange={setStatus} label="Amb cost" count={workspace.stats.mapped} />
            <StatusButton value="exact" current={status} onChange={setStatus} label="Exactes" count={workspace.stats.exact} />
            <StatusButton value="review" current={status} onChange={setStatus} label="Revisar" count={workspace.stats.review} />
            <StatusButton value="conflict" current={status} onChange={setStatus} label="Conflictes" count={workspace.stats.conflict} />
            <StatusButton value="missing" current={status} onChange={setStatus} label="Sense cost" count={workspace.stats.missing} />
            <StatusButton value="toppings" current={status} onChange={setStatus} label="Toppings" count={workspace.stats.toppings} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50/70 text-[11px] font-black uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Producte POS</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Venda s/IVA</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Marge</th>
                  <th className="px-4 py-3">Estat</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <ProductCostRow
                    key={product.posProductId}
                    product={product}
                    selected={selected?.posProductId === product.posProductId}
                    defaultEffectiveFrom={defaultEffectiveFrom}
                    isPending={isPending}
                    onSelect={() => setSelectedId(product.posProductId)}
                    onSaveManual={saveManual}
                  />
                ))}
              </tbody>
            </table>
            {visibleProducts.length === 0 && (
              <div className="p-10 text-center text-sm font-semibold text-slate-400">
                No hi ha productes amb aquest filtre.
              </div>
            )}
          </div>
        </section>

        <CostInspector
          product={selected}
          defaultEffectiveFrom={defaultEffectiveFrom}
          onApplyCandidate={applyCandidate}
          isPending={isPending}
        />
      </div>
    </div>
  );
}

function ProductCostRow({
  product,
  selected,
  defaultEffectiveFrom,
  isPending,
  onSelect,
  onSaveManual,
}: {
  product: ProductCostReconcileRow;
  selected: boolean;
  defaultEffectiveFrom: string;
  isPending: boolean;
  onSelect: () => void;
  onSaveManual: (product: ProductCostReconcileRow, unitCost: number, effectiveFrom?: string) => void;
}) {
  const [costValue, setCostValue] = useState(formatCostInput(product.unitCost));

  useEffect(() => {
    setCostValue(formatCostInput(product.unitCost));
  }, [product.posProductId, product.unitCost]);

  const parsedCost = parseMoney(costValue);
  const costChanged = parsedCost != null && (product.unitCost == null || Math.abs(parsedCost - product.unitCost) > 0.00005);
  const canSave = parsedCost != null && costChanged;

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-b border-[var(--line)] text-sm transition hover:bg-slate-50",
        selected && "bg-indigo-50/60",
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-900">{product.posProductName}</span>
          {!product.active && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Inactiu</span>}
          {product.isTopping && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Topping</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-400">POS #{product.posProductId}</p>
      </td>
      <td className="px-4 py-3 text-slate-600">{product.posCategory}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-700">{MONEY.format(netPrice(product))}</td>
      <td className="px-4 py-3">
        <div
          className="flex items-center justify-end gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            value={costValue}
            onChange={(event) => setCostValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            inputMode="decimal"
            aria-label={`Coste de ${product.posProductName}`}
            className={cn(
              "w-24 rounded-xl border bg-white px-3 py-2 text-right text-sm font-black outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10",
              parsedCost == null ? "border-rose-200 text-rose-600" : "border-[var(--line)] text-rose-600",
            )}
          />
          <button
            type="button"
            disabled={isPending || !canSave}
            onClick={() => {
              if (parsedCost != null) onSaveManual(product, parsedCost, defaultEffectiveFrom);
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
      <td className="px-4 py-3">
        <StatusBadge status={product.status} />
      </td>
    </tr>
  );
}

function Header({
  workspace,
  isPending,
  message,
  onRefresh,
  onApplyExact,
}: {
  workspace: ProductCostWorkspace;
  isPending: boolean;
  message: string | null;
  onRefresh: () => void;
  onApplyExact: () => void;
}) {
  const coverage = workspace.stats.active > 0 ? (workspace.stats.mapped / workspace.stats.active) * 100 : 0;
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
              Concilia costes antiguos con productos actuales del POS. Cobertura actual: {PCT.format(coverage)}%.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
            Refrescar
          </button>
          <button
            type="button"
            onClick={onApplyExact}
            disabled={isPending || workspace.stats.exact === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Sparkles className="size-4" />
            Aplicar exactes ({workspace.stats.exact})
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Productes POS" value={String(workspace.stats.total)} />
        <Metric label="Actius" value={String(workspace.stats.active)} />
        <Metric label="Amb cost" value={String(workspace.stats.mapped)} tone="emerald" />
        <Metric label="Exactes" value={String(workspace.stats.exact)} tone="indigo" />
        <Metric label="Revisar" value={String(workspace.stats.review + workspace.stats.conflict)} tone="amber" />
        <Metric label="Sense cost" value={String(workspace.stats.missing)} tone="slate" />
      </div>
      {message && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">{message}</p>}
    </section>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "indigo" | "amber" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={cn("rounded-2xl p-4", tones[tone])}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function StatusButton({
  value,
  current,
  onChange,
  label,
  count,
}: {
  value: StatusFilter;
  current: StatusFilter;
  onChange: (value: StatusFilter) => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "rounded-xl px-3 py-2 text-sm font-bold transition",
        current === value ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100",
      )}
    >
      {label} <span className="ml-1 opacity-70">{count}</span>
    </button>
  );
}

function CostInspector({
  product,
  defaultEffectiveFrom,
  onApplyCandidate,
  isPending,
}: {
  product: ProductCostReconcileRow | null;
  defaultEffectiveFrom: string;
  onApplyCandidate: (product: ProductCostReconcileRow, candidate: ProductCostCandidate, effectiveFrom?: string) => void;
  isPending: boolean;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(defaultEffectiveFrom);
  const [history, setHistory] = useState<ProductCostHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!product) {
    return (
      <aside className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-400">Selecciona un producte.</p>
      </aside>
    );
  }

  const selectedProduct = product;

  async function loadHistory() {
    const rows = await fetch(`/api/product-costs?historyFor=${selectedProduct.posProductId}`, { cache: "no-store" }).then((res) => res.json()) as ProductCostHistoryEntry[];
    setHistory(rows);
    setHistoryOpen(true);
  }

  const displayCost = selectedProduct.unitCost ?? selectedProduct.exactCandidate?.unitCost ?? null;
  return (
    <aside className="sticky top-20 h-fit rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Producte POS #{product.posProductId}</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{product.posProductName}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{product.posCategory}</p>
        </div>
        <StatusBadge status={product.status} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Info label="Venda s/IVA" value={MONEY.format(netPrice(product))} />
        <Info label="Cost" value={displayCost == null ? "--" : MONEY.format(displayCost)} />
        <Info label="Marge" value={product.margin == null ? "--" : MONEY.format(product.margin)} />
      </div>

      {product.hasCodeConflict && (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>Hi ha un cost antic amb el mateix codi, pero el nom no coincideix. No compta fins que el conciliis.</p>
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tags className="size-4 text-slate-400" />
            <p className="text-sm font-black text-slate-800">Candidats antics</p>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
          >
            <History className="size-3.5" />
            Historic
          </button>
        </div>
        <div className="space-y-2">
          {product.candidates.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-400">No hi ha candidats clars.</p>
          ) : (
            product.candidates.map((candidate) => (
              <button
                type="button"
                key={`${candidate.legacyProductCode}-${candidate.unitCost}`}
                onClick={() => onApplyCandidate(product, candidate, effectiveFrom)}
                disabled={isPending}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition hover:shadow-sm disabled:opacity-50",
                  candidate.matchType === "exact" ? "border-indigo-200 bg-indigo-50/70" : "border-[var(--line)] bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{candidate.legacyProductName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400">
                      {candidate.legacyCategory} · codi {candidate.legacyProductCode}
                    </p>
                  </div>
                  <span className="rounded-lg bg-white px-2 py-1 text-sm font-black text-rose-600">
                    {MONEY.format(candidate.unitCost)}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-slate-500">
                  Confiança {candidate.confidence}% · {candidate.categoryCompatible ? "categoria compatible" : "categoria diferent"}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {historyOpen && (
        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
          <p className="mb-2 text-sm font-black text-slate-800">Historic del producte</p>
          {history.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">Sense historic.</p>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-white p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">{MONEY.format(entry.unitCost)}</span>
                    <span className="text-xs font-semibold text-slate-400">
                      {entry.validFrom} - {entry.validUntil ?? "actual"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{entry.productName}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function StatusBadge({ status }: { status: ProductCostReconcileStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black", statusStyles[status])}>
      {status === "mapped" ? <CheckCircle2 className="size-3.5" /> : null}
      {statusLabels[status]}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
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
