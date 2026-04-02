import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { VendesDayList } from "@/components/vendes-day-list";
import { VendesSummary } from "@/components/vendes-summary";
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

  const { dayStatuses, productSales, hourlySales, hourlyProductSales, productCosts, employeeShifts, employees, topProducts, totals, filter } = workspace;

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

      {/* Product & category summary for the period */}
      {productSales.length > 0 && (
        <VendesSummary productSales={productSales} topProducts={topProducts} productCosts={productCosts} />
      )}

      {/* Day-by-day list */}
      <VendesDayList
        dayStatuses={dayStatuses}
        productSales={productSales}
        hourlySales={hourlySales}
        hourlyProductSales={hourlyProductSales}
        productCosts={productCosts}
        employeeShifts={employeeShifts}
        employees={employees}
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
