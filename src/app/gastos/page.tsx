import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { ExpenseFilterBar } from "@/components/expense-filter-bar";
import { GastosTabs } from "@/components/gastos-tabs";
import { SectionCard } from "@/components/section-card";
import { getExpensesWorkspace } from "@/lib/analytics";

export default async function GastosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspace = await getExpensesWorkspace({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
    supplier: firstValue(params?.supplier),
    product: firstValue(params?.product),
    category: firstValue(params?.category),
  });

  const { rows, invoices, products, totals, filter } = workspace;

  return (
    <AppFrame
      title="Despeses"
      description="Detall de despeses per factura, linia de producte, proveidor i categoria."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />
      <ExpenseFilterBar
        supplier={firstValue(params?.supplier) ?? ""}
        product={firstValue(params?.product) ?? ""}
        category={firstValue(params?.category) ?? ""}
        suppliers={workspace.suppliers}
        categories={workspace.categories}
      />

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total despeses" value={euro(totals.totalGross)} color="rose" />
        <Metric label="IVA acumulat" value={euro(totals.totalVat)} color="amber" />
        <Metric label="Factures" value={String(totals.invoiceCount)} color="indigo" />
        <Metric label="Productes unics" value={String(products.length)} color="slate" />
      </section>

      {/* Tabbed content */}
      <GastosTabs
        rows={rows}
        invoices={invoices}
        products={products}
        totals={{ totalGross: totals.totalGross, totalVat: totals.totalVat }}
      />

      {/* Breakdowns */}
      {rows.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Per proveidor" eyebrow="Desglossament" description="Despesa agrupada per proveidor.">
            <div className="space-y-2">
              {groupByField(rows, "supplierName").map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                  <p className="text-[13px] font-semibold text-slate-800">{name}</p>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700">{euro(amount)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Per categoria" eyebrow="Desglossament" description="Despesa agrupada per tipus de despesa.">
            <div className="space-y-2">
              {groupByField(rows, "category").map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                  <p className="text-[13px] font-semibold text-slate-800">{name.replaceAll("_", " ")}</p>
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[13px] font-semibold text-amber-700">{euro(amount)}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>
      ) : null}
    </AppFrame>
  );
}

/* ---------- helpers ---------- */

const metricColors: Record<string, string> = {
  rose: "border-l-rose-500",
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

function groupByField(rows: Array<{ supplierName: string; category: string; lineAmount: number }>, field: "supplierName" | "category") {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const key = row[field];
    map[key] = (map[key] ?? 0) + row.lineAmount;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
