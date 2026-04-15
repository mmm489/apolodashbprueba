"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, FileUp, LoaderCircle, RefreshCw, Users } from "lucide-react";

import type { DayStatus } from "@/lib/analytics";
import { classifyFamily } from "@/lib/product-families";
import type { Employee, EmployeeShift, HourlyProductSale, HourlySalesEntry, ProductCost, ProductSaleRecord } from "@/lib/types";

interface FamilyGroup {
  name: string;
  color: string;
  items: ProductSaleRecord[];
  totalUnits: number;
  totalAmount: number;
}

function groupByFamily(products: ProductSaleRecord[]): FamilyGroup[] {
  const map = new Map<string, FamilyGroup>();
  for (const p of products) {
    const { name, color } = classifyFamily(p.productName);
    const existing = map.get(name);
    if (existing) {
      existing.items.push(p);
      existing.totalUnits += p.units;
      existing.totalAmount += p.amount;
    } else {
      map.set(name, { name, color, items: [p], totalUnits: p.units, totalAmount: p.amount });
    }
  }
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/* ---- Main component ---- */

export function VendesDayList({
  dayStatuses,
  productSales,
  hourlySales,
  hourlyProductSales,
  productCosts,
  employeeShifts,
  employees,
}: {
  dayStatuses: DayStatus[];
  productSales: ProductSaleRecord[];
  hourlySales: HourlySalesEntry[];
  hourlyProductSales: HourlyProductSale[];
  productCosts: ProductCost[];
  employeeShifts: EmployeeShift[];
  employees: Employee[];
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [shiftsModalDate, setShiftsModalDate] = useState<string | null>(null);

  return (
    <>
    {/* Shifts modal */}
    {shiftsModalDate && (
      <ShiftsModal
        date={shiftsModalDate}
        shifts={employeeShifts.filter((s) => s.businessDate === shiftsModalDate)}
        employees={employees}
        onClose={() => setShiftsModalDate(null)}
      />
    )}

    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-slate-50/80 text-left text-[12px] font-medium uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3 w-8" />
            <th className="px-5 py-3">Data</th>
            <th className="px-5 py-3 text-center">Temps</th>
            <th className="px-5 py-3 text-right">Vendes</th>
            <th className="px-5 py-3 text-right">Comandes</th>
            <th className="px-5 py-3 text-center">Articles</th>
            <th className="px-5 py-3 text-center">Hores</th>
            <th className="px-5 py-3 text-right">Accions</th>
          </tr>
        </thead>
        <tbody>
          {dayStatuses.map((day) => {
            const isExpanded = expandedDate === day.date;
            const dayProducts = productSales.filter((p) => p.businessDate === day.date);
            const dayHourly = hourlySales.filter((h) => h.businessDate === day.date);
            const dayHourlyProducts = hourlyProductSales.filter((hp) => hp.businessDate === day.date);
            const dayShifts = employeeShifts.filter((s) => s.businessDate === day.date);

            return (
              <DayRow
                key={day.date}
                day={day}
                isExpanded={isExpanded}
                onToggle={() => setExpandedDate(isExpanded ? null : day.date)}
                onOpenShifts={() => setShiftsModalDate(day.date)}
                dayProducts={dayProducts}
                dayHourly={dayHourly}
                dayHourlyProducts={dayHourlyProducts}
                productCosts={productCosts}
                dayShifts={dayShifts}
                employees={employees}
              />
            );
          })}
          {dayStatuses.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                No hi ha dies en aquest periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}

/* ---- Day row ---- */

function DayRow({
  day,
  isExpanded,
  onToggle,
  onOpenShifts,
  dayProducts,
  dayHourly,
  dayHourlyProducts,
  productCosts,
  dayShifts,
  employees,
}: {
  day: DayStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenShifts: () => void;
  dayProducts: ProductSaleRecord[];
  dayHourly: HourlySalesEntry[];
  dayHourlyProducts: HourlyProductSale[];
  productCosts: ProductCost[];
  dayShifts: EmployeeShift[];
  employees: Employee[];
}) {
  const costMap = new Map<string, number>();
  for (const pc of productCosts) costMap.set(pc.productCode, pc.unitCost);
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[var(--line)] transition cursor-pointer hover:bg-slate-50/80 ${isExpanded ? "bg-indigo-50/60" : ""}`}
      >
        <td className="px-5 py-3">
          {isExpanded
            ? <ChevronDown className="size-4 text-slate-400" />
            : <ChevronRight className="size-4 text-slate-400" />}
        </td>
        <td className="px-5 py-3 font-semibold text-slate-900">{formatDate(day.date)}</td>
        <td className="px-5 py-3 text-center">
          {day.weather ? (
            <span className="inline-flex items-center gap-1 text-[12px] text-slate-600" title={`${day.weather.tempMin.toFixed(0)}°–${day.weather.tempMax.toFixed(0)}°C`}>
              <span>{weatherEmoji(day.weather.weatherCode)}</span>
              <span className="font-medium">{day.weather.tempMax.toFixed(0)}°</span>
              <span className="text-slate-400">{day.weather.tempMin.toFixed(0)}°</span>
            </span>
          ) : (
            <span className="text-slate-300">--</span>
          )}
        </td>
        <td className="px-5 py-3 text-right font-semibold text-emerald-700">
          {day.totalSales != null ? euro(day.totalSales) : <span className="text-slate-300">--</span>}
        </td>
        <td className="px-5 py-3 text-right text-slate-600">
          {day.orderCount != null ? fmtNum(day.orderCount) : <span className="text-slate-300">--</span>}
        </td>
        <td className="px-5 py-3 text-center">
          <StatusBadge ok={day.hasArticles} />
        </td>
        <td className="px-5 py-3 text-center">
          <StatusBadge ok={day.hasHourly} />
        </td>
        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <UploadButton label="Articles" date={day.date} expectedType="articles" alreadyUploaded={day.hasArticles} />
            <UploadButton label="Hores" date={day.date} expectedType="hores" alreadyUploaded={day.hasHourly} />
            <button
              type="button"
              onClick={onOpenShifts}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                dayShifts.length > 0
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              <Users className="size-3" />
              {dayShifts.length > 0 ? `${dayShifts.length} empleats` : "Empleats"}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="border-b border-[var(--line)] bg-slate-50/30 px-5 py-4">
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Products */}
              {day.hasArticles && dayProducts.length > 0 && (
                <ExpandableFamilies products={dayProducts} />
              )}

              {/* Hourly with product detail */}
              {day.hasHourly && dayHourly.length > 0 && (
                <HourlyDetail hourly={dayHourly} hourlyProducts={dayHourlyProducts} costMap={costMap} shifts={dayShifts} employees={employees} />
              )}
            </div>

          </td>
        </tr>
      )}
    </>
  );
}

/* ---- Shifts modal ---- */

function ShiftsModal({
  date,
  shifts,
  employees,
  onClose,
}: {
  date: string;
  shifts: EmployeeShift[];
  employees: Employee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("13:00");
  const [isPending, startTransition] = useTransition();

  const assignedIds = new Set(shifts.map((s) => s.employeeId));
  const availableEmployees = employees.filter((e) => !assignedIds.has(e.id));

  const dateLabel = new Date(date).toLocaleDateString("ca-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function addShift() {
    if (!selectedEmployee) return;
    startTransition(async () => {
      await fetch("/api/employees/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmployee, businessDate: date, shiftStart, shiftEnd }),
      });
      setSelectedEmployee("");
      router.refresh();
    });
  }

  function removeShift(employeeId: string) {
    startTransition(async () => {
      await fetch("/api/employees/shifts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, businessDate: date }),
      });
      router.refresh();
    });
  }

  const totalHours = shifts.reduce((sum, s) => sum + parseHours(s.shiftStart, s.shiftEnd), 0);
  const totalCost = shifts.reduce((sum, s) => {
    const emp = employees.find((e) => e.id === s.employeeId);
    return sum + parseHours(s.shiftStart, s.shiftEnd) * (emp?.hourlyCost ?? 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--line)] bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[18px] font-bold text-slate-900">Empleats del dia</p>
            <p className="mt-0.5 text-[13px] text-slate-500">{dateLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <span className="text-[18px]">✕</span>
          </button>
        </div>

        {/* Add form */}
        {availableEmployees.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Empleat</label>
              <select
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  const emp = employees.find((x) => x.id === e.target.value);
                  if (emp) { setShiftStart(emp.shiftStart); setShiftEnd(emp.shiftEnd); }
                }}
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[13px] outline-none"
              >
                <option value="">Selecciona empleat...</option>
                {availableEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.hourlyCost.toFixed(2)} €/h)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Entrada</label>
              <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[13px] outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Sortida</label>
              <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[13px] outline-none" />
            </div>
            <button
              type="button"
              onClick={addShift}
              disabled={isPending || !selectedEmployee}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              Afegir
            </button>
          </div>
        )}

        {/* Shifts list */}
        {shifts.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50/80 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 text-left">Empleat</th>
                  <th className="px-4 py-2.5 text-center">Horari</th>
                  <th className="px-4 py-2.5 text-right">Hores</th>
                  <th className="px-4 py-2.5 text-right">Cost</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const hours = parseHours(s.shiftStart, s.shiftEnd);
                  const emp = employees.find((e) => e.id === s.employeeId);
                  const cost = hours * (emp?.hourlyCost ?? 0);
                  return (
                    <tr key={s.id} className="border-b border-[var(--line)]/50">
                      <td className="px-4 py-2 text-[13px] font-medium text-slate-800">{s.employeeName}</td>
                      <td className="px-4 py-2 text-center text-[13px] text-slate-600">{s.shiftStart} – {s.shiftEnd}</td>
                      <td className="px-4 py-2 text-right text-[13px] text-slate-600">{hours.toFixed(1)} h</td>
                      <td className="px-4 py-2 text-right text-[13px] font-semibold text-slate-800">{euro(cost)}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => removeShift(s.employeeId)} className="text-slate-400 hover:text-rose-500 transition" title="Treure">
                          <span className="text-[14px]">✕</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 font-semibold text-slate-900">
                  <td className="px-4 py-2.5 text-[13px]">Total</td>
                  <td className="px-4 py-2.5 text-center text-[13px]">{shifts.length} empleats</td>
                  <td className="px-4 py-2.5 text-right text-[13px]">{totalHours.toFixed(1)} h</td>
                  <td className="px-4 py-2.5 text-right text-[13px]">{euro(totalCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
            <Users className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-[13px] text-slate-400">Cap empleat assignat a aquest dia</p>
            <p className="text-[12px] text-slate-400">Selecciona un empleat i l&apos;horari per afegir-lo</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Hourly detail with products ---- */

function HourlyDetail({
  hourly,
  hourlyProducts,
  costMap,
  shifts,
  employees,
}: {
  hourly: HourlySalesEntry[];
  hourlyProducts: HourlyProductSale[];
  costMap: Map<string, number>;
  shifts: EmployeeShift[];
  employees: Employee[];
}) {
  const [openHour, setOpenHour] = useState<string | null>(null);
  const sorted = [...hourly].sort((a, b) => a.hour.localeCompare(b.hour));

  // Calculate employee cost per hour slot
  // An employee working 10:00-14:00 covers hours 10:00, 11:00, 12:00, 13:00
  function getEmployeeCostForHour(hourLabel: string): number {
    const hourNum = Number.parseInt(hourLabel.split(":")[0], 10);
    let cost = 0;
    for (const shift of shifts) {
      const emp = employees.find((e) => e.id === shift.employeeId);
      if (!emp) continue;
      const startH = Number.parseInt(shift.shiftStart.split(":")[0], 10);
      const endH = Number.parseInt(shift.shiftEnd.split(":")[0], 10);
      if (hourNum >= startH && hourNum < endH) {
        cost += emp.hourlyCost;
      }
    }
    return cost;
  }

  const totalSales = hourly.reduce((s, h) => s + h.sales, 0);
  const totalProductCost = hourlyProducts.reduce((s, p) => s + (costMap.get(p.productCode) ?? 0) * p.units, 0);
  const totalEmployeeCost = sorted.reduce((s, h) => s + getEmployeeCostForHour(h.hour), 0);

  return (
    <div>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Detall per hora</p>
      <div className="space-y-1.5">
        {sorted.map((h) => {
          const isOpen = openHour === h.hour;
          const products = hourlyProducts.filter((p) => p.hourLabel === h.hour);
          const hourProductCost = products.reduce((s, p) => s + (costMap.get(p.productCode) ?? 0) * p.units, 0);
          const hourEmpCost = getEmployeeCostForHour(h.hour);
          const margin = h.sales - hourProductCost - hourEmpCost;

          return (
            <div key={h.id} className="rounded-lg border border-[var(--line)] bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenHour(isOpen ? null : h.hour)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-50/50"
              >
                {isOpen ? <ChevronDown className="size-3 text-slate-400" /> : <ChevronRight className="size-3 text-slate-400" />}
                <span className="text-[13px] font-bold text-slate-800 w-12">{h.hour}</span>
                <span className="text-[12px] text-slate-500">{fmtNum(h.orderCount)} uds</span>
                <span className="ml-auto flex items-center gap-3 shrink-0">
                  <span className="text-[12px] text-slate-500">Venda: <span className="font-semibold text-emerald-700">{euro(h.sales)}</span></span>
                  <span className="text-[12px] text-slate-500">Prod: <span className="font-semibold text-rose-600">{euro(hourProductCost)}</span></span>
                  {hourEmpCost > 0 && <span className="text-[12px] text-slate-500">Empl: <span className="font-semibold text-violet-600">{euro(hourEmpCost)}</span></span>}
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${margin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    Marge: {euro(margin)}
                  </span>
                </span>
              </button>

              {isOpen && products.length > 0 && (
                <div className="border-t border-[var(--line)] bg-slate-50/50 px-3 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        <th className="pb-1 text-left">Producte</th>
                        <th className="pb-1 text-right">Uds</th>
                        <th className="pb-1 text-right">Venda</th>
                        <th className="pb-1 text-right">Cost</th>
                        <th className="pb-1 text-right">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.sort((a, b) => b.amount - a.amount).map((p) => {
                        const unitCost = costMap.get(p.productCode) ?? 0;
                        const totalCostP = unitCost * p.units;
                        const marginP = p.amount - totalCostP;
                        return (
                          <tr key={p.id} className="border-t border-[var(--line)]/30">
                            <td className="py-1 pr-2 text-[12px] text-slate-700">{p.productName}</td>
                            <td className="py-1 text-right text-[12px] text-slate-500">{fmtNum(p.units)}</td>
                            <td className="py-1 text-right text-[12px] text-emerald-700">{euro(p.amount)}</td>
                            <td className="py-1 text-right text-[12px] text-rose-600">{unitCost > 0 ? euro(totalCostP) : <span className="text-slate-300">--</span>}</td>
                            <td className={`py-1 text-right text-[12px] font-semibold ${marginP >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{unitCost > 0 ? euro(marginP) : <span className="text-slate-300">--</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Totals */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 font-semibold">
          <span className="text-[13px] text-slate-700">Total dia</span>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-emerald-700">Venda: {euro(totalSales)}</span>
            <span className="text-[12px] text-rose-600">Prod: {euro(totalProductCost)}</span>
            {totalEmployeeCost > 0 && <span className="text-[12px] text-violet-600">Empl: {euro(totalEmployeeCost)}</span>}
            <span className={`rounded-lg px-2 py-0.5 text-[12px] font-bold ${totalSales - totalProductCost - totalEmployeeCost >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              Marge: {euro(totalSales - totalProductCost - totalEmployeeCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Expandable families ---- */

function ExpandableFamilies({ products }: { products: ProductSaleRecord[] }) {
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const families = groupByFamily(products);

  return (
    <div>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Articles Venda</p>
      <div className="space-y-2">
        {families.map((fam) => {
          const isOpen = openFamily === fam.name;
          return (
            <div key={fam.name} className="rounded-lg border border-[var(--line)] bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenFamily(isOpen ? null : fam.name)}
                className="flex w-full items-center justify-between p-3 text-left transition hover:bg-slate-50/50"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="size-3.5 text-slate-400" /> : <ChevronRight className="size-3.5 text-slate-400" />}
                  <span className={`size-2.5 rounded-full ${fam.color}`} />
                  <span className="text-[13px] font-semibold text-slate-800">{fam.name}</span>
                  <span className="text-[11px] text-slate-400">{fam.items.length} articles</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-slate-500">{fmtNum(fam.totalUnits)} uds</span>
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">{euro(fam.totalAmount)}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--line)] bg-slate-50/50 px-3 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        <th className="pb-1.5 text-left">Producte</th>
                        <th className="pb-1.5 text-left">Codi</th>
                        <th className="pb-1.5 text-right">Unitats</th>
                        <th className="pb-1.5 text-right">Import</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fam.items.sort((a, b) => b.amount - a.amount).map((p) => (
                        <tr key={p.id} className="border-t border-[var(--line)]/30">
                          <td className="py-1.5 pr-2 text-[13px] text-slate-700">{p.productName}</td>
                          <td className="py-1.5 pr-2 text-[13px] text-slate-400">{p.productCode}</td>
                          <td className="py-1.5 pr-2 text-right text-[13px] text-slate-500">{fmtNum(p.units)}</td>
                          <td className="py-1.5 text-right text-[13px] font-semibold text-slate-800">{euro(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Status badge ---- */

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="size-3" /> Pujat
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      <Clock className="size-3" /> Pendent
    </span>
  );
}

/* ---- Upload button ---- */

function UploadButton({
  label,
  date,
  expectedType,
  alreadyUploaded = false,
}: {
  label: string;
  date: string;
  expectedType: "articles" | "hores";
  alreadyUploaded?: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleClick() {
    if (alreadyUploaded) {
      const ok = window.confirm(
        `Vols actualitzar les dades de ${label} del ${date}? Es substituiran les dades actuals amb el nou fitxer.`,
      );
      if (!ok) return;
    }
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setErrorMsg("");

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("files", file);
        const res = await fetch("/api/ingest/upload", { method: "POST", body: formData });
        const data = await res.json();

        const processed = data.processed?.[0];
        if (!processed) {
          setStatus("error");
          setErrorMsg("No s'ha pogut processar el fitxer.");
          return;
        }

        if (processed.status === "error") {
          setStatus("error");
          setErrorMsg(processed.error ?? "Error al processar el fitxer.");
          return;
        }

        if (processed.duplicated) {
          // Same file content: data is already the same
          setStatus("ok");
          setErrorMsg("");
          router.refresh();
          return;
        }

        // Validate type matches expectation
        const gotType = processed.documentType;
        const expectedDocType = expectedType === "articles" ? "sales_report" : "hourly_report";
        if (gotType !== expectedDocType) {
          setStatus("error");
          setErrorMsg(
            expectedType === "articles"
              ? "El fitxer no es un Articles Venda. Comprova que puges el fitxer correcte."
              : "El fitxer no es un Resum Hores. Comprova que puges el fitxer correcte.",
          );
          return;
        }

        setStatus("ok");
        router.refresh();
      } catch {
        setStatus("error");
        setErrorMsg("Error de connexio al pujar el fitxer.");
      }
    });

    e.target.value = "";
  }

  const baseClass = alreadyUploaded
    ? "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100";
  const errorClass = "bg-rose-50 text-rose-700 hover:bg-rose-100";

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1">
        {status === "ok" && <CheckCircle2 className="size-3 text-emerald-500" />}
        {status === "error" && <AlertCircle className="size-3 text-rose-500" />}
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
            status === "error" ? errorClass : baseClass
          }`}
          title={alreadyUploaded ? `Actualitzar ${label} (${date})` : `Pujar ${label} (${date})`}
        >
          {isPending ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : alreadyUploaded ? (
            <RefreshCw className="size-3" />
          ) : (
            <FileUp className="size-3" />
          )}
          {label}
        </button>
      </div>
      {status === "error" && errorMsg && (
        <p className="max-w-[200px] text-right text-[10px] leading-tight text-rose-600">{errorMsg}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

/* ---- Helpers ---- */

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

/** WMO weather codes → emoji */
function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 55) return "🌦️";
  if (code >= 56 && code <= 57) return "🌧️";
  if (code >= 61 && code <= 65) return "🌧️";
  if (code >= 66 && code <= 67) return "🌨️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "❄️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌤️";
}

function parseHours(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ca-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
