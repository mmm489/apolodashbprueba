import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { ExpenseFilterBar } from "@/components/expense-filter-bar";
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

  const { rows, totals, filter } = workspace;

  return (
    <AppFrame
      title="Gastos"
      description="Detalle de gastos por factura, linea de producto, proveedor y categoria."
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
        <Metric label="Total gastos" value={euro(totals.totalGross)} color="rose" />
        <Metric label="IVA acumulado" value={euro(totals.totalVat)} color="amber" />
        <Metric label="Facturas" value={String(totals.invoiceCount)} color="indigo" />
        <Metric label="Lineas" value={String(totals.lineCount)} color="slate" />
      </section>

      {/* Expense table */}
      <SectionCard title="Detalle de gastos" eyebrow="Lineas" description="Todas las lineas de factura en el periodo seleccionado." className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">
            No hay gastos registrados en este periodo. Sube facturas desde Documentos para verlas aqui.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <Th>Fecha</Th>
                  <Th>Proveedor</Th>
                  <Th>Descripcion</Th>
                  <Th align="right">Cant.</Th>
                  <Th align="right">P. Unit.</Th>
                  <Th align="right">Importe</Th>
                  <Th align="right">IVA %</Th>
                  <Th align="right">IVA</Th>
                  <Th>Categoria</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.invoiceId}-${i}`}
                    className="border-b border-[var(--line)] transition hover:bg-slate-50/80"
                  >
                    <Td>{formatDate(row.issueDate)}</Td>
                    <Td className="font-semibold text-slate-800">{row.supplierName}</Td>
                    <Td className="max-w-[240px] truncate" title={row.lineDescription}>{row.lineDescription}</Td>
                    <Td align="right">{row.quantity !== 1 ? fmtNum(row.quantity) : ""}</Td>
                    <Td align="right">{row.unitPrice > 0 ? euro(row.unitPrice) : ""}</Td>
                    <Td align="right" className="font-semibold text-slate-800">{euro(row.lineAmount)}</Td>
                    <Td align="right">{row.vatRate > 0 ? `${fmtNum(row.vatRate)}%` : ""}</Td>
                    <Td align="right">{row.vatAmount > 0 ? euro(row.vatAmount) : ""}</Td>
                    <Td>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {row.category.replaceAll("_", " ")}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                  <Td colSpan={5} className="font-semibold text-slate-600">Total</Td>
                  <Td align="right" className="font-bold text-slate-900">{euro(totals.totalGross)}</Td>
                  <Td />
                  <Td align="right" className="font-bold text-slate-900">{euro(totals.totalVat)}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Breakdown by supplier */}
      {rows.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Por proveedor" eyebrow="Desglose" description="Gasto agrupado por proveedor.">
            <div className="space-y-2">
              {groupByField(rows, "supplierName").map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white hover:shadow-sm">
                  <p className="text-[13px] font-semibold text-slate-800">{name}</p>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700">{euro(amount)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Por categoria" eyebrow="Desglose" description="Gasto agrupado por tipo de gasto.">
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

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`py-3 pr-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className, colSpan, title }: { children?: React.ReactNode; align?: "left" | "right"; className?: string; colSpan?: number; title?: string }) {
  return (
    <td colSpan={colSpan} title={title} className={`py-2.5 pr-3 text-[13px] text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
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
