"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, ShoppingBag } from "lucide-react";
import type { ProductSaleRecord, SalesReport } from "@/lib/types";

type Tab = "resumen" | "detalle";

export function VentasTabs({
  salesReports,
  productSales,
  selectedDate,
}: {
  salesReports: SalesReport[];
  productSales: ProductSaleRecord[];
  selectedDate?: string;
}) {
  const [tab, setTab] = useState<Tab>(selectedDate ? "detalle" : "resumen");
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectDate = useCallback(
    (date: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", date);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Auto-switch to detail tab when a date is selected
  useEffect(() => {
    if (selectedDate) setTab("detalle");
  }, [selectedDate]);

  const selectedReport = selectedDate ? salesReports.find((r) => r.businessDate === selectedDate) : undefined;
  const selectedProducts = selectedDate
    ? productSales.filter((p) => p.businessDate === selectedDate).sort((a, b) => b.amount - a.amount)
    : [];

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--line)]">
        <TabButton
          active={tab === "resumen"}
          onClick={() => setTab("resumen")}
          icon={<CalendarDays className="h-4 w-4" />}
          label="Resum diari"
          count={salesReports.length}
        />
        <TabButton
          active={tab === "detalle"}
          onClick={() => setTab("detalle")}
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Detall del dia"
          count={selectedProducts.length}
        />
      </div>

      <div className="p-5">
        {tab === "resumen" && (
          <ResumenTab reports={salesReports} selectedDate={selectedDate} onSelect={selectDate} />
        )}
        {tab === "detalle" && (
          <DetalleTab report={selectedReport} products={selectedProducts} />
        )}
      </div>
    </div>
  );
}

/* ---- Tab button ---- */
function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-[13px] font-semibold transition ${
        active ? "border-b-2 border-indigo-500 text-indigo-600" : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
        {count}
      </span>
    </button>
  );
}

/* ---- Resumen Tab ---- */
function ResumenTab({
  reports,
  selectedDate,
  onSelect,
}: {
  reports: SalesReport[];
  selectedDate?: string;
  onSelect: (date: string) => void;
}) {
  if (!reports.length) {
    return <Empty text="No hi ha informes de vendes en aquest periode." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <Th>Data</Th>
            <Th align="right">Vendes</Th>
            <Th align="right">Comandes</Th>
            <Th align="right">Tiquet mitja</Th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.businessDate)}
              className={`cursor-pointer border-b border-[var(--line)] transition ${
                r.businessDate === selectedDate
                  ? "bg-indigo-50/60 border-indigo-200"
                  : "hover:bg-slate-50/80"
              }`}
            >
              <Td className="font-semibold text-slate-800">{formatDate(r.businessDate)}</Td>
              <Td align="right" className="font-semibold text-emerald-700">{euro(r.totalSales)}</Td>
              <Td align="right">{fmtNum(r.orderCount)}</Td>
              <Td align="right">{euro(r.averageTicket)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/50">
            <Td className="font-semibold text-slate-600">Total</Td>
            <Td align="right" className="font-bold text-slate-900">
              {euro(reports.reduce((s, r) => s + r.totalSales, 0))}
            </Td>
            <Td align="right" className="font-bold text-slate-900">
              {fmtNum(reports.reduce((s, r) => s + r.orderCount, 0))}
            </Td>
            <Td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---- Detalle Tab ---- */
function DetalleTab({
  report,
  products,
}: {
  report?: SalesReport;
  products: ProductSaleRecord[];
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!report) {
    return <Empty text="Selecciona un dia a la pestanya Resum per veure el desglossament de productes." />;
  }

  const families = groupByFamily(products);
  const toggleFamily = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-5">
      {/* Day summary header */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Vendes totals" value={euro(report.totalSales)} />
        <MiniStat label="Comandes" value={fmtNum(report.orderCount)} />
        <MiniStat label="Tiquet mitja" value={euro(report.averageTicket)} />
      </div>

      {/* Products grouped by family */}
      {families.length > 0 ? (
        <div className="space-y-3">
          {families.map((fam) => {
            const isOpen = !collapsed[fam.name];
            return (
              <div key={fam.name} className="rounded-xl border border-[var(--line)] transition hover:shadow-sm">
                {/* Family header */}
                <button
                  onClick={() => toggleFamily(fam.name)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${fam.color}`} />
                        <p className="text-[13px] font-semibold text-slate-800">{fam.name}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                          {fam.items.length} {fam.items.length === 1 ? "article" : "articles"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-[12px] text-slate-500">{fmtNum(fam.totalUnits)} uds</span>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700">
                          {euro(fam.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Family items */}
                {isOpen && (
                  <div className="border-t border-[var(--line)] bg-slate-50/50 px-4 py-3">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Producte</th>
                          <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Codi</th>
                          <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Unitats</th>
                          <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Import</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fam.items.map((p) => (
                          <tr key={p.id} className="border-t border-[var(--line)]/50">
                            <td className="py-2 pr-3 text-[13px] text-slate-700">{p.productName}</td>
                            <td className="py-2 pr-3 text-[13px] text-slate-500">{p.productCode}</td>
                            <td className="py-2 pr-3 text-right text-[13px] text-slate-500">{fmtNum(p.units)}</td>
                            <td className="py-2 text-right text-[13px] font-semibold text-slate-800">{euro(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-[13px] font-semibold text-slate-600">Total dia</p>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-slate-500">
                {fmtNum(products.reduce((s, p) => s + p.units, 0))} uds
              </span>
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[13px] font-semibold text-white">
                {euro(products.reduce((s, p) => s + p.amount, 0))}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <Empty text="No hi ha productes registrats per aquest dia." />
      )}
    </div>
  );
}

/* ---- Product family classification ---- */

const familyRules: Array<{ name: string; color: string; keywords: string[] }> = [
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

function classifyFamily(productName: string): { name: string; color: string } {
  const lower = productName.toLowerCase();
  for (const rule of familyRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { name: rule.name, color: rule.color };
    }
  }
  return { name: "Altres", color: "bg-slate-400" };
}

interface FamilyGroup {
  name: string;
  color: string;
  items: ProductSaleRecord[];
  totalUnits: number;
  totalAmount: number;
}

function groupByFamily(products: ProductSaleRecord[]): FamilyGroup[] {
  const map = new Map<string, FamilyGroup>();

  for (const p of products) {
    const { name, color } = classifyFamily(p.productName);
    const existing = map.get(name);
    if (existing) {
      existing.items.push(p);
      existing.totalUnits += p.units;
      existing.totalAmount += p.amount;
    } else {
      map.set(name, { name, color, items: [p], totalUnits: p.units, totalAmount: p.amount });
    }
  }

  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/* ---- Shared helpers ---- */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[18px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-slate-400">{text}</p>;
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`py-3 pr-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className, colSpan }: { children?: React.ReactNode; align?: "right"; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`py-2.5 pr-3 text-[13px] text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" });
}
