import { ArrowDownRight, ArrowUpRight, Banknote, Clock, Eye, Minus, Package, Percent, Sparkles, TrendingUp, Users } from "lucide-react";

import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { DonutBreakdown } from "@/components/donut-breakdown";
import { SalesBars } from "@/components/sales-bars";
import { getFinancialWorkspace } from "@/lib/analytics";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspace = await getFinancialWorkspace({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });

  const kpis = workspace.snapshot.kpis;
  const cmp = workspace.comparisons;
  const foodCostPct = kpis.totalSales > 0 ? (kpis.totalProductCost / kpis.totalSales) * 100 : 0;
  const grossMargin = kpis.totalSales - kpis.totalProductCost;
  const operatingMargin = grossMargin - kpis.totalEmployeeCost;
  const grossMarginPct = kpis.totalSales > 0 ? (grossMargin / kpis.totalSales) * 100 : 0;
  const operatingMarginPct = kpis.totalSales > 0 ? (operatingMargin / kpis.totalSales) * 100 : 0;
  // Average ticket deltas (compute on totals because cmp.current.averageTicket
  // already reflects this period's value)
  const ticketDeltaPrev = pctDelta(cmp.current.averageTicket, cmp.previous.averageTicket);
  const ticketDeltaYoY = pctDelta(cmp.current.averageTicket, cmp.lastYear.averageTicket);

  const salesBarItems = workspace.salesReports.slice(0, 10).map((report) => ({
    label: report.businessDate.slice(5),
    valueA: Math.max(0, report.totalSales - report.averageTicket * 8),
    valueB: report.totalSales,
  }));

  // Day of week analysis
  const dayOfWeekMap = new Map<number, { sales: number; count: number }>();
  for (const r of workspace.salesReports) {
    const dow = new Date(r.businessDate).getDay();
    const existing = dayOfWeekMap.get(dow);
    if (existing) {
      existing.sales += r.totalSales;
      existing.count += 1;
    } else {
      dayOfWeekMap.set(dow, { sales: r.totalSales, count: 1 });
    }
  }
  const dayNames = ["dg.", "dl.", "dt.", "dc.", "dj.", "dv.", "ds."];
  const dayOfWeekData = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const data = dayOfWeekMap.get(dow);
    return { day: dayNames[dow], avg: data ? data.sales / data.count : 0, total: data?.sales ?? 0, count: data?.count ?? 0 };
  });
  const maxDowAvg = Math.max(...dayOfWeekData.map((d) => d.avg), 1);

  return (
    <AppFrame
      title="Dashboard"
      description="Vista general del negoci amb metriques clau, tendencies i desglossament financer."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />

      {/* "Què vigilar avui" — daily digest based on the most recent day with data */}
      {workspace.dailyDigest && <TodayDigest digest={workspace.dailyDigest} foodCostPct={foodCostPct} laborPct={kpis.totalSales > 0 ? (kpis.totalEmployeeCost / kpis.totalSales) * 100 : 0} bestHourLabel={kpis.bestHourLabel} />}

      {/* KPI cards */}
      <section className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStatCard
          icon={<TrendingUp className="size-4" />}
          label="Total vendes"
          value={euro(kpis.totalSales)}
          deltaPrev={cmp.deltaPreviousPct}
          deltaYoY={cmp.deltaYoYPct}
          color="emerald"
        />
        <MiniStatCard
          icon={<Package className="size-4" />}
          label="Cost productes"
          value={euro(kpis.totalProductCost)}
          delta="Materia primera"
          color="rose"
        />
        <MiniStatCard
          icon={<Users className="size-4" />}
          label="Cost empleats"
          value={euro(kpis.totalEmployeeCost)}
          delta="Torns registrats"
          color="indigo"
        />
        <MiniStatCard
          icon={<Percent className="size-4" />}
          label="Food cost"
          value={`${foodCostPct.toFixed(1)}%`}
          delta={foodCostPct <= 35 ? "Objectiu: < 35%" : "Per sobre objectiu!"}
          positive={foodCostPct <= 35}
          color={foodCostPct <= 35 ? "emerald" : "rose"}
        />
        <MiniStatCard
          icon={<Banknote className="size-4" />}
          label="Tiquet mitja"
          value={euro(kpis.averageTicket)}
          deltaPrev={ticketDeltaPrev}
          deltaYoY={ticketDeltaYoY}
          color="amber"
        />
      </section>

      {/* P&L + Sales chart */}
      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        {/* Compte de resultats */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Compte de resultats</p>
            <p className="mt-0.5 text-[13px] text-slate-500">Periode seleccionat</p>
          </div>
          <div className="space-y-1.5">
            <PLRow label="Vendes totals" value={kpis.totalSales} bold />
            <PLRow label="Cost productes" value={-kpis.totalProductCost} indent negative />
            <PLDivider />
            <PLRow label="Marge brut" value={grossMargin} bold highlight={grossMargin >= 0 ? "green" : "red"} pct={grossMarginPct} />
            <PLRow label="Cost empleats" value={-kpis.totalEmployeeCost} indent negative />
            <PLDivider />
            <PLRow label="Marge operatiu" value={operatingMargin} bold highlight={operatingMargin >= 0 ? "green" : "red"} pct={operatingMarginPct} />
          </div>
        </div>

        {/* Sales chart */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <SalesBars items={salesBarItems} />
        </div>
      </section>

      {/* Day of week + Expense breakdown */}
      <section className="grid gap-5 xl:grid-cols-2">
        {/* Day of week */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Vendes per dia de la setmana</p>
            <p className="mt-0.5 text-[13px] text-slate-500">Mitjana diaria del periode</p>
          </div>
          <div className="space-y-2">
            {dayOfWeekData.map((d) => {
              const pct = maxDowAvg > 0 ? (d.avg / maxDowAvg) * 100 : 0;
              const isBest = d.avg === maxDowAvg && d.avg > 0;
              return (
                <div key={d.day} className={`cursor-pointer rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${isBest ? "border-indigo-200 bg-indigo-50/50" : "border-[var(--line)] bg-slate-50/50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-[14px] font-bold w-8 ${isBest ? "text-indigo-700" : "text-slate-800"}`}>{d.day}</span>
                      <span className="text-[12px] text-slate-400">{d.count} dies</span>
                    </div>
                    <span className={`text-[13px] font-semibold ${isBest ? "text-indigo-700" : d.avg > 0 ? "text-emerald-700" : "text-slate-300"}`}>
                      {d.avg > 0 ? euro(d.avg) : "--"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isBest ? "bg-indigo-500" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expense breakdown */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Despesa per categoria</p>
          </div>
          <DonutBreakdown items={workspace.totalsByCategory} />
        </div>
      </section>

      {/* Hourly performance */}
      {workspace.snapshot.hourlyPerformance.length > 0 && (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Vendes per hora</p>
            <p className="mt-0.5 text-[13px] text-slate-500">Acumulat del periode seleccionat</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {buildFullHourRange(workspace.snapshot.hourlyPerformance).map((h) => {
                const maxSales = Math.max(...workspace.snapshot.hourlyPerformance.map((x) => x.sales), 1);
                const pct = h.sales > 0 ? (h.sales / maxSales) * 100 : 0;
                const isBest = h.hour === kpis.bestHourLabel && h.sales > 0;
                const isEmpty = h.sales === 0;
                return (
                  <div key={h.hour} className={`rounded-xl border p-3 transition hover:shadow-sm ${isBest ? "border-indigo-200 bg-indigo-50/50" : isEmpty ? "border-[var(--line)] bg-slate-50/30 opacity-60" : "border-[var(--line)] bg-slate-50/50"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[14px] font-bold ${isBest ? "text-indigo-700" : isEmpty ? "text-slate-400" : "text-slate-800"}`}>{h.hour}</span>
                      <span className={`text-[13px] font-semibold ${isBest ? "text-indigo-700" : isEmpty ? "text-slate-300" : "text-emerald-700"}`}>{isEmpty ? "--" : euro(h.sales)}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${isBest ? "bg-indigo-500" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
          {kpis.bestHourLabel !== "--" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5">
              <Clock className="size-4 text-indigo-600" />
              <p className="text-[13px] text-indigo-800">
                <span className="font-semibold">Millor franja:</span> {kpis.bestHourLabel} amb {euro(kpis.bestHourSales)} acumulats
              </p>
            </div>
          )}
        </section>
      )}
    </AppFrame>
  );
}

/* ---------- P&L components ---------- */

function PLRow({ label, value, bold, indent, negative, highlight, pct }: {
  label: string; value: number; bold?: boolean; indent?: boolean; negative?: boolean;
  highlight?: "green" | "red"; pct?: number;
}) {
  const textColor = highlight === "green" ? "text-emerald-700" : highlight === "red" ? "text-rose-600" : negative ? "text-rose-500" : "text-slate-900";
  const bgColor = highlight === "green" ? "bg-emerald-50/50" : highlight === "red" ? "bg-rose-50/50" : "";
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${bgColor}`}>
      <span className={`text-[13px] ${bold ? "font-bold" : "font-medium"} ${indent ? "pl-4 text-slate-500" : "text-slate-800"}`}>{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[14px] ${bold ? "font-bold" : "font-semibold"} ${textColor}`}>{euro(value)}</span>
        {pct != null && <span className={`text-[11px] font-medium ${highlight === "green" ? "text-emerald-600" : "text-rose-500"}`}>{pct.toFixed(1)}%</span>}
      </div>
    </div>
  );
}

function PLDivider() {
  return <div className="mx-4 border-t border-slate-200" />;
}

/* ---------- Shared components ---------- */

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-500", text: "text-indigo-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-500", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", icon: "text-amber-500", text: "text-amber-600" },
  rose: { bg: "bg-rose-50", icon: "text-rose-500", text: "text-rose-600" },
};

function MiniStatCard({
  icon, label, value, delta, positive, color = "indigo", deltaPrev, deltaYoY,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
  color?: string;
  /** Optional: % change vs previous period of same length. Renders as ↗ +X% / ↘ −X%. */
  deltaPrev?: number;
  /** Optional: % change vs same period 52 weeks ago (DOW-aligned). */
  deltaYoY?: number;
}) {
  const c = colorMap[color] ?? colorMap.indigo;
  const showDeltas = deltaPrev !== undefined || deltaYoY !== undefined;
  return (
    <article className="group rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${c.bg} ${c.icon}`}>{icon}</span>
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-900">{value}</p>
      {showDeltas ? (
        <div className="mt-1 flex flex-col gap-0.5">
          {deltaPrev !== undefined && <DeltaPill label="vs anterior" pct={deltaPrev} />}
          {deltaYoY !== undefined && <DeltaPill label="vs any passat" pct={deltaYoY} />}
        </div>
      ) : (
        <p className={`mt-1 text-[13px] font-medium ${positive ? "text-emerald-600" : "text-slate-400"}`}>{delta}</p>
      )}
    </article>
  );
}

function DeltaPill({ label, pct }: { label: string; pct: number }) {
  // Threshold: anything within ±0.5% is treated as flat.
  const isFlat = Math.abs(pct) < 0.5;
  const isUp = pct >= 0.5;
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const color = isFlat ? "text-slate-400" : isUp ? "text-emerald-600" : "text-rose-600";
  const sign = pct > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${color}`}>
      <Icon className="size-3" />
      <span>{sign}{pct.toFixed(1)}%</span>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}

function pctDelta(current: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

/* ---------- "Què vigilar avui" widget ---------- */

function TodayDigest({
  digest,
  foodCostPct,
  laborPct,
  bestHourLabel,
}: {
  digest: import("@/lib/types").DailyDigest;
  foodCostPct: number;
  laborPct: number;
  bestHourLabel: string;
}) {
  const date = new Date(digest.date).toLocaleDateString("ca-ES", { weekday: "long", day: "2-digit", month: "long" });
  const indicators = [
    {
      label: "Vendes",
      value: euro(digest.sales),
      delta: digest.vsLastWeek?.deltaPct,
      deltaLabel: "vs setmana passada",
    },
    {
      label: "Tiquet mitjà",
      value: euro(digest.averageTicket),
      delta: digest.vsLastWeek
        ? pctDelta(digest.averageTicket, digest.vsLastWeek.sales / Math.max(digest.orders, 1))
        : undefined,
      deltaLabel: "vs DOW any passat",
    },
    {
      label: "Food cost",
      value: `${foodCostPct.toFixed(1)}%`,
      target: 35,
      currentForTarget: foodCostPct,
      lowerIsBetter: true,
    },
    {
      label: "Labor cost",
      value: `${laborPct.toFixed(1)}%`,
      target: 30,
      currentForTarget: laborPct,
      lowerIsBetter: true,
    },
    {
      label: "Hora pic",
      value: bestHourLabel || "--",
      hint: "del periode",
    },
  ];

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-indigo-600" />
          <div>
            <p className="text-[18px] font-bold tracking-tight text-slate-900">Què vigilar avui</p>
            <p className="text-[12px] text-slate-500">Resum del dia més recent — {date}</p>
          </div>
        </div>
        {digest.forecastTomorrow && (
          <div className="hidden items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 sm:flex">
            <Sparkles className="size-4 text-violet-600" />
            <div className="text-right">
              <p className="text-[11px] font-medium text-violet-700">Previsió demà</p>
              <p className="text-[15px] font-bold text-violet-900">{euro(digest.forecastTomorrow.sales)}</p>
              <p className="text-[10px] text-violet-600">mitjana últims {digest.forecastTomorrow.basedOn} mateix dia</p>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {indicators.map((ind) => (
          <DigestCard key={ind.label} {...ind} />
        ))}
      </div>
      {digest.vsLastYear && (
        <p className="mt-3 text-[12px] text-slate-500">
          <span className="font-medium">YoY (mateix dia setmana fa 52 setmanes):</span>{" "}
          {euro(digest.vsLastYear.sales)} →
          <span className={digest.vsLastYear.deltaPct >= 0 ? "ml-1 font-semibold text-emerald-600" : "ml-1 font-semibold text-rose-600"}>
            {digest.vsLastYear.deltaPct > 0 ? "+" : ""}{digest.vsLastYear.deltaPct.toFixed(1)}%
          </span>
        </p>
      )}
    </section>
  );
}

function DigestCard({
  label,
  value,
  delta,
  deltaLabel,
  target,
  currentForTarget,
  lowerIsBetter,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  target?: number;
  currentForTarget?: number;
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  let status: "good" | "bad" | "flat" = "flat";
  if (target !== undefined && currentForTarget !== undefined) {
    const meets = lowerIsBetter ? currentForTarget <= target : currentForTarget >= target;
    status = meets ? "good" : "bad";
  } else if (delta !== undefined) {
    status = Math.abs(delta) < 0.5 ? "flat" : delta >= 0 ? "good" : "bad";
  }

  const ringColor = status === "good" ? "ring-emerald-200 bg-emerald-50/50" : status === "bad" ? "ring-rose-200 bg-rose-50/50" : "ring-slate-200 bg-white";
  const valueColor = status === "good" ? "text-emerald-700" : status === "bad" ? "text-rose-700" : "text-slate-900";

  return (
    <div className={`rounded-xl ring-1 ${ringColor} p-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-[20px] font-bold tracking-tight ${valueColor}`}>{value}</p>
      {delta !== undefined && deltaLabel && (
        <p className={`mt-0.5 text-[11px] font-medium ${status === "good" ? "text-emerald-600" : status === "bad" ? "text-rose-600" : "text-slate-400"}`}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}% {deltaLabel}
        </p>
      )}
      {target !== undefined && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Objectiu: {lowerIsBetter ? "<" : ">"} {target}%
        </p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildFullHourRange(data: Array<{ hour: string; sales: number }>) {
  const slots: string[] = [];
  for (let h = 9; h <= 23; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }
  for (let h = 0; h <= 2; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }
  slots.push("3:00");
  const dataMap = new Map<string, number>();
  for (const d of data) { dataMap.set(d.hour.replace(/^0/, ""), (dataMap.get(d.hour.replace(/^0/, "")) ?? 0) + d.sales); }
  return slots.map((slot) => ({ hour: slot, sales: dataMap.get(slot) ?? 0 }));
}
