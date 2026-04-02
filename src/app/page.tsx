import { Banknote, Clock, Package, TrendingUp, Users } from "lucide-react";

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

  const salesBarItems = workspace.salesReports.slice(0, 10).map((report) => ({
    label: report.businessDate.slice(5),
    valueA: Math.max(0, report.totalSales - report.averageTicket * 8),
    valueB: report.totalSales,
  }));

  return (
    <AppFrame
      title="Dashboard"
      description="Vista general del negoci amb metriques clau, tendencies i desglossament financer."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />

      {/* KPI cards */}
      <section className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStatCard
          icon={<TrendingUp className="size-4" />}
          label="Total vendes"
          value={euro(workspace.snapshot.kpis.totalSales)}
          delta="Periode seleccionat"
          positive
          color="emerald"
        />
        <MiniStatCard
          icon={<Banknote className="size-4" />}
          label="Total despeses"
          value={euro(workspace.snapshot.kpis.totalExpenses)}
          delta="Proveidors + banc"
          color="amber"
        />
        <MiniStatCard
          icon={<Package className="size-4" />}
          label="Cost productes"
          value={euro(workspace.snapshot.kpis.totalProductCost)}
          delta="Cost materia venuda"
          color="rose"
        />
        <MiniStatCard
          icon={<Users className="size-4" />}
          label="Cost empleats"
          value={euro(workspace.snapshot.kpis.totalEmployeeCost)}
          delta="Torns registrats"
          color="indigo"
        />
      </section>

      {/* Sales chart */}
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <SalesBars items={salesBarItems} />
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
                const isBest = h.hour === workspace.snapshot.kpis.bestHourLabel && h.sales > 0;
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
          {workspace.snapshot.kpis.bestHourLabel !== "--" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5">
              <Clock className="size-4 text-indigo-600" />
              <p className="text-[13px] text-indigo-800">
                <span className="font-semibold">Millor franja:</span> {workspace.snapshot.kpis.bestHourLabel} amb {euro(workspace.snapshot.kpis.bestHourSales)} acumulats
              </p>
            </div>
          )}
        </section>
      )}

      {/* Bottom grid */}
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Despesa per categoria</p>
          </div>
          <DonutBreakdown items={workspace.totalsByCategory} />
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Resum financer</p>
          </div>
          <div className="stagger-children space-y-2">
            <FinanceRow label="Vendes" value={euro(workspace.snapshot.kpis.totalSales)} percent="" color="#6366f1" />
            <FinanceRow label="Cost productes" value={euro(workspace.snapshot.kpis.totalProductCost)} percent="" color="#f43f5e" />
            <FinanceRow label="Cost empleats" value={euro(workspace.snapshot.kpis.totalEmployeeCost)} percent="" color="#8b5cf6" />
            <FinanceRow label="Despeses" value={euro(workspace.snapshot.kpis.totalExpenses)} percent="" color="#f59e0b" />
            <FinanceRow label="Nomines" value={euro(workspace.snapshot.kpis.totalPayroll)} percent="" color="#ec4899" />
            <FinanceRow label="Tiquet mitja" value={euro(workspace.snapshot.kpis.averageTicket)} percent="" color="#06b6d4" />
            <FinanceRow label="Productivitat/hora" value={`${euro(workspace.snapshot.kpis.productivityPerHour)} /h`} percent={`${workspace.snapshot.kpis.totalMonthlyHours.toFixed(0)} h/mes`} color="#0ea5e9" />
          </div>

          {/* Highlight card — margin */}
          {(() => {
            const margin = workspace.snapshot.kpis.totalSales - workspace.snapshot.kpis.totalProductCost - workspace.snapshot.kpis.totalEmployeeCost;
            const isPositive = margin >= 0;
            return (
              <div className={`mt-5 rounded-xl p-5 text-white ${isPositive ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-rose-500 to-red-600"}`}>
                <p className="text-[13px] font-medium text-white/70">Marge brut (vendes - cost productes - cost empleats)</p>
                <p className="mt-2 text-[28px] font-bold tracking-tight">{euro(margin)}</p>
              </div>
            );
          })()}
        </div>
      </section>
    </AppFrame>
  );
}

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-500", text: "text-indigo-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-500", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", icon: "text-amber-500", text: "text-amber-600" },
  rose: { bg: "bg-rose-50", icon: "text-rose-500", text: "text-rose-600" },
};

function MiniStatCard({
  icon,
  label,
  value,
  delta,
  positive,
  color = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
  color?: string;
}) {
  const c = colorMap[color] ?? colorMap.indigo;

  return (
    <article className="group rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${c.bg} ${c.icon}`}>
          {icon}
        </span>
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-900">{value}</p>
      <p className={`mt-1 text-[13px] font-medium ${positive ? "text-emerald-600" : "text-slate-400"}`}>
        {delta}
      </p>
    </article>
  );
}

function FinanceRow({ label, value, percent, color }: { label: string; value: string; percent: string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/50 px-4 py-3 transition hover:bg-white hover:shadow-sm">
      <div className="flex items-center gap-3">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <p className="text-[13px] font-medium text-slate-700">{label}</p>
          <p className="text-[12px] text-slate-400">{value}</p>
        </div>
      </div>
      <span className="text-[13px] font-semibold text-slate-900">{percent}</span>
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Builds a full hour range from 9:00 to 3:00 (next day), merging existing data. */
function buildFullHourRange(data: Array<{ hour: string; sales: number }>) {
  // Generate slots: 9:00, 9:30, 10:00, ..., 23:30, 0:00, 0:30, 1:00, ..., 2:30, 3:00
  const slots: string[] = [];
  // 9:00 to 23:30
  for (let h = 9; h <= 23; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  // 0:00 to 3:00
  for (let h = 0; h <= 2; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  slots.push("3:00");

  const dataMap = new Map<string, number>();
  for (const d of data) {
    // Normalize "09:00" to "9:00" for matching
    const key = d.hour.replace(/^0/, "");
    dataMap.set(key, (dataMap.get(key) ?? 0) + d.sales);
  }

  return slots.map((slot) => ({
    hour: slot,
    sales: dataMap.get(slot) ?? 0,
  }));
}
