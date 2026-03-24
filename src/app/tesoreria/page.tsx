import { ArrowDownRight, ArrowUpRight, GitCompareArrows } from "lucide-react";

import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { SectionCard } from "@/components/section-card";
import { getFinancialWorkspace } from "@/lib/analytics";

export default async function TesoreriaPage({
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

  return (
    <AppFrame
      title="Tesoreria y banco"
      description="Seguimiento de entradas, salidas y diferencia entre caja de ventas y movimientos bancarios."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />

      <section className="stagger-children grid gap-4 md:grid-cols-3">
        <FlowCard
          icon={<ArrowDownRight className="size-4" />}
          label="Entradas banco"
          value={euro(workspace.cashFlowSummary.inflows)}
          color="emerald"
        />
        <FlowCard
          icon={<ArrowUpRight className="size-4" />}
          label="Salidas banco"
          value={euro(workspace.cashFlowSummary.outflows)}
          color="rose"
        />
        <FlowCard
          icon={<GitCompareArrows className="size-4" />}
          label="Flujo neto"
          value={euro(workspace.cashFlowSummary.net)}
          color="indigo"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Movimientos bancarios" eyebrow="Extractos" description="Detalle de entradas y salidas procesadas del banco.">
          <div className="stagger-children space-y-2">
            {workspace.bankTransactions.map((movement) => {
              const isInflow = movement.direction === "in";
              return (
                <div key={movement.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-800">{movement.concept}</p>
                    <span className={`rounded-lg px-2.5 py-1 text-[13px] font-semibold ${isInflow ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {isInflow ? "+" : ""}{euro(movement.amount)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-500">
                    {movement.bookedAt.slice(0, 10)} · {movement.direction} · {movement.category}
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Conciliacion basica" eyebrow="Control" description="Comparacion rapida entre ventas registradas y entradas bancarias.">
          <div className="stagger-children grid gap-3">
            <ReconcileCard label="Ventas registradas" value={euro(workspace.snapshot.kpis.totalSales)} color="emerald" />
            <ReconcileCard label="Cobros bancarios" value={euro(workspace.cashFlowSummary.inflows)} color="indigo" />
            <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
              <p className="text-[12px] font-medium text-slate-400">Diferencia</p>
              <p className="mt-2 text-[28px] font-bold tracking-tight">{euro(workspace.snapshot.kpis.bankGap)}</p>
            </div>
          </div>
        </SectionCard>
      </section>
    </AppFrame>
  );
}

const flowColors: Record<string, { bg: string; icon: string }> = {
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
  rose: { bg: "bg-rose-50", icon: "text-rose-600" },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600" },
};

function FlowCard({
  icon,
  label,
  value,
  color = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  const c = flowColors[color] ?? flowColors.indigo;
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${c.bg} ${c.icon}`}>{icon}</span>
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

const reconcileColors: Record<string, string> = {
  emerald: "border-l-emerald-500",
  indigo: "border-l-indigo-500",
};

function ReconcileCard({ label, value, color = "indigo" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${reconcileColors[color] ?? reconcileColors.indigo} bg-white p-5 transition hover:shadow-sm`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[24px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
