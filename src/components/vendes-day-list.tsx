"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, FileUp, LoaderCircle } from "lucide-react";

import type { DayStatus } from "@/lib/analytics";
import type { HourlySalesEntry, ProductSaleRecord } from "@/lib/types";

/* ---- Family classification (from ventas-tabs) ---- */

const familyRules: Array<{ name: string; color: string; keywords: string[] }> = [
  { name: "Cafes", color: "bg-amber-500", keywords: ["cafe", "cafè", "café", "capuccino", "cappuccino", "cortado", "descafeinat", "descafeinado", "llet", "americà", "americano"] },
  { name: "Begudes", color: "bg-sky-500", keywords: ["aigua", "agua", "coke", "coca", "fanta", "nestea", "7up", "estrella", "granini", "zumo", "refresc", "tonica", "aquarius", "begudes", "kas", "schweppes", "sprite", "limon", "llimona", "taronja", "cervesa", "cerveza", "bitter", "radler", "san miguel"] },
  { name: "Gelats", color: "bg-pink-500", keywords: ["gelat", "helado", "cucurutxo", "cucurucho", "pot m", "pot s", "pot l", "max ", "magnum", "cornetto", "tarrina", "batut", "smoothie", "granizat", "polo"] },
  { name: "Xurros i xocolata", color: "bg-orange-500", keywords: ["xurro", "churro", "xocolata", "chocolate"] },
  { name: "Bolleria i dolcos", color: "bg-rose-500", keywords: ["donut", "croissant", "napolitana", "ensaimada", "cookie", "galleta", "muffin", "brownie", "magdalena", "palmera", "mini donut"] },
  { name: "Menjar", color: "bg-green-500", keywords: ["sandwich", "bocadillo", "bocata", "entrepan", "crepe", "gofre", "waffle", "tosta", "patata", "nachos", "frankfurt", "hot dog"] },
];

function classifyFamily(productName: string) {
  const lower = productName.toLowerCase();
  for (const rule of familyRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return { name: rule.name, color: rule.color };
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

/* ---- Main component ---- */

export function VendesDayList({
  dayStatuses,
  productSales,
  hourlySales,
}: {
  dayStatuses: DayStatus[];
  productSales: ProductSaleRecord[];
  hourlySales: HourlySalesEntry[];
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-slate-50/80 text-left text-[12px] font-medium uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3 w-8" />
            <th className="px-5 py-3">Data</th>
            <th className="px-5 py-3 text-right">Vendes</th>
            <th className="px-5 py-3 text-right">Comandes</th>
            <th className="px-5 py-3 text-center">Articles</th>
            <th className="px-5 py-3 text-center">Hores</th>
            <th className="px-5 py-3 text-right">Accions</th>
          </tr>
        </thead>
        <tbody>
          {dayStatuses.map((day) => {
            const isExpanded = expandedDate === day.date;
            const dayProducts = productSales.filter((p) => p.businessDate === day.date);
            const dayHourly = hourlySales.filter((h) => h.businessDate === day.date);

            return (
              <DayRow
                key={day.date}
                day={day}
                isExpanded={isExpanded}
                onToggle={() => setExpandedDate(isExpanded ? null : day.date)}
                dayProducts={dayProducts}
                dayHourly={dayHourly}
              />
            );
          })}
          {dayStatuses.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                No hi ha dies en aquest periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Day row ---- */

function DayRow({
  day,
  isExpanded,
  onToggle,
  dayProducts,
  dayHourly,
}: {
  day: DayStatus;
  isExpanded: boolean;
  onToggle: () => void;
  dayProducts: ProductSaleRecord[];
  dayHourly: HourlySalesEntry[];
}) {
  const hasAnyData = day.hasArticles || day.hasHourly;

  return (
    <>
      <tr
        onClick={hasAnyData ? onToggle : undefined}
        className={`border-b border-[var(--line)] transition ${hasAnyData ? "cursor-pointer hover:bg-slate-50/80" : ""} ${isExpanded ? "bg-indigo-50/60" : ""}`}
      >
        <td className="px-5 py-3">
          {hasAnyData && (
            isExpanded
              ? <ChevronDown className="size-4 text-slate-400" />
              : <ChevronRight className="size-4 text-slate-400" />
          )}
        </td>
        <td className="px-5 py-3 font-semibold text-slate-900">{formatDate(day.date)}</td>
        <td className="px-5 py-3 text-right font-semibold text-emerald-700">
          {day.totalSales != null ? euro(day.totalSales) : <span className="text-slate-300">--</span>}
        </td>
        <td className="px-5 py-3 text-right text-slate-600">
          {day.orderCount != null ? fmtNum(day.orderCount) : <span className="text-slate-300">--</span>}
        </td>
        <td className="px-5 py-3 text-center">
          <StatusBadge ok={day.hasArticles} />
        </td>
        <td className="px-5 py-3 text-center">
          <StatusBadge ok={day.hasHourly} />
        </td>
        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {!day.hasArticles && <UploadButton label="Articles" date={day.date} />}
            {!day.hasHourly && <UploadButton label="Hores" date={day.date} />}
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={7} className="border-b border-[var(--line)] bg-slate-50/30 px-5 py-4">
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Products */}
              {day.hasArticles && dayProducts.length > 0 && (
                <div>
                  <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Articles Venda</p>
                  <div className="space-y-2">
                    {groupByFamily(dayProducts).map((fam) => (
                      <div key={fam.name} className="rounded-lg border border-[var(--line)] bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`size-2.5 rounded-full ${fam.color}`} />
                            <span className="text-[13px] font-semibold text-slate-800">{fam.name}</span>
                            <span className="text-[11px] text-slate-400">{fam.items.length} articles</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[12px] text-slate-500">{fmtNum(fam.totalUnits)} uds</span>
                            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">{euro(fam.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hourly */}
              {day.hasHourly && dayHourly.length > 0 && (
                <div>
                  <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Resum Hores</p>
                  <div className="rounded-lg border border-[var(--line)] bg-white overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--line)] bg-slate-50/80 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2 text-left">Hora</th>
                          <th className="px-3 py-2 text-right">Operacions</th>
                          <th className="px-3 py-2 text-right">Import</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dayHourly].sort((a, b) => a.hour.localeCompare(b.hour)).map((h) => (
                          <tr key={h.id} className="border-b border-[var(--line)]/50">
                            <td className="px-3 py-1.5 text-[13px] text-slate-700">{h.hour}</td>
                            <td className="px-3 py-1.5 text-right text-[13px] text-slate-600">{h.orderCount}</td>
                            <td className="px-3 py-1.5 text-right text-[13px] font-semibold text-slate-800">{euro(h.sales)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50/80 font-semibold text-slate-900">
                          <td className="px-3 py-2 text-[13px]">Total</td>
                          <td className="px-3 py-2 text-right text-[13px]">{dayHourly.reduce((s, h) => s + h.orderCount, 0)}</td>
                          <td className="px-3 py-2 text-right text-[13px]">{euro(dayHourly.reduce((s, h) => s + h.sales, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---- Status badge ---- */

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="size-3" /> Pujat
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      <Clock className="size-3" /> Pendent
    </span>
  );
}

/* ---- Upload button ---- */

function UploadButton({ label, date }: { label: string; date: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("files", file);
      await fetch("/api/ingest/upload", { method: "POST", body: formData });
      router.refresh();
    });

    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        title={`Pujar ${label} (${date})`}
      >
        {isPending ? <LoaderCircle className="size-3 animate-spin" /> : <FileUp className="size-3" />}
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}

/* ---- Helpers ---- */

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ca-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
