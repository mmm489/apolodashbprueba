"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, History, Save } from "lucide-react";

import { getFamilyColor, getFamilyName } from "@/lib/product-families";
import type { ProductCost, ProductCostHistoryEntry } from "@/lib/types";

function detectCategory(productName: string): string {
  return getFamilyName(productName);
}

function getCategoryColor(name: string): string {
  return getFamilyColor(name);
}

/* ---- Group products by category ---- */

interface CategoryGroup {
  name: string;
  color: string;
  products: ProductCost[];
  withCost: number;
}

function groupByCategory(products: ProductCost[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const p of products) {
    const cat = p.category !== "Altres" ? p.category : detectCategory(p.productName);
    const existing = map.get(cat);
    if (existing) {
      existing.products.push(p);
      if (p.unitCost > 0) existing.withCost++;
    } else {
      map.set(cat, { name: cat, color: getCategoryColor(cat), products: [p], withCost: p.unitCost > 0 ? 1 : 0 });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ---- Component ---- */

export function ProductesPanel({ products }: { products: ProductCost[] }) {
  const categories = groupByCategory(products);
  const totalProducts = products.length;
  const withCost = products.filter((p) => p.unitCost > 0).length;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-3">
        <MiniCard label="Total productes" value={String(totalProducts)} />
        <MiniCard label="Amb cost definit" value={`${withCost} / ${totalProducts}`} />
        <MiniCard label="Categories" value={String(categories.length)} />
      </section>

      {/* Category list */}
      <div className="space-y-3">
        {categories.map((cat) => (
          <CategorySection key={cat.name} category={cat} />
        ))}
      </div>

      {totalProducts === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
          <p className="text-[14px] text-slate-500">No hi ha productes. Puja un Excel d&apos;Articles Venda a la seccio Vendes i els productes apareixeran aqui automaticament.</p>
        </div>
      )}
    </div>
  );
}

/* ---- Category section ---- */

function CategorySection({ category }: { category: CategoryGroup }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50/50"
      >
        {isOpen ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
        <span className={`size-3 rounded-full ${category.color}`} />
        <span className="text-[15px] font-semibold text-slate-900">{category.name}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
          {category.products.length} productes
        </span>
        <span className="ml-auto text-[12px] text-slate-400">
          {category.withCost}/{category.products.length} amb cost
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-[var(--line)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5 text-left">Codi</th>
                <th className="px-5 py-2.5 text-left">Producte</th>
                <th className="px-5 py-2.5 text-right w-32">Cost unitari (EUR)</th>
                <th className="px-5 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {category.products
                .sort((a, b) => a.productName.localeCompare(b.productName))
                .map((p) => (
                  <ProductRow key={p.id} product={p} categoryName={category.name} />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---- Product row with inline edit + cost history ---- */

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProductRow({ product, categoryName }: { product: ProductCost; categoryName: string }) {
  const router = useRouter();
  const [cost, setCost] = useState(product.unitCost);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [isPending, startTransition] = useTransition();
  const [showHistory, setShowHistory] = useState(false);
  const hasChanged = cost !== product.unitCost;

  function save() {
    startTransition(async () => {
      await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: product.productCode,
          productName: product.productName,
          category: categoryName,
          unitCost: cost,
          effectiveFrom,
        }),
      });
      router.refresh();
    });
  }

  return (
    <>
      <tr className="border-t border-[var(--line)]/50 transition hover:bg-slate-50/50">
        <td className="px-5 py-2 text-[13px] text-slate-400">{product.productCode}</td>
        <td className="px-5 py-2 text-[13px] font-medium text-slate-800">{product.productName}</td>
        <td className="px-5 py-2 text-right">
          <div className="inline-flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && hasChanged && save()}
              className={`w-24 rounded-lg border px-2.5 py-1 text-right text-[13px] outline-none transition ${
                hasChanged
                  ? "border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-500/10"
                  : cost > 0
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-[var(--line)] bg-slate-50/50"
              }`}
            />
            {hasChanged && (
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                title="Vàlid des de"
                className="w-32 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-indigo-300"
              />
            )}
          </div>
        </td>
        <td className="px-5 py-2">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition"
              title="Veure històric de costos"
            >
              <History className="size-4" />
            </button>
            {hasChanged && (
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-50"
                title="Guardar"
              >
                <Save className="size-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {showHistory && <CostHistoryRow productCode={product.productCode} />}
    </>
  );
}

/** Fetches and renders the cost-history timeline for a product. Lazy-loaded
 * only when the user expands the row. */
function CostHistoryRow({ productCode }: { productCode: string }) {
  const [history, setHistory] = useState<ProductCostHistoryEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products?historyFor=${encodeURIComponent(productCode)}`)
      .then((r) => r.json())
      .then((data: ProductCostHistoryEntry[]) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productCode]);

  return (
    <tr className="border-t border-[var(--line)]/50 bg-slate-50/30">
      <td colSpan={4} className="px-5 py-3">
        {history === null ? (
          <p className="text-[12px] text-slate-400">Carregant històric…</p>
        ) : history.length === 0 ? (
          <p className="text-[12px] text-slate-400">Aquest producte encara no té històric de costos registrat.</p>
        ) : (
          <div className="space-y-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Històric de costos</p>
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
                <span className="font-mono text-slate-400">
                  {entry.validFrom} → {entry.validUntil ?? "avui"}
                </span>
                <span className="ml-auto font-semibold text-slate-800">
                  {entry.unitCost.toFixed(4)} €
                </span>
                {entry.validUntil === null && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">actual</span>
                )}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ---- Helpers ---- */

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[26px] font-bold tracking-tight text-slate-900">{value}</p>
    </article>
  );
}
