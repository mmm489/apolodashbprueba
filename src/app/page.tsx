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

      {/* "Què vigilar avui" — only day-specific metrics. Period KPIs moved
          to the separate "Del període" card below. */}
      {workspace.dailyDigest && <TodayDigest digest={workspace.dailyDigest} />}

      {/* Period-wide metrics separated so they don't hide inside the daily widget */}
      <PeriodMetrics
        foodCostPct={foodCostPct}
        laborPct={kpis.totalSales > 0 ? (kpis.totalEmployeeCost / kpis.totalSales) * 100 : 0}
        bestHourLabel={kpis.bestHourLabel}
        productCostCoverage={kpis.productCostCoverage}
      />

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

      {/* Family movements: who's growing, who's falling */}
      {workspace.familyMovements.length > 0 && (
        <FamilyMovements movements={workspace.familyMovements} />
      )}

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

function TodayDigest({ digest }: { digest: import("@/lib/types").DailyDigest }) {
  const date = new Date(digest.date).toLocaleDateString("ca-ES", { weekday: "long", day: "2-digit", month: "long" });
  // Tiquet mitjà delta — apples to apples: today's avg ticket vs last week's
  // avg ticket (computed on their own sales/orders). Fixes the old bug where
  // we divided last-week sales by today's orders.
  const ticketDelta = digest.vsLastWeek
    ? pctDelta(digest.averageTicket, digest.vsLastWeek.averageTicket)
    : undefined;
  const ordersDelta = digest.vsLastWeek && digest.vsLastWeek.orders > 0
    ? pctDelta(digest.orders, digest.vsLastWeek.orders)
    : undefined;

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-indigo-600" />
          <div>
            <p className="text-[18px] font-bold tracking-tight text-slate-900">Què vigilar avui</p>
            <p className="text-[12px] text-slate-500">Resum del dia més recent — {date}</p>
          </div>
        </div>
        {digest.forecastTomorrow && <ForecastTomorrowBlock forecast={digest.forecastTomorrow} />}
      </div>

      {/* Stale data warning */}
      {digest.isStale && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800">
          <span>⚠️</span>
          <div>
            <span className="font-semibold">Dades desactualitzades.</span> El darrer dia amb vendes és {date}, fa més de 48 hores. Puja l&apos;Articles Venda del dia actual per veure el resum real.
          </div>
        </div>
      )}

      {/* Main metrics: 3 cards (Vendes, Comandes, Tiquet mitjà) — all today-specific */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SalesCardWithSparkline
          digest={digest}
        />
        <DigestCard
          label="Comandes"
          value={digest.orders > 0 ? String(digest.orders) : "--"}
          delta={ordersDelta}
          deltaLabel="vs setmana passada"
        />
        <DigestCard
          label="Tiquet mitjà"
          value={digest.averageTicket > 0 ? euro(digest.averageTicket) : "--"}
          delta={ticketDelta}
          deltaLabel="vs setmana passada"
        />
      </div>

      {/* Drivers of delta: was the change traffic or ticket? */}
      {digest.driversVsLastWeek && Math.abs(digest.driversVsLastWeek.totalDeltaEur) > 20 && (
        <DriversBlock drivers={digest.driversVsLastWeek} />
      )}

      {/* YoY context — lower visual weight than the main metrics */}
      {(digest.vsLastYearDow || digest.vsLastYearDate) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {digest.vsLastYearDow && (
            <YoyRow
              label="YoY · mateix dia de setmana"
              helper="52 setmanes enrere (ex: dissabte vs dissabte)"
              date={digest.vsLastYearDow.date}
              sales={digest.vsLastYearDow.sales}
              deltaPct={digest.vsLastYearDow.deltaPct}
              weather={digest.vsLastYearDow.weather}
              calendar={digest.vsLastYearDow.calendar}
              todayWeather={digest.todayWeather}
              todayCalendar={digest.todayCalendar}
            />
          )}
          {digest.vsLastYearDate && (
            <YoyRow
              label="YoY · mateixa data calendari"
              helper="fa exactament 1 any"
              date={digest.vsLastYearDate.date}
              sales={digest.vsLastYearDate.sales}
              deltaPct={digest.vsLastYearDate.deltaPct}
              weather={digest.vsLastYearDate.weather}
              calendar={digest.vsLastYearDate.calendar}
              todayWeather={digest.todayWeather}
              todayCalendar={digest.todayCalendar}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** Sales card with an inline 7-day sparkline so the owner sees the trend at
 * a glance without leaving the widget. */
function SalesCardWithSparkline({ digest }: { digest: import("@/lib/types").DailyDigest }) {
  const delta = digest.vsLastWeek?.deltaPct;
  const status = delta === undefined ? "flat" : Math.abs(delta) < 0.5 ? "flat" : delta >= 0 ? "good" : "bad";
  const ring = status === "good" ? "ring-emerald-200 bg-emerald-50/50" : status === "bad" ? "ring-rose-200 bg-rose-50/50" : "ring-slate-200 bg-white";
  const color = status === "good" ? "text-emerald-700" : status === "bad" ? "text-rose-700" : "text-slate-900";
  return (
    <div className={`rounded-xl ring-1 ${ring} p-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Vendes</p>
      <p className={`mt-1 text-[22px] font-bold tracking-tight ${color}`}>{euro(digest.sales)}</p>
      {delta !== undefined && (
        <p className={`mt-0.5 text-[11px] font-medium ${status === "good" ? "text-emerald-600" : status === "bad" ? "text-rose-600" : "text-slate-400"}`}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs setmana passada
        </p>
      )}
      <Sparkline data={digest.last7Days} />
    </div>
  );
}

/** Minimalist 7-day sparkline. Highlights the last point. */
function Sparkline({ data }: { data: Array<{ date: string; sales: number }> }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.sales), 1);
  const min = Math.min(...data.map((d) => d.sales));
  const range = Math.max(max - min, 1);
  const w = 100;
  const h = 24;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.sales - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-6 w-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-indigo-400"
        points={points.join(" ")}
      />
      {/* Emphasize the last point */}
      {(() => {
        const last = data[data.length - 1];
        const x = w;
        const y = h - ((last.sales - min) / range) * h;
        return <circle cx={x} cy={y} r="2" className="fill-indigo-600" />;
      })()}
    </svg>
  );
}

/** Tomorrow forecast with confidence tier and an action hint. */
function ForecastTomorrowBlock({
  forecast,
}: {
  forecast: NonNullable<import("@/lib/types").DailyDigest["forecastTomorrow"]>;
}) {
  const confidenceColor =
    forecast.confidence === "high" ? "bg-emerald-100 text-emerald-700"
    : forecast.confidence === "medium" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";
  const confidenceLabel =
    forecast.confidence === "high" ? "alta" : forecast.confidence === "medium" ? "mitjana" : "baixa";
  // Rough action hint: hours of staff scaled to expected sales, assuming a
  // ~35€ / hour productivity target (tweak per your actual operation)
  const suggestedHours = Math.max(4, Math.round(forecast.sales / 35));
  return (
    <div className="hidden items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 sm:flex">
      <Sparkles className="size-4 text-violet-600" />
      <div className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <p className="text-[11px] font-medium text-violet-700">Previsió demà</p>
          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${confidenceColor}`}>
            {confidenceLabel}
          </span>
        </div>
        <p className="text-[15px] font-bold text-violet-900">{euro(forecast.sales)}</p>
        <p className="text-[10px] text-violet-600">
          {forecast.yoyBasedOn > 0
            ? `${forecast.recentBasedOn} setm. recents + ${forecast.yoyBasedOn} setm. any passat`
            : `mitjana últims ${forecast.recentBasedOn} mateix dia`}
          {forecast.tempFactor !== 1 && (
            <>
              {" "}·{" "}
              <span className={forecast.tempFactor > 1 ? "font-semibold text-amber-600" : "font-semibold text-sky-600"}>
                {forecast.tempFactor > 1 ? "+" : ""}
                {((forecast.tempFactor - 1) * 100).toFixed(0)}% per temperatura
              </span>
            </>
          )}
        </p>
        {forecast.yoyBaseline !== null && Math.abs(forecast.yoyGrowthFactor - 1) > 0.02 && (
          <p className="text-[10px] text-violet-500">
            Creixement vs any passat:{" "}
            <span className={forecast.yoyGrowthFactor > 1 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              {forecast.yoyGrowthFactor > 1 ? "+" : ""}
              {((forecast.yoyGrowthFactor - 1) * 100).toFixed(0)}%
            </span>
          </p>
        )}
        {forecast.tomorrowTempMax !== null && (
          <p className="text-[10px] text-violet-500">
            Demà {forecast.tomorrowTempMax.toFixed(0)}°C
            {forecast.avgHistoricalTempMax !== null && (
              <> vs mitjana {forecast.avgHistoricalTempMax.toFixed(0)}°C</>
            )}
          </p>
        )}
        <p className="mt-1 text-[10px] font-medium text-violet-700">
          → planifica ~{suggestedHours}h de personal
        </p>
      </div>
    </div>
  );
}

/** Breaks down today's delta vs last week into "traffic" and "ticket" parts. */
function DriversBlock({
  drivers,
}: {
  drivers: NonNullable<import("@/lib/types").DailyDigest["driversVsLastWeek"]>;
}) {
  const totalUp = drivers.totalDeltaEur >= 0;
  const reasonText =
    drivers.dominantDriver === "volume"
      ? drivers.volumeEffect > 0
        ? "per més clients (trànsit)"
        : "per menys clients (trànsit)"
      : drivers.dominantDriver === "price"
        ? drivers.priceEffect > 0
          ? "per un tiquet mitjà més alt"
          : "per un tiquet mitjà més baix"
        : "mix de trànsit i tiquet";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 text-[12px]">
      <span className="font-semibold text-slate-700">
        {totalUp ? "↑" : "↓"} {totalUp ? "+" : ""}
        {euro(drivers.totalDeltaEur)} vs setmana passada
      </span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-600">{reasonText}</span>
      <span className="ml-auto flex gap-3 text-[11px] text-slate-500">
        <span>
          Trànsit: <span className={drivers.volumeEffect >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{drivers.volumeEffect >= 0 ? "+" : ""}{euro(drivers.volumeEffect)}</span>
        </span>
        <span>
          Tiquet: <span className={drivers.priceEffect >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{drivers.priceEffect >= 0 ? "+" : ""}{euro(drivers.priceEffect)}</span>
        </span>
      </span>
    </div>
  );
}

/** "Del període" — period-wide KPIs that used to live inside the digest but
 * belong to the selected filter range, not to "today". */
function PeriodMetrics({
  foodCostPct,
  laborPct,
  bestHourLabel,
  productCostCoverage,
}: {
  foodCostPct: number;
  laborPct: number;
  bestHourLabel: string;
  productCostCoverage: number;
}) {
  const coverageOk = productCostCoverage >= 0.8;
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <DigestCard
        label="Food cost"
        value={`${foodCostPct.toFixed(1)}%`}
        target={35}
        currentForTarget={foodCostPct}
        lowerIsBetter={true}
        warning={
          coverageOk
            ? undefined
            : `Dada incompleta: només ${(productCostCoverage * 100).toFixed(0)}% de productes amb cost registrat`
        }
      />
      <DigestCard
        label="Labor cost"
        value={`${laborPct.toFixed(1)}%`}
        target={30}
        currentForTarget={laborPct}
        lowerIsBetter={true}
      />
      <DigestCard
        label="Hora pic"
        value={bestHourLabel || "--"}
        hint="del període"
      />
    </section>
  );
}

function YoyRow({
  label,
  helper,
  date,
  sales,
  deltaPct,
  weather,
  calendar,
  todayWeather,
  todayCalendar,
}: {
  label: string;
  helper: string;
  date: string;
  sales: number;
  deltaPct: number;
  weather: import("@/lib/types").HistoricalWeather | null;
  calendar: import("@/lib/types").DailyCalendarNote | null;
  todayWeather: import("@/lib/types").HistoricalWeather | null;
  todayCalendar: import("@/lib/types").DailyCalendarNote | null;
}) {
  const isUp = deltaPct >= 0;
  // Flag when today and the compared date are in different calendar contexts
  // (e.g. one is Setmana Santa, the other isn't). This is the signal that
  // makes the YoY delta misleading — when mismatched, we hide the big %
  // pill so the owner doesn't read a huge red number as a real drop.
  const calendarMismatch =
    (calendar?.label ?? null) !== (todayCalendar?.label ?? null) &&
    (calendar || todayCalendar);
  return (
    <div className="rounded-xl border border-[var(--line)] bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-[11px] text-slate-400">{helper}</p>
        </div>
        {calendarMismatch ? (
          <span className="inline-flex items-center rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            no comparable
          </span>
        ) : (
          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[12px] font-bold ${isUp ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {isUp ? "+" : ""}{deltaPct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-slate-600">
        <span className="text-slate-400">{formatShortDate(date)}:</span>{" "}
        <span className="font-semibold text-slate-800">{euro(sales)}</span>
        {weather && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span>{weatherEmoji(weather.weatherCode)}</span>
            <span>{weather.tempMax.toFixed(0)}°</span>
            {weather.precipitationMm > 0.5 && (
              <span className="font-semibold text-sky-700">💧 {weather.precipitationMm.toFixed(0)}mm</span>
            )}
          </span>
        )}
        {calendar?.label && (
          <span className="ml-2 inline-block rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
            {calendar.label}
          </span>
        )}
      </p>
      {calendarMismatch && (
        <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          ⚠️ context diferent: {calendar?.label ? `llavors era ${calendar.label}` : "llavors dia normal"}
          {todayCalendar?.label ? `, avui ${todayCalendar.label}` : ", avui dia normal"}. El delta no és directament comparable.
        </p>
      )}
      {weather && todayWeather && (
        <p className="mt-1 text-[10px] text-slate-400">
          avui: {weatherEmoji(todayWeather.weatherCode)} {todayWeather.tempMax.toFixed(0)}°
          {todayWeather.precipitationMm > 0.5 && ` · 💧${todayWeather.precipitationMm.toFixed(0)}mm`}
          {todayCalendar?.label && ` · ${todayCalendar.label}`}
          {Math.abs(todayWeather.tempMax - weather.tempMax) >= 2 && (
            <>
              {" · "}
              <span className="text-slate-500">
                {todayWeather.tempMax > weather.tempMax ? "més calor" : "més fred"} ({Math.abs(todayWeather.tempMax - weather.tempMax).toFixed(0)}° dif.)
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** WMO weather codes → emoji (copied from vendes-day-list for consistency). */
function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "❄️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌤️";
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ca-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function FamilyMovements({ movements }: { movements: import("@/lib/types").FamilyMovement[] }) {
  // Pick top 3 winners (highest +€) and top 3 losers (most negative €). Both
  // lists are derived from the same array which is already sorted desc by €
  // delta in computeFamilyMovements.
  const winners = movements.filter((m) => m.deltaEur > 0).slice(0, 3);
  const losers = [...movements].filter((m) => m.deltaEur < 0).sort((a, b) => a.deltaEur - b.deltaEur).slice(0, 3);

  if (winners.length === 0 && losers.length === 0) return null;

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <FamilyMovementCard
        title="Famílies que creixen"
        description="vs període anterior de la mateixa durada"
        items={winners}
        positive
      />
      <FamilyMovementCard
        title="Famílies que cauen"
        description="vs període anterior de la mateixa durada"
        items={losers}
      />
    </section>
  );
}

function FamilyMovementCard({
  title,
  description,
  items,
  positive,
}: {
  title: string;
  description: string;
  items: import("@/lib/types").FamilyMovement[];
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {positive ? (
          <ArrowUpRight className="size-5 text-emerald-600" />
        ) : (
          <ArrowDownRight className="size-5 text-rose-600" />
        )}
        <div>
          <p className="text-[18px] font-bold tracking-tight text-slate-900">{title}</p>
          <p className="text-[12px] text-slate-500">{description}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-3 text-center text-[13px] text-slate-400">
          Cap família amb canvi significatiu
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((m) => {
            const sign = m.deltaEur > 0 ? "+" : "";
            const pctSign = m.deltaPct > 0 ? "+" : "";
            const tone = positive ? "text-emerald-700" : "text-rose-700";
            const bg = positive ? "bg-emerald-50" : "bg-rose-50";
            return (
              <div key={m.family} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-slate-50/50 p-3">
                <span className={`size-3 rounded-full shrink-0 ${m.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-slate-800 truncate">{m.family}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {euro(m.previousSales)} → {euro(m.currentSales)}
                      </span>
                      <span className={`rounded-lg ${bg} px-2 py-0.5 text-[12px] font-semibold ${tone}`}>
                        {sign}{euro(m.deltaEur)}
                      </span>
                      <span className={`text-[12px] font-semibold ${tone}`}>
                        {pctSign}{m.deltaPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
  warning,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  target?: number;
  currentForTarget?: number;
  lowerIsBetter?: boolean;
  hint?: string;
  /** If set, the card renders in amber with this text instead of marking
   * "good" or "bad" based on target. Used when the underlying data is
   * unreliable (e.g. food cost with low product-cost coverage). */
  warning?: string;
}) {
  let status: "good" | "bad" | "flat" | "warn" = "flat";
  if (warning) {
    status = "warn";
  } else if (target !== undefined && currentForTarget !== undefined) {
    const meets = lowerIsBetter ? currentForTarget <= target : currentForTarget >= target;
    status = meets ? "good" : "bad";
  } else if (delta !== undefined) {
    status = Math.abs(delta) < 0.5 ? "flat" : delta >= 0 ? "good" : "bad";
  }

  const ringColor =
    status === "good" ? "ring-emerald-200 bg-emerald-50/50"
    : status === "bad" ? "ring-rose-200 bg-rose-50/50"
    : status === "warn" ? "ring-amber-200 bg-amber-50/50"
    : "ring-slate-200 bg-white";
  const valueColor =
    status === "good" ? "text-emerald-700"
    : status === "bad" ? "text-rose-700"
    : status === "warn" ? "text-amber-700"
    : "text-slate-900";

  return (
    <div className={`rounded-xl ring-1 ${ringColor} p-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-[20px] font-bold tracking-tight ${valueColor}`}>{value}</p>
      {warning ? (
        <p className="mt-0.5 text-[11px] font-medium text-amber-700">⚠️ {warning}</p>
      ) : (
        <>
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
        </>
      )}
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
