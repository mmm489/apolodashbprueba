"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ShoppingBag } from "lucide-react";
import type { ProductSaleRecord, SalesReport } from "@/lib/types";

type Tab = "resumen" | "detalle";

export function VentasTabs({
  salesReports,
  productSales,
  selectedDate,
}: {
  salesReports: SalesReport[];
  productSales: ProductSaleRecord[];
  selectedDate?: string;
}) {
  const [tab, setTab] = useState<Tab>(selectedDate ? "detalle" : "resumen");
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectDate = useCallback(
    (date: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", date);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Auto-switch to detail tab when a date is selected
  useEffect(() => {
    if (selectedDate) setTab("detalle");
  }, [selectedDate]);

  const selectedReport = selectedDate ? salesReports.find((r) => r.businessDate === selectedDate) : undefined;
  const selectedProducts = selectedDate
    ? productSales.filter((p) => p.businessDate === selectedDate).sort((a, b) => b.amount - a.amount)
    : [];

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--line)]">
        <TabButton
          active={tab === "resumen"}
          onClick={() => setTab("resumen")}
          icon={<CalendarDays className="h-4 w-4" />}
          label="Resumen diario"
          count={salesReports.length}
        />
        <TabButton
          active={tab === "detalle"}
          onClick={() => setTab("detalle")}
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Detalle del dia"
          count={selectedProducts.length}
        />
      </div>

      <div className="p-5">
        {tab === "resumen" && (
          <ResumenTab reports={salesReports} selectedDate={selectedDate} onSelect={selectDate} />
        )}
        {tab === "detalle" && (
          <DetalleTab report={selectedReport} products={selectedProducts} />
        )}
      </div>
    </div>
  );
}

/* ---- Tab button ---- */
function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-[13px] font-semibold transition ${
        active ? "border-b-2 border-indigo-500 text-indigo-600" : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
        {count}
      </span>
    </button>
  );
}

/* ---- Resumen Tab ---- */
function ResumenTab({
  reports,
  selectedDate,
  onSelect,
}: {
  reports: SalesReport[];
  selectedDate?: string;
  onSelect: (date: string) => void;
}) {
  if (!reports.length) {
    return <Empty text="No hay informes de ventas en este periodo." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <Th>Fecha</Th>
            <Th align="right">Ventas</Th>
            <Th align="right">Pedidos</Th>
            <Th align="right">Ticket medio</Th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.businessDate)}
              className={`cursor-pointer border-b border-[var(--line)] transition ${
                r.businessDate === selectedDate
                  ? "bg-indigo-50/60 border-indigo-200"
                  : "hover:bg-slate-50/80"
              }`}
            >
              <Td className="font-semibold text-slate-800">{formatDate(r.businessDate)}</Td>
              <Td align="right" className="font-semibold text-emerald-700">{euro(r.totalSales)}</Td>
              <Td align="right">{fmtNum(r.orderCount)}</Td>
              <Td align="right">{euro(r.averageTicket)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/50">
            <Td className="font-semibold text-slate-600">Total</Td>
            <Td align="right" className="font-bold text-slate-900">
              {euro(reports.reduce((s, r) => s + r.totalSales, 0))}
            </Td>
            <Td align="right" className="font-bold text-slate-900">
              {fmtNum(reports.reduce((s, r) => s + r.orderCount, 0))}
            </Td>
            <Td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---- Detalle Tab ---- */
function DetalleTab({
  report,
  products,
}: {
  report?: SalesReport;
  products: ProductSaleRecord[];
}) {
  if (!report) {
    return <Empty text="Selecciona un dia en la pestana Resumen para ver el desglose de productos." />;
  }

  return (
    <div className="space-y-5">
      {/* Day summary header */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Ventas totales" value={euro(report.totalSales)} />
        <MiniStat label="Pedidos" value={fmtNum(report.orderCount)} />
        <MiniStat label="Ticket medio" value={euro(report.averageTicket)} />
      </div>

      {/* Product table */}
      {products.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <Th>Producto</Th>
                <Th>Codigo</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)] transition hover:bg-slate-50/80">
                  <Td className="font-semibold text-slate-800">{p.productName}</Td>
                  <Td>{p.productCode}</Td>
                  <Td align="right">{fmtNum(p.units)}</Td>
                  <Td align="right" className="font-semibold text-emerald-700">{euro(p.amount)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                <Td colSpan={2} className="font-semibold text-slate-600">Total</Td>
                <Td align="right" className="font-bold text-slate-900">
                  {fmtNum(products.reduce((s, p) => s + p.units, 0))}
                </Td>
                <Td align="right" className="font-bold text-slate-900">
                  {euro(products.reduce((s, p) => s + p.amount, 0))}
                </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty text="No hay productos registrados para este dia." />
      )}
    </div>
  );
}

/* ---- Shared helpers ---- */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[18px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-slate-400">{text}</p>;
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`py-3 pr-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className, colSpan }: { children?: React.ReactNode; align?: "right"; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`py-2.5 pr-3 text-[13px] text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
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
