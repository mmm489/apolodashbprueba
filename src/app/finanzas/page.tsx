import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { ProductFilterBar } from "@/components/product-filter-bar";
import { SectionCard } from "@/components/section-card";
import { getFinancialWorkspace } from "@/lib/analytics";

export default async function FinanzasPage({
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
  const productQuery = firstValue(params?.product)?.toLowerCase().trim() ?? "";
  const filteredProducts = workspace.topProducts.filter((item) => item.productName.toLowerCase().includes(productQuery));

  return (
    <AppFrame
      title="Finanzas y contabilidad"
      description="Vista centrada en ventas, facturas, nominas y productos para trabajar con criterio financiero."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />
      <ProductFilterBar product={productQuery} />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Ventas del periodo" eyebrow="Ingresos" description="Detalle diario de ventas registradas.">
          <div className="space-y-2">
            {workspace.salesReports.map((report) => (
              <div key={report.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800">{report.businessDate}</p>
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700">
                    {euro(report.totalSales)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  {report.orderCount} pedidos | ticket medio {euro(report.averageTicket)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Facturas de proveedores" eyebrow="Gasto" description="Control de facturas contabilizadas por proveedor y categoria.">
          <div className="space-y-2">
            {workspace.invoices.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800">{invoice.supplierName}</p>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700">
                    {euro(invoice.totalAmount)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  {invoice.issueDate} | {invoice.category.replaceAll("_", " ")}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Nominas" eyebrow="Laboral" description="Resumen del coste laboral cargado en el periodo.">
          <div className="space-y-2">
            {workspace.payrolls.map((payroll) => (
              <div key={payroll.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800">{payroll.employeeName}</p>
                  <span className="text-[13px] font-semibold text-slate-700">{euro(payroll.grossAmount)}</span>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  Periodo {payroll.payPeriod} | neto {euro(payroll.netAmount)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Lectura contable" eyebrow="Margen" description="Lectura sintetica del resultado economico dentro del rango activo.">
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="Ventas" value={euro(workspace.snapshot.kpis.totalSales)} color="emerald" />
            <Metric label="Gastos" value={euro(workspace.snapshot.kpis.totalExpenses)} color="rose" />
            <Metric label="Nominas" value={euro(workspace.snapshot.kpis.totalPayroll)} color="amber" />
            <Metric label="Margen estimado" value={euro(workspace.snapshot.kpis.estimatedMargin)} color="indigo" />
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Productos mas vendidos" eyebrow="Articulos" description="Ranking por unidades e importe a partir de los informes Articles Venda.">
          <div className="space-y-2">
            {filteredProducts.slice(0, 12).map((product) => (
              <div key={product.productName} className="rounded-xl border border-[var(--line)] bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800">{product.productName}</p>
                  <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[12px] font-semibold text-indigo-700">{product.units} uds</span>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-500">Importe acumulado {euro(product.amount)}</p>
              </div>
            ))}
            {!filteredProducts.length ? <p className="text-sm text-slate-500">No hay productos que coincidan con ese filtro.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Analisis de producto" eyebrow="Insight" description="Lectura rapida para identificar referencias fuertes del periodo seleccionado.">
          {filteredProducts[0] ? (
            <div className="space-y-4">
              <Metric label="Producto lider" value={filteredProducts[0].productName} color="emerald" />
              <Metric label="Unidades top" value={`${filteredProducts[0].units} uds`} color="indigo" />
              <Metric label="Importe top" value={euro(filteredProducts[0].amount)} color="amber" />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sube un Excel de Articles Venda y filtra por producto para ver detalle.</p>
          )}
        </SectionCard>
      </section>
    </AppFrame>
  );
}

const metricColors: Record<string, string> = {
  emerald: "border-l-emerald-500",
  rose: "border-l-rose-500",
  amber: "border-l-amber-500",
  indigo: "border-l-indigo-500",
};

function Metric({ label, value, color = "indigo" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${metricColors[color] ?? metricColors.indigo} bg-white p-4 transition hover:shadow-sm`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
