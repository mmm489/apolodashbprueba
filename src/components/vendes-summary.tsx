"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { ProductSaleRecord } from "@/lib/types";

/* ---- Family classification ---- */

const familyRules: Array<{ name: string; color: string; bgLight: string; keywords: string[] }> = [
  { name: "Gelats", color: "bg-pink-500", bgLight: "bg-pink-50 text-pink-700", keywords: ["cucurutxo", "pot l", "pot m", "pot s", "tupper"] },
  { name: "Cafes", color: "bg-amber-700", bgLight: "bg-amber-50 text-amber-800", keywords: ["cafe", "cafè", "café", "capuccino", "tallat", "expresso", "descafeinat", "descafeïnat", "xocolata a la tassa", "cola cao", "bombo", "cafe casa", "cafe veïns", "cafe veins"] },
  { name: "Begudes", color: "bg-sky-500", bgLight: "bg-sky-50 text-sky-700", keywords: ["7up", "aigua", "aquarius", "begudes", "bitter", "cacaolat", "coke", "damm", "estrella", "fanta", "free damm", "granini", "nestea", "tonica", "casa hi cream"] },
  { name: "Crepes", color: "bg-yellow-500", bgLight: "bg-yellow-50 text-yellow-700", keywords: ["crepe", "crepre", "mediterraneo", "mixto", "quesos"] },
  { name: "Hi Pop", color: "bg-violet-500", bgLight: "bg-violet-50 text-violet-700", keywords: ["waffle", "sandwich waffle", "sandwic waffle", "hi pop", "sandwic kinder", "sandwich nutella", "sandwich pistatxo", "sandwich xocolata", "sandwich salsa"] },
  { name: "Xurros", color: "bg-orange-500", bgLight: "bg-orange-50 text-orange-700", keywords: ["xurro", "xurros", "xocolata & xurros"] },
  { name: "Batuts", color: "bg-purple-500", bgLight: "bg-purple-50 text-purple-700", keywords: ["batut"] },
  { name: "Especialitats", color: "bg-teal-500", bgLight: "bg-teal-50 text-teal-700", keywords: ["matcha", "pistacho latte", "chai", "special"] },
  { name: "Frappes", color: "bg-cyan-500", bgLight: "bg-cyan-50 text-cyan-700", keywords: ["frappe", "frapuccino"] },
  { name: "Smoothies", color: "bg-lime-500", bgLight: "bg-lime-50 text-lime-700", keywords: ["smoothie"] },
  { name: "Frozen Iogurt", color: "bg-fuchsia-500", bgLight: "bg-fuchsia-50 text-fuchsia-700", keywords: ["pot iogurt", "açai", "acai"] },
  { name: "Granissats", color: "bg-blue-400", bgLight: "bg-blue-50 text-blue-700", keywords: ["granitzat", "granissat"] },
  { name: "Receptes", color: "bg-rose-500", bgLight: "bg-rose-50 text-rose-700", keywords: ["cookies cream", "kinder delight", "lotus receta", "nutella & go", "oreo ice", "pistacho receta", "macha receta", "yogurt pasi"] },
  { name: "Ice Drinks", color: "bg-sky-400", bgLight: "bg-sky-50 text-sky-700", keywords: ["iced ", "milk cafe", "milk mango", "milk maracuia"] },
  { name: "Berlines", color: "bg-amber-500", bgLight: "bg-amber-50 text-amber-700", keywords: ["max kinder", "max lotus", "max oreo", "max pistacho", "mini donut", "berlines"] },
  { name: "Dought", color: "bg-red-400", bgLight: "bg-red-50 text-red-700", keywords: ["doght", "dought"] },
  { name: "Infusions", color: "bg-green-400", bgLight: "bg-green-50 text-green-700", keywords: ["menta poleo", "english breakfast", "te vert", "camamilla", "roibos"] },
  { name: "Orxata", color: "bg-amber-300", bgLight: "bg-amber-50 text-amber-700", keywords: ["orxata"] },
  { name: "Xips", color: "bg-stone-400", bgLight: "bg-stone-50 text-stone-700", keywords: ["patates xips"] },
  { name: "Toppings i extres", color: "bg-slate-500", bgLight: "bg-slate-100 text-slate-600", keywords: ["sabor ", "salsa", "topping", "nutella 0", "nutella 1", "crispy", "brownie", "lacasitos", "lotus pols", "maduixa natural", "nata ", "nube ", "oreo pols", "platan natural", "sucre ", "crumble", "pistatxo pols", "gelat avellana", "gelat dulce", "gelat iogurt", "gelat kinder", "gelat lotus", "gelat maduixa", "gelat nata", "gelat oreo", "gelat açai", "gelat vainilla", "gelat xocolata", "gelat cafe", "gelat cheesecake", "gelat ferrero", "gelat menta", "gelat pistaxo", "gelat nutella", "gelat crispetes", "gelat maracuia", "gelat mango", "gelat coco", "xoco maduixa", "melmalada", "caramel salat", "xocolata pistatxo", "xocolata blanca"] },
  { name: "Varios", color: "bg-gray-400", bgLight: "bg-gray-50 text-gray-600", keywords: ["gel", "suplement", "varios", "descafeinat sobre", "sense sucre", "sucre more", "llet sense", "llet vegetal"] },
];

