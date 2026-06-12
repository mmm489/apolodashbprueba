import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listCashClosings } from "@/lib/repositories";
import { formatDashboardDateTime } from "@/lib/timezone";
import type { CashClosingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CierresPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveDateFilter({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });
  const closings = await listCashClosings(filter.from, filter.to);

  const totals = closings.reduce(
    (acc, closing) => {
      acc.sales += closing.totalSales;
      acc.cash += closing.totalCash;
      acc.card += closing.totalCard;
      acc.tickets += closing.ticketCount;
      acc.cancelled += closing.cancelledCount;
      return acc;
    },
    { sales: 0, cash: 0, card: 0, tickets: 0, cancelled: 0 },
  );

  return (
    <AppFrame
      title="Tancaments Z"
      description="Lectura historica dels tancaments fiscals guardats pel POS."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total vendes" value={euro(totals.sales)} />
        <Metric label="Efectiu" value={euro(totals.cash)} />
        <Metric label="Targeta" value={euro(totals.card)} />
        <Metric label="Tiquets" value={String(totals.tickets)} />
        <Metric label="Anul.lats" value={String(totals.cancelled)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-[15px] font-semibold text-slate-900">Historial de tancaments</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Dades en mode lectura: aquest dashboard no pot crear ni modificar tancaments.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50/80 text-[12px] font-medium uppercase tracking-wider text-slate-500">
                <Th>Z</Th>
                <Th>Tancat</Th>
                <Th>Empleat</Th>
                <Th align="right">Vendes</Th>
                <Th align="right">Efectiu</Th>
                <Th align="right">Targeta</Th>
                <Th align="right">Tiquets</Th>
                <Th>Factures</Th>
              </tr>
            </thead>
            <tbody>
              {closings.map((closing) => (
                <ClosingRow key={closing.id} closing={closing} />
              ))}
              {closings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    No hi ha tancaments Z en aquest periode.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppFrame>
  );
}

function ClosingRow({ closing }: { closing: CashClosingRecord }) {
  return (
    <tr className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/80">
      <Td>
        <div className="font-semibold text-slate-900">{closing.zLabel}</div>
        {closing.zNumber != null && (
          <div className="text-[11px] text-slate-400">#{closing.zNumber}</div>
        )}
      </Td>
      <Td>
        <div className="text-slate-700">{formatDateTime(closing.closedAt)}</div>
        <div className="text-[11px] text-slate-400">Obert: {formatDateTime(closing.openedAt)}</div>
      </Td>
      <Td>{closing.employeeName ?? "--"}</Td>
      <Td align="right" className="font-semibold text-emerald-700">{euro(closing.totalSales)}</Td>
      <Td align="right">{euro(closing.totalCash)}</Td>
      <Td align="right">{euro(closing.totalCard)}</Td>
      <Td align="right">
        <div>{closing.ticketCount}</div>
        {closing.cancelledCount > 0 && (
          <div className="text-[11px] text-rose-500">{closing.cancelledCount} anul.lats</div>
        )}
      </Td>
      <Td>
        <div className="text-[12px] text-slate-600">{closing.firstInvoice ?? "--"}</div>
        <div className="text-[12px] text-slate-400">{closing.lastInvoice ?? "--"}</div>
      </Td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th className={`px-5 py-3 ${align === "right" ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, align, className = "" }: { children: React.ReactNode; align?: "right"; className?: string }) {
  return <td className={`px-5 py-3 text-slate-600 ${align === "right" ? "text-right" : ""} ${className}`}>{children}</td>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function euro(value: number) {
  return new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatDateTime(value: string) {
  return formatDashboardDateTime(value, "ca-ES");
}
