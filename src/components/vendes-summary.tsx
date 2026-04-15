"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { ProductCost, ProductSaleRecord } from "@/lib/types";
import { classifyFamily } from "@/lib/product-families";

interface FamilyAgg {
  name: string;
  color: string;
  bgLight: string;
  totalUnits: number;
  totalAmount: number;
  products: Array<{ productCode: string; productName: string; units: number; amount: number }>;
}

function aggregateByFamily(products: ProductSaleRecord[]): FamilyAgg[] {
  const map = new Map<string, FamilyAgg>();
  for (const p of products) {
    const rule = classifyFamily(p.productName);
    const existing = map.get(rule.name);
    if (existing) {
      existing.totalUnits += p.units;
      existing.totalAmount += p.amount;
      const prod = existing.products.find((x) => x.productCode === p.productCode);
      if (prod) {
        prod.units += p.units;
        prod.amount += p.amount;
      } else {
        existing.products.push({ productCode: p.productCode, productName: p.productName, units: p.units, amount: p.amount });
      }
    } else {
      map.set(rule.name, {
        name: rule.name,
        color: rule.color,
        bgLight: rule.bgLight,
        totalUnits: p.units,
        totalAmount: p.amount,
        products: [{ productCode: p.productCode, productName: p.productName, units: p.units, amount: p.amount }],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/* ---- Component ---- */

export function VendesSummary({
  productSales,
  topProducts,
  productCosts,
}: {
  productSales: ProductSaleRecord[];
  topProducts: Array<{ productName: string; units: number; amount: number }>;
  productCosts: ProductCost[];
}) {
  const families = aggregateByFamily(productSales);
  const grandTotal = families.reduce((s, f) => s + f.totalAmount, 0);
  const costMap = new Map<string, number>();
  const costByName = new Map<string, number>();
  for (const pc of productCosts) {
    costMap.set(pc.productCode, pc.unitCost);
    costByName.set(pc.productName.toLowerCase(), pc.unitCost);
  }
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
            const famCost = fam.products.reduce((s, p) => s + (costMap.get(p.productCode) ?? 0) * p.units, 0);
            const famMargin = fam.totalAmount - famCost;
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400">{fmtNum(fam.totalUnits)} uds</span>
                        <span className="text-[11px] text-emerald-600">{euro(fam.totalAmount)}</span>
                        <span className="text-[11px] text-rose-500">{euro(famCost)}</span>
                        <span className={`rounded-lg px-1.5 py-0.5 text-[11px] font-semibold ${famMargin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{euro(famMargin)}</span>
                        <span className="w-10 text-right text-[11px] font-medium text-slate-400">{pct.toFixed(1)}%</span>
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
                          <th className="pb-1.5 text-right">Uds</th>
                          <th className="pb-1.5 text-right">Venda</th>
                          <th className="pb-1.5 text-right">Cost</th>
                          <th className="pb-1.5 text-right">Marge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fam.products.sort((a, b) => b.amount - a.amount).map((p) => {
                          const unitCost = costMap.get(p.productCode) ?? 0;
                          const totalCost = unitCost * p.units;
                          const margin = p.amount - totalCost;
                          return (
                            <tr key={p.productCode} className="border-t border-[var(--line)]/30">
                              <td className="py-1.5 pr-2 text-[13px] text-slate-700">{p.productName}</td>
                              <td className="py-1.5 text-right text-[13px] text-slate-500">{fmtNum(p.units)}</td>
                              <td className="py-1.5 text-right text-[13px] text-emerald-700">{euro(p.amount)}</td>
                              <td className="py-1.5 text-right text-[13px] text-rose-500">{unitCost > 0 ? euro(totalCost) : <span className="text-slate-300">--</span>}</td>
                              <td className={`py-1.5 text-right text-[13px] font-semibold ${unitCost > 0 ? (margin >= 0 ? "text-emerald-700" : "text-rose-600") : "text-slate-300"}`}>{unitCost > 0 ? euro(margin) : "--"}</td>
                            </tr>
                          );
                        })}
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
      <TopProducts topProducts={topProducts} costByName={costByName} />
    </section>
  );
}

/* ---- Top products with sort toggle (import vs marge) ---- */

function TopProducts({
  topProducts,
  costByName,
}: {
  topProducts: Array<{ productName: string; units: number; amount: number }>;
  costByName: Map<string, number>;
}) {
  const [sortBy, setSortBy] = useState<"amount" | "margin">("amount");

  // Enrich with margin info first so we can sort by it.
  const enriched = topProducts.map((p) => {
    const unitCost = costByName.get(p.productName.toLowerCase()) ?? 0;
    const totalCost = unitCost * p.units;
    const margin = p.amount - totalCost;
    return { ...p, unitCost, totalCost, margin, hasCost: unitCost > 0 };
  });

  const sorted = sortBy === "margin"
    // Products without a unit cost are pushed to the end so we don't promote
    // them as "high margin" just because their cost is unknown.
    ? [...enriched].sort((a, b) => {
        if (a.hasCost !== b.hasCost) return a.hasCost ? -1 : 1;
        return b.margin - a.margin;
      })
    : [...enriched].sort((a, b) => b.amount - a.amount);

  const top15 = sorted.slice(0, 15);
  const maxValue = sortBy === "margin"
    ? Math.max(...top15.map((p) => Math.max(p.margin, 0)), 1)
    : top15[0]?.amount ?? 1;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[20px] font-bold tracking-tight text-slate-900">Top productes</p>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Ranking {sortBy === "margin" ? "per marge €" : "per import"}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[12px] font-medium">
          <button
            type="button"
            onClick={() => setSortBy("amount")}
            className={`rounded-md px-2.5 py-1 transition ${sortBy === "amount" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Import
          </button>
          <button
            type="button"
            onClick={() => setSortBy("margin")}
            className={`rounded-md px-2.5 py-1 transition ${sortBy === "margin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Marge
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {top15.map((p, i) => {
            const refValue = sortBy === "margin" ? Math.max(p.margin, 0) : p.amount;
            const pct = maxValue > 0 ? (refValue / maxValue) * 100 : 0;
            const { unitCost, totalCost, margin } = p;
            return (
              <div key={p.productName} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <span className={`flex size-6 items-center justify-center rounded-lg text-[11px] font-bold ${i < 3 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{p.productName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400">{fmtNum(p.units)} uds</span>
                        <span className="text-[11px] text-emerald-600">{euro(p.amount)}</span>
                        <span className="text-[11px] text-rose-500">{unitCost > 0 ? euro(totalCost) : "--"}</span>
                        <span className={`rounded-lg px-1.5 py-0.5 text-[11px] font-semibold ${unitCost > 0 ? (margin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700") : "bg-slate-50 text-slate-400"}`}>
                          {unitCost > 0 ? euro(margin) : "--"}
                        </span>
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
  );
}

/* ---- Helpers ---- */

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}