function classifyFamily(productName: string) {
  const lower = productName.toLowerCase();
  for (const rule of familyRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule;
  }
  return { name: "Altres", color: "bg-slate-400", bgLight: "bg-slate-50 text-slate-600", keywords: [] };
}

interface FamilyAgg {
  name: string;
  color: string;
  bgLight: string;
  totalUnits: number;
  totalAmount: number;
  products: Array<{ productName: string; units: number; amount: number }>;
}

function aggregateByFamily(products: ProductSaleRecord[]): FamilyAgg[] {
  const map = new Map<string, FamilyAgg>();
  for (const p of products) {
    const rule = classifyFamily(p.productName);
    const existing = map.get(rule.name);
    if (existing) {
      existing.totalUnits += p.units;
      existing.totalAmount += p.amount;
      const prod = existing.products.find((x) => x.productName === p.productName);
      if (prod) {
        prod.units += p.units;
        prod.amount += p.amount;
      } else {
        existing.products.push({ productName: p.productName, units: p.units, amount: p.amount });
      }
    } else {
      map.set(rule.name, {
        name: rule.name,
        color: rule.color,
        bgLight: rule.bgLight,
        totalUnits: p.units,
        totalAmount: p.amount,
        products: [{ productName: p.productName, units: p.units, amount: p.amount }],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/* ---- Component ---- */

export function VendesSummary({
  productSales,
  topProducts,
}: {
  productSales: ProductSaleRecord[];
  topProducts: Array<{ productName: string; units: number; amount: number }>;
}) {
  const families = aggregateByFamily(productSales);
  const grandTotal = families.reduce((s, f) => s + f.totalAmount, 0);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  return (
    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      {/* Categories */}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-[20px] font-bold tracking-tight text-slate-900">Vendes per categoria</p>
          <p className="mt-0.5 text-[13px] text-slate-500">Acumulat del periode seleccionat</p>
        </div>
        <div className="space-y-2">
          {families.map((fam) => {
            const pct = grandTotal > 0 ? (fam.totalAmount / grandTotal) * 100 : 0;
            const isOpen = expandedFamily === fam.name;
            return (
              <div key={fam.name} className="rounded-xl border border-[var(--line)] overflow-hidden transition hover:shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedFamily(isOpen ? null : fam.name)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  {isOpen ? <ChevronDown className="size-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="size-3.5 text-slate-400 shrink-0" />}
                  <span className={`size-3 rounded-full shrink-0 ${fam.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{fam.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[12px] text-slate-400">{fmtNum(fam.totalUnits)} uds</span>
                        <span className={`rounded-lg px-2 py-0.5 text-[12px] font-semibold ${fam.bgLight}`}>{euro(fam.totalAmount)}</span>
                        <span className="w-10 text-right text-[12px] font-medium text-slate-500">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${fam.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--line)] bg-slate-50/50 px-4 py-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                          <th className="pb-1.5 text-left">Producte</th>
                          <th className="pb-1.5 text-right">Unitats</th>
                          <th className="pb-1.5 text-right">Import</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fam.products.sort((a, b) => b.amount - a.amount).map((p) => (
                          <tr key={p.productName} className="border-t border-[var(--line)]/30">
                            <td className="py-1.5 pr-2 text-[13px] text-slate-700">{p.productName}</td>
                            <td className="py-1.5 pr-2 text-right text-[13px] text-slate-500">{fmtNum(p.units)}</td>
                            <td className="py-1.5 text-right text-[13px] font-semibold text-slate-800">{euro(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top products */}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-[20px] font-bold tracking-tight text-slate-900">Top productes</p>
          <p className="mt-0.5 text-[13px] text-slate-500">Ranking per import acumulat</p>
        </div>
        <div className="space-y-2">
          {topProducts.slice(0, 15).map((p, i) => {
            const maxAmount = topProducts[0]?.amount ?? 1;
            const pct = (p.amount / maxAmount) * 100;
            return (
              <div key={p.productName} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <span className={`flex size-6 items-center justify-center rounded-lg text-[11px] font-bold ${i < 3 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{p.productName}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[12px] text-slate-400">{fmtNum(p.units)} uds</span>
                        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">{euro(p.amount)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---- Helpers ---- */

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}
