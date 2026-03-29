"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Filter, X } from "lucide-react";

export function ExpenseFilterBar({
  supplier,
  product,
  category,
  suppliers,
  categories,
}: {
  supplier: string;
  product: string;
  category: string;
  suppliers: string[];
  categories: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [localSupplier, setLocalSupplier] = useState(supplier);
  const [localProduct, setLocalProduct] = useState(product);
  const [localCategory, setLocalCategory] = useState(category);

  function apply() {
    const next = new URLSearchParams(params.toString());
    if (localSupplier) next.set("supplier", localSupplier);
    else next.delete("supplier");
    if (localProduct) next.set("product", localProduct);
    else next.delete("product");
    if (localCategory) next.set("category", localCategory);
    else next.delete("category");
    router.push(`/gastos?${next.toString()}`);
  }

  function clear() {
    const next = new URLSearchParams(params.toString());
    next.delete("supplier");
    next.delete("product");
    next.delete("category");
    setLocalSupplier("");
    setLocalProduct("");
    setLocalCategory("");
    router.push(`/gastos?${next.toString()}`);
  }

  const hasFilters = supplier || product || category;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          <Filter className="h-4 w-4 text-slate-400" />
          Filtros
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Proveedor</label>
          <select
            value={localSupplier}
            onChange={(e) => setLocalSupplier(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Producto</label>
          <input
            type="text"
            value={localProduct}
            onChange={(e) => setLocalProduct(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="Buscar en descripcion..."
            className="w-full rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Categoria</label>
          <select
            value={localCategory}
            onChange={(e) => setLocalCategory(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>

        <button
          onClick={apply}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.97]"
        >
          Aplicar
        </button>

        {hasFilters ? (
          <button
            onClick={clear}
            className="flex items-center gap-1 rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        ) : null}
      </div>
    </div>
  );
}
