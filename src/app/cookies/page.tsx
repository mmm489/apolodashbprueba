import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listCookiesTransactions } from "@/lib/repositories";
import { formatDashboardDate } from "@/lib/timezone";
import type { CookiesTransactionRecord } from "@/lib/types";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function CookiesPage({
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
  const transactions = await listCookiesTransactions(filter.from, filter.to);
  const activeTransactions = transactions.filter((item) => item.status !== "cancelled");
  const cancelledCount = transactions.length - activeTransactions.length;
  const totals = activeTransactions.reduce(
    (acc, item) => {
      acc.sales += item.total;
      acc.base += item.totalBase;
      acc.vat += item.totalVat;
      acc.tickets += 1;
      acc.items += item.itemCount;
      return acc;
    },
    { sales: 0, base: 0, vat: 0, tickets: 0, items: 0 },
  );
  const averageTicket = totals.tickets > 0 ? totals.sales / totals.tickets : 0;

  return (
    <AppFrame
      title="Cookies"
      description="Transaccions cobrades amb Cashlogy i separades de la comptabilitat de Hi Cream."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Vendes Cookies" value={euro(totals.sales)} color="amber" />
        <Metric label="Base s/IVA" value={euro(totals.base)} color="emerald" />
        <Metric label="IVA" value={euro(totals.vat)} color="slate" />
        <Metric label="Tiquets" value={fmtNum(totals.tickets)} color="indigo" />
        <Metric label="Tiquet mitja" value={euro(averageTicket)} color="violet" />
      </section>

      {cancelledCount > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          Hi ha {cancelledCount} transaccions Cookies anul.lades en aquest periode. Es mostren, pero no compten als totals.
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-[15px] font-semibold text-slate-900">Transaccions Cookies</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Aquest import es cobra en la mateixa Cashlogy, pero queda separat dels tancaments de Hi Cream.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50/80 text-[12px] font-medium uppercase tracking-wider text-slate-500">
                <Th>Hora</Th>
                <Th>Pedido</Th>
                <Th>Empleat</Th>
                <Th>Productes</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <CookiesRow key={transaction.id} transaction={transaction} />
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No hi ha transaccions Cookies en aquest periode.
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

function CookiesRow({ transaction }: { transaction: CookiesTransactionRecord }) {
  const cancelled = transaction.status === "cancelled";
  return (
    <tr className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/80">
      <Td>
        <div className="font-semibold text-slate-900">{transaction.orderTime}</div>
        <div className="text-[11px] text-slate-400">{formatDate(transaction.businessDate)}</div>
      </Td>
      <Td>
        <div className="font-semibold text-slate-900">#{transaction.orderNumber}</div>
        <div className="text-[11px] text-slate-400">{transaction.invoiceNumber ?? "--"}</div>
        {cancelled && (
          <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            Anul.lat
          </span>
        )}
      </Td>
      <Td>{transaction.employeeName ?? "--"}</Td>
      <Td>
        <div className="font-medium text-slate-800">{transaction.summary}</div>
        <div className="mt-2 space-y-1">
          {transaction.items.map((item, index) => (
            <div key={`${transaction.id}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[12px]">
              <span className="font-medium text-slate-700">
                {item.qty}x {item.productName}
              </span>
              <span className="text-slate-500">{euro(item.lineTotal)}</span>
            </div>
          ))}
        </div>
      </Td>
      <Td align="right" className={cancelled ? "font-bold text-rose-500 line-through" : "font-bold text-amber-700"}>
        {euro(transaction.total)}
      </Td>
    </tr>
  );
}

const metricColors: Record<string, string> = {
  amber: "border-l-amber-500",
  emerald: "border-l-emerald-500",
  indigo: "border-l-indigo-500",
  slate: "border-l-slate-400",
  violet: "border-l-violet-500",
};

function Metric({ label, value, color = "amber" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${metricColors[color] ?? metricColors.amber} bg-white p-4 shadow-sm transition hover:shadow-md`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`px-5 py-4 align-top ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return formatDashboardDate(value, "ca-ES", { day: "2-digit", month: "short" });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
