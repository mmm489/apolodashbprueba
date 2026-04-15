import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { ExpenseFilterBar } from "@/components/expense-filter-bar";
import { GastosTabs } from "@/components/gastos-tabs";
import { SectionCard } from "@/components/section-card";
import { UploadPanel } from "@/components/upload-panel";
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

      {/* Upload */}
      <SectionCard title="Pujar factura" eyebrow="Carrega" description="Puja factures en PDF o imatge (JPG, PNG) per processar-les.">
        <UploadPanel />
      </SectionCard>

      {/* Tabbed content */}
      <GastosTabs
        rows={rows}
        invoices={invoices}
        products={products}
        totals={{ totalGross: totals.totalGross, totalVat: totals.totalVat }}
      />

      {/* Supplier analysis + category breakdown */}
      {rows.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <SupplierAnalysis invoices={invoices} totalGross={totals.totalGross} />

          <SectionCard title="Per categoria" eyebrow="Desglossament" description="Despesa agrupada per tipus de despesa.">
            <div className="space-y-2">
              {groupByField(rows, "category").map(([name, amount]) => {
                const pct = totals.totalGross > 0 ? (amount / totals.totalGross) * 100 : 0;
                return (
                  <div key={name} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-slate-800">{name.replaceAll("_", " ")}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{pct.toFixed(1)}%</span>
                        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700">{euro(amount)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </section>
      ) : null}
    </AppFrame>
  );
}

/* ---------- Supplier analysis ---------- */

function SupplierAnalysis({
  invoices,
  totalGross,
}: {
  invoices: Array<{ id: string; supplierName: string; totalAmount: number; issueDate: string }>;
  totalGross: number;
}) {
  // Aggregate per supplier
  type SupplierAgg = { name: string; total: number; count: number; lastDate: string };
  const map = new Map<string, SupplierAgg>();
  for (const inv of invoices) {
    const existing = map.get(inv.supplierName);
    if (existing) {
      existing.total += inv.totalAmount;
      existing.count += 1;
      if (inv.issueDate > existing.lastDate) existing.lastDate = inv.issueDate;
    } else {
      map.set(inv.supplierName, { name: inv.supplierName, total: inv.totalAmount, count: 1, lastDate: inv.issueDate });
    }
  }
  const ranked = [...map.values()].sort((a, b) => b.total - a.total);
  const top = ranked.slice(0, 12);
  const top3Pct = totalGross > 0
    ? (ranked.slice(0, 3).reduce((s, r) => s + r.total, 0) / totalGross) * 100
    : 0;
  const concentrationLabel = top3Pct >= 70 ? "alta" : top3Pct >= 50 ? "mitjana" : "baixa";
  const concentrationColor = top3Pct >= 70 ? "bg-rose-50 text-rose-700" : top3Pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  const max = top[0]?.total ?? 1;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-5 space-y-1">
        <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
          Anàlisi
        </span>
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold tracking-tight text-slate-900">Per proveïdor</h2>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${concentrationColor}`}>
            top-3 = {top3Pct.toFixed(0)}% · {concentrationLabel}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-500">
          {ranked.length} proveïdors actius en el període. Si la concentració del top-3 és alta, depens massa de pocs proveïdors.
        </p>
      </div>
      <div className="space-y-2">
        {top.map((s, i) => {
          const pct = totalGross > 0 ? (s.total / totalGross) * 100 : 0;
          const widthPct = max > 0 ? (s.total / max) * 100 : 0;
          const avg = s.count > 0 ? s.total / s.count : 0;
          return (
            <div key={s.name} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`flex size-6 items-center justify-center rounded-lg text-[11px] font-bold ${i < 3 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800 truncate">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">{s.count} fact.</span>
                      <span className="text-[11px] text-slate-400">mitja {euro(avg)}</span>
                      <span className="text-[11px] text-slate-400">{pct.toFixed(1)}%</span>
                      <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-700">{euro(s.total)}</span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-rose-400 transition-all" style={{ width: `${widthPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
