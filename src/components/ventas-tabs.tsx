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
          label="Resumen diario"
          count={salesReports.length}
        />
        <TabButton
          active={tab === "detalle"}
          onClick={() => setTab("detalle")}
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Detalle del dia"
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
    return <Empty text="No hay informes de ventas en este periodo." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <Th>Fecha</Th>
            <Th align="right">Ventas</Th>
            <Th align="right">Pedidos</Th>
            <Th align="right">Ticket medio</Th>
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
    return <Empty text="Selecciona un dia en la pestana Resumen para ver el desglose de productos." />;
  }

  const families = groupByFamily(products);
  const toggleFamily = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-5">
      {/* Day summary header */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Ventas totales" value={euro(report.totalSales)} />
        <MiniStat label="Pedidos" value={fmtNum(report.orderCount)} />
        <MiniStat label="Ticket medio" value={euro(report.averageTicket)} />
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
                          {fam.items.length} {fam.items.length === 1 ? "articulo" : "articulos"}
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
                          <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Producto</th>
                          <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Codigo</th>
                          <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Unidades</th>
                          <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Importe</th>
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
        <Empty text="No hay productos registrados para este dia." />
      )}
    </div>
  );
}

/* ---- Product family classification ---- */

const familyRules: Array<{ name: string; color: string; keywords: string[] }> = [
  { name: "Cafes", color: "bg-amber-500", keywords: ["cafe", "cafè", "café", "capuccino", "cappuccino", "cortado", "descafeinat", "descafeinado", "llet", "americà", "americano"] },
  { name: "Begudes", color: "bg-sky-500", keywords: ["aigua", "agua", "coke", "coca", "fanta", "nestea", "7up", "estrella", "granini", "zumo", "refresc", "tonica", "aquarius", "begudes", "kas", "schweppes", "sprite", "limon", "llimona", "taronja", "cervesa", "cerveza", "bitter", "radler", "san miguel"] },
  { name: "Gelats", color: "bg-pink-500", keywords: ["gelat", "helado", "cucurutxo", "cucurucho", "pot m", "pot s", "pot l", "max ", "magnum", "cornetto", "tarrina", "batut", "smoothie", "granizat", "polo"] },
  { name: "Xurros i xocolata", color: "bg-orange-500", keywords: ["xurro", "churro", "xocolata", "chocolate"] },
  { name: "Bolleria i dolcos", color: "bg-rose-500", keywords: ["donut", "croissant", "napolitana", "ensaimada", "cookie", "galleta", "muffin", "brownie", "magdalena", "palmera", "mini donut"] },
  { name: "Menjar", color: "bg-green-500", keywords: ["sandwich", "bocadillo", "bocata", "entrepan", "crepe", "gofre", "waffle", "tosta", "patata", "nachos", "frankfurt", "hot dog"] },
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
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
