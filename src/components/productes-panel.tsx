"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Save } from "lucide-react";

import type { ProductCost } from "@/lib/types";

/* ---- Category classification ---- */

const categoryRules: Array<{ name: string; color: string; keywords: string[] }> = [
  { name: "Gelats", color: "bg-pink-500", keywords: ["cucurutxo", "pot l", "pot m", "pot s", "tupper"] },
  { name: "Cafes", color: "bg-amber-700", keywords: ["cafe", "cafè", "café", "capuccino", "tallat", "expresso", "descafeinat", "descafeïnat", "xocolata a la tassa", "cola cao", "bombo", "cafe casa", "cafe veïns", "cafe veins"] },
  { name: "Begudes", color: "bg-sky-500", keywords: ["7up", "aigua", "aquarius", "begudes", "bitter", "cacaolat", "coke", "damm", "estrella", "fanta", "free damm", "granini", "nestea", "tonica", "casa hi cream"] },
  { name: "Crepes", color: "bg-yellow-500", keywords: ["crepe", "crepre", "mediterraneo", "mixto", "quesos"] },
  { name: "Hi Pop", color: "bg-violet-500", keywords: ["waffle", "sandwich waffle", "sandwic waffle", "hi pop", "sandwic kinder", "sandwich nutella", "sandwich pistatxo", "sandwich xocolata", "sandwich salsa"] },
  { name: "Xurros", color: "bg-orange-500", keywords: ["xurro", "xurros", "xocolata & xurros"] },
  { name: "Batuts", color: "bg-purple-500", keywords: ["batut"] },
  { name: "Especialitats", color: "bg-teal-500", keywords: ["matcha", "pistacho latte", "chai", "special"] },
  { name: "Frappes", color: "bg-cyan-500", keywords: ["frappe", "frapuccino"] },
  { name: "Smoothies", color: "bg-lime-500", keywords: ["smoothie"] },
  { name: "Frozen Iogurt", color: "bg-fuchsia-500", keywords: ["pot iogurt", "açai", "acai"] },
  { name: "Granissats", color: "bg-blue-400", keywords: ["granitzat", "granissat"] },
  { name: "Receptes", color: "bg-rose-500", keywords: ["cookies cream", "kinder delight", "lotus receta", "nutella & go", "oreo ice", "pistacho receta", "macha receta", "yogurt pasi"] },
  { name: "Ice Drinks", color: "bg-sky-400", keywords: ["iced ", "milk cafe", "milk mango", "milk maracuia"] },
  { name: "Berlines", color: "bg-amber-500", keywords: ["max kinder", "max lotus", "max oreo", "max pistacho", "mini donut", "berlines"] },
  { name: "Dought", color: "bg-red-400", keywords: ["doght", "dought"] },
  { name: "Infusions", color: "bg-green-400", keywords: ["menta poleo", "english breakfast", "te vert", "camamilla", "roibos"] },
  { name: "Orxata", color: "bg-amber-300", keywords: ["orxata"] },
  { name: "Xips", color: "bg-stone-400", keywords: ["patates xips"] },
  { name: "Toppings i extres", color: "bg-slate-500", keywords: ["sabor ", "salsa", "topping", "nutella 0", "nutella 1", "crispy", "brownie", "lacasitos", "lotus pols", "maduixa natural", "nata ", "nube ", "oreo pols", "platan natural", "sucre ", "crumble", "pistatxo pols", "gelat avellana", "gelat dulce", "gelat iogurt", "gelat kinder", "gelat lotus", "gelat maduixa", "gelat nata", "gelat oreo", "gelat açai", "gelat vainilla", "gelat xocolata", "gelat cafe", "gelat cheesecake", "gelat ferrero", "gelat menta", "gelat pistaxo", "gelat nutella", "gelat crispetes", "gelat maracuia", "gelat mango", "gelat coco", "xoco maduixa", "melmalada", "caramel salat", "xocolata pistatxo", "xocolata blanca"] },
  { name: "Varios", color: "bg-gray-400", keywords: ["gel", "suplement", "varios", "descafeinat sobre", "sense sucre", "sucre more", "llet sense", "llet vegetal"] },
];

function detectCategory(productName: string): string {
  const lower = productName.toLowerCase();
  for (const rule of categoryRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.name;
  }
  return "Altres";
}

function getCategoryColor(name: string): string {
  return categoryRules.find((r) => r.name === name)?.color ?? "bg-slate-400";
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

/* ---- Product row with inline edit ---- */

function ProductRow({ product, categoryName }: { product: ProductCost; categoryName: string }) {
  const router = useRouter();
  const [cost, setCost] = useState(product.unitCost);
  const [isPending, startTransition] = useTransition();
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
        }),
      });
      router.refresh();
    });
  }

  return (
    <tr className="border-t border-[var(--line)]/50 transition hover:bg-slate-50/50">
      <td className="px-5 py-2 text-[13px] text-slate-400">{product.productCode}</td>
      <td className="px-5 py-2 text-[13px] font-medium text-slate-800">{product.productName}</td>
      <td className="px-5 py-2 text-right">
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
      </td>
      <td className="px-5 py-2">
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
