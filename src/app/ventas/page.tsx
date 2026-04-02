import { formatISO, subDays } from "date-fns";
import { AlertTriangle } from "lucide-react";

import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { VendesDayList } from "@/components/vendes-day-list";
import { getSalesWorkspace } from "@/lib/analytics";

export default async function VentasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspace = await getSalesWorkspace({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });

  const { dayStatuses, productSales, hourlySales, totals, filter } = workspace;

  // Check if yesterday's data is missing
  const yesterday = formatISO(subDays(new Date(), 1), { representation: "date" });
  const yesterdayStatus = dayStatuses.find((d) => d.date === yesterday);
  const yesterdayMissing = yesterdayStatus && (!yesterdayStatus.hasArticles || !yesterdayStatus.hasHourly);
  const yesterdayLabel = new Date(yesterday).toLocaleDateString("ca-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <AppFrame
      title="Vendes"
      description="Control diari de vendes amb pujada d'informes per dia."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total vendes" value={euro(totals.totalSales)} color="emerald" />
        <Metric label="Total comandes" value={fmtNum(totals.totalOrders)} color="indigo" />
        <Metric label="Tiquet mitja" value={euro(totals.averageTicket)} color="amber" />
        <Metric label="Dies amb dades" value={String(totals.daysWithData)} color="slate" />
      </section>

      {/* Yesterday missing banner */}
      {yesterdayMissing && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[14px] font-semibold text-amber-900">
              Falten dades d&apos;ahir ({yesterdayLabel})
            </p>
            <p className="mt-0.5 text-[13px] text-amber-700">
              {!yesterdayStatus.hasArticles && !yesterdayStatus.hasHourly
                ? "Puja els fitxers d'Articles Venda i Resum Hores per completar el dia."
                : !yesterdayStatus.hasArticles
                  ? "Falta el fitxer d'Articles Venda."
                  : "Falta el fitxer de Resum Hores."}
            </p>
          </div>
        </div>
      )}

      {/* Day-by-day list */}
      <VendesDayList
        dayStatuses={dayStatuses}
        productSales={productSales}
        hourlySales={hourlySales}
      />
    </AppFrame>
  );
}

/* ---------- helpers ---------- */

const metricColors: Record<string, string> = {
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  indigo: "border-l-indigo-500",
  slate: "border-l-slate-400",
};

function Metric({ label, value, color = "indigo" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${metricColors[color] ?? metricColors.indigo} bg-white p-4 shadow-sm transition hover:shadow-md`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
