import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { SectionCard } from "@/components/section-card";
import { UploadPanel } from "@/components/upload-panel";
import { VentasTabs } from "@/components/ventas-tabs";
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

  const selectedDate = firstValue(params?.date);
  const { salesReports, productSales, totals, filter } = workspace;

  return (
    <AppFrame
      title="Vendes"
      description="Control diari de vendes, desglossament per producte i carrega d'informes."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total vendes" value={euro(totals.totalSales)} color="emerald" />
        <Metric label="Total comandes" value={fmtNum(totals.totalOrders)} color="indigo" />
        <Metric label="Tiquet mitja" value={euro(totals.averageTicket)} color="amber" />
        <Metric label="Dies amb dades" value={String(totals.daysWithData)} color="slate" />
      </section>

      {/* Upload */}
      <SectionCard title="Carregar informe de vendes" eyebrow="Carrega" description="Puja l'Excel diari de vendes (format .xls o .xlsx).">
        <UploadPanel />
      </SectionCard>

      {/* Tabbed content */}
      <VentasTabs
        salesReports={salesReports}
        productSales={productSales}
        selectedDate={selectedDate}
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
