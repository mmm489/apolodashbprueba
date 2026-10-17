import { formatDashboardDateTime } from "@/lib/timezone";
import type { CashClosingRecord } from "@/lib/types";

export function CashClosingsReport({ closings }: { closings: CashClosingRecord[] }) {
  const totals = closings.reduce((acc, closing) => ({
    sales: acc.sales + closing.totalSales,
    cash: acc.cash + closing.totalCash,
    card: acc.card + closing.totalCard,
    tickets: acc.tickets + closing.ticketCount,
    cancelled: acc.cancelled + closing.cancelledCount,
    reconciled: acc.reconciled + closing.reconciliation.totalSales,
    difference: acc.difference + closing.reconciliation.difference,
    mismatches: acc.mismatches + Number(closing.reconciliation.hasDifference),
  }), { sales: 0, cash: 0, card: 0, tickets: 0, cancelled: 0, reconciled: 0, difference: 0, mismatches: 0 });

  return <>
    <section className="min-w-0 grid gap-3 grid-cols-2 xl:grid-cols-5">
      <Metric label="Vendes guardades al Z" value={euro(totals.sales)} />
      <Metric label="Efectiu" value={euro(totals.cash)} />
      <Metric label="Targeta" value={euro(totals.card)} />
      <Metric label="Tiquets del Z" value={String(totals.tickets)} />
      <Metric label="Anul.lats" value={String(totals.cancelled)} />
    </section>

    <section aria-label="Conciliacio de tancaments" className="min-w-0 border-y border-[var(--line)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900">Conciliacio del periode</h2>
        <span className={`text-xs font-medium ${totals.mismatches ? "text-amber-800" : "text-emerald-700"}`}>
          {totals.mismatches ? `${totals.mismatches} tancaments amb diferencies` : "Sense diferencies"}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Amount label="Z originals" value={euro(totals.sales)} />
        <Amount label="Comandes netes del mateix interval" value={euro(totals.reconciled)} />
        <Amount label="Diferencia amb els Z" value={signedEuro(totals.difference)} warning={totals.mismatches > 0} />
      </dl>
    </section>

    <section className="min-w-0 border-y border-[var(--line)] bg-white">
      <h2 className="border-b border-[var(--line)] px-4 py-4 text-[15px] font-semibold text-slate-900">Historial de tancaments</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] bg-slate-50 text-xs text-slate-500">
            <Th>Z</Th><Th>Tancat</Th><Th>Empleat</Th><Th right>Vendes Z</Th>
            <Th right>Comandes netes</Th><Th right>Diferencia</Th><Th right>Efectiu Z</Th>
            <Th right>Targeta Z</Th><Th right>Tiquets Z</Th><Th>Factures del Z</Th>
          </tr></thead>
          <tbody>
            {closings.map(closing => <ClosingRow key={closing.id} closing={closing} />)}
            {closings.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No hi ha tancaments Z en aquest periode.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}

function ClosingRow({ closing: c }: { closing: CashClosingRecord }) {
  const r = c.reconciliation;
  return <tr className={`border-b border-[var(--line)] align-top last:border-0 ${r.hasDifference ? "bg-amber-50/40" : "hover:bg-slate-50"}`}>
    <Td><div className="whitespace-nowrap font-semibold text-slate-900">{c.zLabel}</div></Td>
    <Td><div>{formatDashboardDateTime(c.closedAt, "ca-ES")}</div><div className="text-xs text-slate-500">Obert: {formatDashboardDateTime(c.openedAt, "ca-ES")}</div></Td>
    <Td>{c.employeeName ?? "--"}</Td>
    <Td right><strong className="text-emerald-700">{euro(c.totalSales)}</strong></Td>
    <Td right><div>{euro(r.totalSales)}</div><div className="text-xs text-slate-500">{r.ticketCount} tiquets</div></Td>
    <Td right>
      {r.hasDifference ? <details className="min-w-32 text-amber-900">
        <summary className="cursor-pointer whitespace-nowrap font-semibold" aria-label={`Detall de diferencies ${c.zLabel}`}>{signedEuro(r.difference)}</summary>
        <dl className="mt-2 space-y-1 text-xs">
          <div><dt className="inline">Efectiu: </dt><dd className="inline">{signedEuro(r.cashDifference)}</dd></div>
          <div><dt className="inline">Targeta: </dt><dd className="inline">{signedEuro(r.cardDifference)}</dd></div>
          <div><dt className="inline">Tiquets: </dt><dd className="inline">{r.ticketDifference > 0 ? "+" : ""}{r.ticketDifference}</dd></div>
        </dl>
      </details> : <span className="text-xs text-emerald-700">Coincideix</span>}
    </Td>
    <Td right>{euro(c.totalCash)}</Td><Td right>{euro(c.totalCard)}</Td>
    <Td right><div>{c.ticketCount}</div>{c.cancelledCount > 0 && <div className="text-xs text-rose-600">{c.cancelledCount} anul.lats</div>}</Td>
    <Td><div className="whitespace-nowrap text-xs">{c.firstInvoice ?? "--"}</div><div className="whitespace-nowrap text-xs text-slate-500">{c.lastInvoice ?? "--"}</div></Td>
  </tr>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-[var(--line)] bg-white p-4">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-2 break-words text-xl font-bold text-slate-900">{value}</p>
  </div>;
}

function Amount({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 break-words text-lg font-semibold ${warning ? "text-amber-900" : "text-slate-900"}`}>{value}</dd></div>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 text-slate-600 ${right ? "text-right" : ""}`}>{children}</td>;
}

function euro(value: number) {
  return new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" }).format(value);
}

function signedEuro(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${euro(rounded === 0 ? 0 : rounded)}`;
}
