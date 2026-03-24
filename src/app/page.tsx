import { ArrowRightLeft, Banknote, ReceiptText, TrendingUp } from "lucide-react";

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
      description="Vista general del negocio con metricas clave, tendencias y desglose financiero."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />

      {/* KPI cards */}
      <section className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStatCard
          icon={<ReceiptText className="size-4" />}
          label="Total documentos"
          value={String(workspace.snapshot.documentOverview.totalDocuments)}
          delta={`${workspace.snapshot.documentOverview.validatedDocuments} validados`}
          color="indigo"
        />
        <MiniStatCard
          icon={<TrendingUp className="size-4" />}
          label="Total ventas"
          value={euro(workspace.snapshot.kpis.totalSales)}
          delta="+ 2,5%"
          positive
          color="emerald"
        />
        <MiniStatCard
          icon={<Banknote className="size-4" />}
          label="Total gastos"
          value={euro(workspace.snapshot.kpis.totalExpenses)}
          delta="- 0,4%"
          color="amber"
        />
        <MiniStatCard
          icon={<ArrowRightLeft className="size-4" />}
          label="Descuadre banco"
          value={euro(workspace.snapshot.kpis.bankGap)}
          delta="Revisar"
          color="rose"
        />
      </section>

      {/* Sales chart */}
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <SalesBars items={salesBarItems} />
      </section>

      {/* Bottom grid */}
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Gasto por categoria</p>
          </div>
          <DonutBreakdown items={workspace.totalsByCategory} />
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[20px] font-bold tracking-tight text-slate-900">Resumen financiero</p>
          </div>
          <div className="stagger-children space-y-2">
            <FinanceRow label="Ventas" value={euro(workspace.snapshot.kpis.totalSales)} percent="19%" color="#6366f1" />
            <FinanceRow label="Margen estimado" value={euro(workspace.snapshot.kpis.estimatedMargin)} percent="15%" color="#8b5cf6" />
            <FinanceRow label="Nominas" value={euro(workspace.snapshot.kpis.totalPayroll)} percent="13%" color="#ec4899" />
            <FinanceRow label="Entradas banco" value={euro(workspace.cashFlowSummary.inflows)} percent="12%" color="#06b6d4" />
            <FinanceRow label="Salidas banco" value={euro(workspace.cashFlowSummary.outflows)} percent="11%" color="#10b981" />
            <FinanceRow label="Ticket medio" value={euro(workspace.snapshot.kpis.averageTicket)} percent="10%" color="#f59e0b" />
            <FinanceRow label="Proveedores" value={String(workspace.snapshot.kpis.activeSuppliers)} percent="9%" color="#ef4444" />
          </div>

          {/* Highlight card */}
          <div className="mt-5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 p-5 text-white">
            <p className="text-[13px] font-medium text-indigo-200">Foco de control</p>
            <p className="mt-2 text-lg font-semibold leading-snug">
              La diferencia entre ventas y cobros bancarios es {euro(workspace.snapshot.kpis.bankGap)}.
            </p>
          </div>
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
