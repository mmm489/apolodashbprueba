import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listSupplierPayments } from "@/lib/repositories";
import { formatDashboardDate } from "@/lib/timezone";
import type { SupplierPaymentRecord } from "@/lib/types";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function SupplierPaymentsPage({
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
  const payments = await listSupplierPayments(filter.from, filter.to);
  const dispensedPayments = payments.filter((payment) => payment.status === "dispensed");
  const pendingPayments = payments.filter((payment) => payment.status === "pending").length;
  const errorPayments = payments.filter((payment) => payment.status === "error").length;
  const cancelledPayments = payments.filter((payment) => payment.status === "cancelled").length;
  const totals = dispensedPayments.reduce(
    (acc, payment) => {
      acc.amount += payment.amount;
      acc.count += 1;
      return acc;
    },
    { amount: 0, count: 0 },
  );
  const topSuppliers = groupBySupplier(dispensedPayments).slice(0, 6);

  return (
    <AppFrame
      title="Pagaments proveidors"
      description="Sortides d'efectiu fetes des de Cashlogy per pagar proveidors, separades de vendes i de factures."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total pagat" value={euro(totals.amount)} color="rose" />
        <Metric label="Pagaments OK" value={fmtNum(totals.count)} color="emerald" />
        <Metric label="Pendents" value={fmtNum(pendingPayments)} color="amber" />
        <Metric label="Errors" value={fmtNum(errorPayments)} color="slate" />
        <Metric label="Anul.lats" value={fmtNum(cancelledPayments)} color="indigo" />
      </section>

      {topSuppliers.length > 0 && (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-[15px] font-semibold text-slate-900">Principals proveidors pagats</p>
            <p className="mt-1 text-[12px] text-slate-500">
              Només compten els pagaments dispensats correctament per Cashlogy.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topSuppliers.map((supplier) => (
              <div key={supplier.name} className="rounded-xl border border-[var(--line)] bg-slate-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{supplier.name}</p>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[12px] font-bold text-rose-700">
                    {euro(supplier.amount)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{supplier.count} pagaments</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-[15px] font-semibold text-slate-900">Historial de pagaments</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Són moviments de sortida de caixa. No sumen com a venda.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50/80 text-[12px] font-medium uppercase tracking-wider text-slate-500">
                <Th>Hora</Th>
                <Th>Proveidor</Th>
                <Th>Motiu</Th>
                <Th>Empleat</Th>
                <Th>Estat</Th>
                <Th align="right">Import</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No hi ha pagaments de proveidors en aquest periode.
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

function PaymentRow({ payment }: { payment: SupplierPaymentRecord }) {
  const failed = payment.status === "error";
  const cancelled = payment.status === "cancelled";
  return (
    <tr className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/80">
      <Td>
        <div className="font-semibold text-slate-900">{payment.paymentTime}</div>
        <div className="text-[11px] text-slate-400">{formatDate(payment.businessDate)}</div>
      </Td>
      <Td>
        <div className="font-semibold text-slate-900">{payment.supplierName}</div>
        <div className="text-[11px] text-slate-400">#{payment.id}</div>
      </Td>
      <Td>
        <div className="max-w-[360px] text-slate-700">{payment.reason || "--"}</div>
        {payment.errorMessage && (
          <div className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
            {payment.errorMessage}
          </div>
        )}
      </Td>
      <Td>{payment.employeeName ?? "--"}</Td>
      <Td>
        <StatusBadge status={payment.status} />
      </Td>
      <Td align="right" className={failed || cancelled ? "font-bold text-slate-400 line-through" : "font-bold text-rose-700"}>
        {euro(payment.amount)}
      </Td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "dispensed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "pending"
        ? "bg-amber-50 text-amber-700"
        : status === "error"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  const label =
    status === "dispensed"
      ? "Pagat"
      : status === "pending"
        ? "Pendent"
        : status === "error"
          ? "Error"
          : "Anul.lat";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${classes}`}>{label}</span>;
}

const metricColors: Record<string, string> = {
  amber: "border-l-amber-500",
  emerald: "border-l-emerald-500",
  indigo: "border-l-indigo-500",
  rose: "border-l-rose-500",
  slate: "border-l-slate-400",
};

function Metric({ label, value, color = "rose" }: { label: string; value: string; color?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${metricColors[color] ?? metricColors.rose} bg-white p-4 shadow-sm transition hover:shadow-md`}>
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
  return <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
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
  return <td className={`px-5 py-4 align-top text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}

function groupBySupplier(payments: SupplierPaymentRecord[]) {
  const map = new Map<string, { name: string; amount: number; count: number }>();
  for (const payment of payments) {
    const existing = map.get(payment.supplierName);
    if (existing) {
      existing.amount += payment.amount;
      existing.count += 1;
    } else {
      map.set(payment.supplierName, { name: payment.supplierName, amount: payment.amount, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
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
