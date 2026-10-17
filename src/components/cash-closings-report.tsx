import { formatDashboardDateTime } from "@/lib/timezone";
import type { CashClosingRecord } from "@/lib/types";
import { effectiveCashClosing } from "@/lib/cash-closing-reconciliation";

export function CashClosingsReport({ closings }: { closings: CashClosingRecord[] }) {
  const totals = closings.reduce((acc, closing) => {
    const effective = effectiveCashClosing(closing);
    return ({
    sales: acc.sales + effective.totalSales,
    cash: acc.cash + effective.totalCash,
    card: acc.card + effective.totalCard,
    tickets: acc.tickets + effective.ticketCount,
    cancelled: acc.cancelled + closing.cancelledCount,
    reconciled: acc.reconciled + closing.reconciliation.totalSales,
    difference: acc.difference + effective.difference,
    mismatches: acc.mismatches + Number(effective.hasDifference),
    adjusted: acc.adjusted + Number(closing.adjustment?.sourceMatches === true),
  }); }, { sales: 0, cash: 0, card: 0, tickets: 0, cancelled: 0, reconciled: 0, difference: 0, mismatches: 0, adjusted: 0 });

  return <>
    <section className="min-w-0 grid gap-3 grid-cols-2 xl:grid-cols-5">
      <Metric label="Vendes dels tancaments" value={euro(totals.sales)} />
      <Metric label="Efectiu" value={euro(totals.cash)} />
      <Metric label="Targeta" value={euro(totals.card)} />
      <Metric label="Tiquets" value={String(totals.tickets)} />
      <Metric label="Anul.lats" value={String(totals.cancelled)} />
    </section>

    <section aria-label="Conciliacio de tancaments" className="min-w-0 border-y border-[var(--line)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900">Conciliacio del periode</h2>
        <span className={`text-xs font-medium ${totals.mismatches ? "text-amber-800" : "text-emerald-700"}`}>
          {totals.mismatches ? `${totals.mismatches} ${totals.mismatches === 1 ? "tancament pendent" : "tancaments pendents"} de revisar` : "Tots els tancaments quadren"}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Amount label="Tancaments conciliats amb ajust" value={String(totals.adjusted)} />
        <Amount label="Comandes netes del mateix interval" value={euro(totals.reconciled)} />
        <Amount label="Diferencia pendent" value={signedEuro(totals.difference)} warning={totals.mismatches > 0} />
      </dl>
    </section>

    <section className="min-w-0 border-y border-[var(--line)] bg-white">
      <h2 className="border-b border-[var(--line)] px-4 py-4 text-[15px] font-semibold text-slate-900">Historial de tancaments</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] bg-slate-50 text-xs text-slate-500">
            <Th>Z</Th><Th>Tancat</Th><Th>Empleat</Th><Th right>Vendes</Th>
            <Th right>Efectiu</Th><Th right>Targeta</Th><Th right>Tiquets</Th><Th>Factures</Th><Th>Estat</Th><Th>Historial</Th>
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
  const r = effectiveCashClosing(c);
  return <tr className={`border-b border-[var(--line)] align-top last:border-0 ${r.hasDifference ? "bg-amber-50/40" : "hover:bg-slate-50"}`}>
    <Td><div className="whitespace-nowrap font-semibold text-slate-900">{c.zLabel}</div></Td>
    <Td><div>{formatDashboardDateTime(c.closedAt, "ca-ES")}</div><div className="text-xs text-slate-500">Obert: {formatDashboardDateTime(c.openedAt, "ca-ES")}</div></Td>
    <Td>{c.employeeName ?? "--"}</Td>
    <Td right><strong className="text-emerald-700">{euro(r.totalSales)}</strong></Td>
    <Td right>{euro(r.totalCash)}</Td><Td right>{euro(r.totalCard)}</Td>
    <Td right><div>{r.ticketCount}</div>{c.cancelledCount > 0 && <div className="text-xs text-rose-600">{c.cancelledCount} anul.lats</div>}</Td>
    <Td><div className="whitespace-nowrap text-xs">{r.firstInvoice ?? "--"}</div><div className="whitespace-nowrap text-xs text-slate-500">{r.lastInvoice ?? "--"}</div></Td>
    <Td>
      {r.hasDifference ? <details className="min-w-32 text-amber-900">
        <summary className="cursor-pointer whitespace-nowrap font-semibold" aria-label={`Detall de diferencies ${c.zLabel}`}>{signedEuro(r.difference)}</summary>
        <dl className="mt-2 space-y-1 text-xs">
          {c.adjustment?.sourceMatches === false && <div>El Z sincronitzat ha canviat. Cal revisar l&apos;ajust.</div>}
          <div><dt className="inline">Comandes netes: </dt><dd className="inline">{euro(c.reconciliation.totalSales)}</dd></div>
          <div><dt className="inline">Efectiu: </dt><dd className="inline">{signedEuro(r.cashDifference)}</dd></div>
          <div><dt className="inline">Targeta: </dt><dd className="inline">{signedEuro(r.cardDifference)}</dd></div>
          <div><dt className="inline">Tiquets: </dt><dd className="inline">{r.ticketDifference > 0 ? "+" : ""}{r.ticketDifference}</dd></div>
        </dl>
      </details> : <span className="text-xs text-emerald-700">{c.adjustment ? "Conciliat" : "Coincideix"}</span>}
    </Td>
    <Td>{c.adjustment ? <details className="min-w-48 text-xs">
      <summary className="cursor-pointer font-medium text-slate-700" aria-label={`Historial ${c.zLabel}`}>Veure ajust</summary>
      <div className="mt-3 max-w-80 space-y-2">
        <p className="font-medium">{formatDashboardDateTime(c.adjustment.recordedAt, "ca-ES")}</p>
        <p>{c.adjustment.reason}</p>
        <dl className="space-y-1">
          <div><dt className="inline">Z original: </dt><dd className="inline">{euro(c.totalSales)} / {c.ticketCount} tiquets</dd></div>
          <div><dt className="inline">Efectiu original: </dt><dd className="inline">{euro(c.totalCash)}</dd></div>
          <div><dt className="inline">Targeta original: </dt><dd className="inline">{euro(c.totalCard)}</dd></div>
          <div><dt className="inline">Factures originals: </dt><dd className="inline">{c.firstInvoice} - {c.lastInvoice}</dd></div>
          <div><dt className="inline">Ajust registrat: </dt><dd className="inline">{signedEuro(c.adjustment.totalSales - c.totalSales)}</dd></div>
          <div><dt className="inline">Total conciliat registrat: </dt><dd className="inline">{euro(c.adjustment.totalSales)}</dd></div>
        </dl>
        <ul className="space-y-1" aria-label="Factures incorporades">{c.adjustment.evidence.map(e => <li key={e.orderId}>
          {e.invoiceNumber}: {euro(e.total)} ({e.paymentMethod === "cash" ? "efectiu" : "targeta"})
        </li>)}</ul>
        <p className="break-words text-slate-500">{c.adjustment.recordedBy}</p>
        <p className="break-all text-slate-400">ID: {c.adjustment.id}</p>
      </div>
    </details> : <span className="text-xs text-slate-400">Sense ajustos</span>}</Td>
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
