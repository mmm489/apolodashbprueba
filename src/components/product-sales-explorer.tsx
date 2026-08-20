"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock3, Download, FileSpreadsheet, Package, Search, Tag } from "lucide-react";

import type {
  ProductModifierCombination,
  ProductSalesSlice,
  ProductSalesSliceKind,
} from "@/lib/types";

type AnalysisMode = "products" | "flavors" | "toppings";
type TimeGrouping = "half-hour" | "hour" | "day";

interface ProductRankingRow {
  id: string;
  name: string;
  category: string;
  units: number;
  amount: number;
  grossAmount: number;
  extraAmount: number;
  flavorUnits: number;
  toppingUnits: number;
  orderCount: number;
}

interface ModifierRankingRow {
  id: string;
  name: string;
  baseProductName: string;
  category: string;
  units: number;
  amount: number;
  freeUnits: number;
  paidUnits: number;
  orderCount: number;
}

interface TimelineRow {
  id: string;
  periodKey: string;
  periodLabel: string;
  name: string;
  context: string;
  units: number;
  amount: number;
  grossAmount: number;
  extraAmount: number;
  freeUnits: number;
  paidUnits: number;
  orderCount: number;
}

const BUSINESS_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const totalMinutes = (4 * 60 + index * 30) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});

const MODE_KIND: Record<Exclude<AnalysisMode, "products">, ProductSalesSliceKind> = {
  flavors: "flavor",
  toppings: "topping",
};

export function ProductSalesExplorer({
  slices,
  combinations,
  fromDate,
  toDate,
}: {
  slices: ProductSalesSlice[];
  combinations: ProductModifierCombination[];
  fromDate: string;
  toDate: string;
}) {
  const [mode, setMode] = useState<AnalysisMode>("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [baseProduct, setBaseProduct] = useState("all");
  const [fromSlot, setFromSlot] = useState("04:00");
  const [toSlot, setToSlot] = useState("03:30");
  const [grouping, setGrouping] = useState<TimeGrouping>("day");
  const [visibleRows, setVisibleRows] = useState(120);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  const categories = useMemo(
    () => [...new Set(slices.map((slice) => slice.baseCategoryName))].sort((a, b) => a.localeCompare(b, "ca")),
    [slices],
  );
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; category: string }>();
    for (const slice of slices) {
      if (slice.kind !== "product") continue;
      map.set(slice.baseProductId, {
        id: slice.baseProductId,
        name: slice.baseProductName,
        category: slice.baseCategoryName,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ca"));
  }, [slices]);

  const contextSlices = useMemo(
    () => slices.filter((slice) => {
      if (category !== "all" && slice.baseCategoryName !== category) return false;
      if (baseProduct !== "all" && slice.baseProductId !== baseProduct) return false;
      return isSlotInRange(slice.timeSlot, fromSlot, toSlot);
    }),
    [slices, category, baseProduct, fromSlot, toSlot],
  );

  const normalizedQuery = normalize(query);
  const productRanking = useMemo(
    () => buildProductRanking(contextSlices, normalizedQuery),
    [contextSlices, normalizedQuery],
  );
  const modifierRanking = useMemo(() => {
    if (mode === "products") return [];
    return buildModifierRanking(contextSlices, MODE_KIND[mode], normalizedQuery);
  }, [contextSlices, mode, normalizedQuery]);
  const timeline = useMemo(
    () => buildTimeline(contextSlices, mode, grouping, normalizedQuery),
    [contextSlices, mode, grouping, normalizedQuery],
  );
  const topCombinations = useMemo(
    () => buildCombinationRanking(combinations, category, baseProduct, fromSlot, toSlot, normalizedQuery),
    [combinations, category, baseProduct, fromSlot, toSlot, normalizedQuery],
  );

  const soldUnits = sum(contextSlices.filter((slice) => slice.kind === "product"), "units");
  const flavorUnits = sum(contextSlices.filter((slice) => slice.kind === "flavor"), "units");
  const toppingUnits = sum(contextSlices.filter((slice) => slice.kind === "topping"), "units");
  const extraRevenue = contextSlices
    .filter((slice) => slice.kind !== "product")
    .reduce((total, slice) => total + slice.amount, 0);
  const freeSelections = contextSlices
    .filter((slice) => slice.kind !== "product")
    .reduce((total, slice) => total + slice.freeUnits, 0);
  const paidSelections = contextSlices
    .filter((slice) => slice.kind !== "product")
    .reduce((total, slice) => total + slice.paidUnits, 0);

  const exportTimeline = async (format: "csv" | "xlsx") => {
    if (timeline.length === 0 || exporting) return;
    setExporting(format);
    try {
      const rows = timeline.map((row) => ({
        "Període": row.periodLabel,
        "Tipus": modeLabel(mode),
        [mode === "products" ? "Producte" : mode === "flavors" ? "Sabor" : "Topping / extra"]: row.name,
        [mode === "products" ? "Categoria" : "Producte base"]: row.context,
        "Unitats": roundExport(row.units),
        "Comandes": roundExport(row.orderCount),
        "Incloses gratis": roundExport(row.freeUnits),
        "Seleccions de pagament": roundExport(row.paidUnits),
        "Extres sense IVA": roundExport(row.extraAmount),
        "Venda sense IVA": roundExport(row.amount),
        "Venda amb IVA": roundExport(row.grossAmount),
      }));
      const filename = `vendes-franja-${mode}-${grouping}-${fromDate}_${toDate}`;

      if (format === "csv") {
        downloadBlob(toCsv(rows), `${filename}.csv`, "text/csv;charset=utf-8");
        return;
      }

      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 22 }, { wch: 18 }, { wch: 34 }, { wch: 30 },
        { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
        { wch: 18 }, { wch: 18 }, { wch: 18 },
      ];
      const filtersSheet = XLSX.utils.json_to_sheet([
        {
          "Data inicial": fromDate,
          "Data final": toDate,
          "Vista": modeLabel(mode),
          "Categoria": category === "all" ? "Totes" : category,
          "Producte": baseProduct === "all" ? "Tots" : products.find((product) => product.id === baseProduct)?.name ?? baseProduct,
          "Hora inicial": fromSlot,
          "Hora final": toSlot,
          "Agrupació": groupingLabel(grouping),
          "Cerca": query || "Sense filtre",
          "Files exportades": rows.length,
        },
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vendes per franja");
      XLSX.utils.book_append_sheet(workbook, filtersSheet, "Filtres");
      const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      downloadBlob(output, `${filename}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-indigo-600" />
            <h2 className="text-[20px] font-bold tracking-tight text-slate-950">Productes, sabors i toppings</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Analitza cada producte complet, els complements associats i les vendes per franja.
          </p>
        </div>
        <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 lg:w-auto">
          <ModeButton active={mode === "products"} onClick={() => setMode("products")}>Productes</ModeButton>
          <ModeButton active={mode === "flavors"} onClick={() => setMode("flavors")}>Sabors</ModeButton>
          <ModeButton active={mode === "toppings"} onClick={() => setMode("toppings")}>Toppings i extres</ModeButton>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={<Package className="size-4" />} label="Productes venuts" value={number(soldUnits)} />
        <Kpi icon={<Tag className="size-4" />} label="Sabors escollits" value={number(flavorUnits)} />
        <Kpi icon={<Tag className="size-4" />} label="Toppings" value={number(toppingUnits)} />
        <Kpi icon={<BarChart3 className="size-4" />} label="Ingressos extres s/IVA" value={euro(extraRevenue)} />
        <Kpi icon={<Tag className="size-4" />} label="Incloses gratis" value={number(freeSelections)} />
        <Kpi icon={<Tag className="size-4" />} label="Seleccions de pagament" value={number(paidSelections)} />
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1.2fr_0.7fr_0.7fr_0.8fr]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Buscar</span>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "products" ? "Producte o categoria" : "Sabor, topping o producte"}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none"
            />
          </span>
        </label>
        <SelectField
          label="Categoria"
          value={category}
          onChange={(value) => {
            setCategory(value);
            setBaseProduct("all");
          }}
        >
          <option value="all">Totes</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </SelectField>
        <SelectField label="Producte base" value={baseProduct} onChange={setBaseProduct}>
          <option value="all">Tots els productes</option>
          {products
            .filter((product) => category === "all" || product.category === category)
            .map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </SelectField>
        <SelectField label="Des de" value={fromSlot} onChange={setFromSlot}>
          {BUSINESS_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </SelectField>
        <SelectField label="Fins" value={toSlot} onChange={setToSlot}>
          {BUSINESS_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </SelectField>
        <SelectField label="Agrupar" value={grouping} onChange={(value) => setGrouping(value as TimeGrouping)}>
          <option value="half-hour">30 minuts</option>
          <option value="hour">Hora</option>
          <option value="day">Dia</option>
        </SelectField>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <RankingPanel
          mode={mode}
          productRows={productRanking}
          modifierRows={modifierRanking}
        />
        <CombinationPanel rows={topCombinations} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
        <div className="flex flex-col gap-1 border-b border-[var(--line)] bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">Venda completa per franja temporal</h3>
            <p className="text-[12px] text-slate-500">
              {timeline.length} files · imports sense IVA · els productes inclouen els seus extres
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
              <Clock3 className="size-4" /> {fromSlot} - {toSlot}
            </span>
            <ExportButton
              label="CSV"
              icon={<Download className="size-4" />}
              disabled={timeline.length === 0 || exporting !== null}
              loading={exporting === "csv"}
              onClick={() => void exportTimeline("csv")}
            />
            <ExportButton
              label="Excel"
              icon={<FileSpreadsheet className="size-4" />}
              disabled={timeline.length === 0 || exporting !== null}
              loading={exporting === "xlsx"}
              onClick={() => void exportTimeline("xlsx")}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left">
            <thead className="bg-white text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Període</th>
                <th className="px-4 py-2.5">{mode === "products" ? "Producte" : mode === "flavors" ? "Sabor" : "Topping / extra"}</th>
                <th className="px-4 py-2.5">{mode === "products" ? "Categoria" : "Producte base"}</th>
                <th className="px-4 py-2.5 text-right">Uds</th>
                <th className="px-4 py-2.5 text-right">Comandes</th>
                <th className="px-4 py-2.5 text-right">Gratis / pag.</th>
                <th className="px-4 py-2.5 text-right">Extres s/IVA</th>
                <th className="px-4 py-2.5 text-right">Venda s/IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeline.slice(0, visibleRows).map((row) => (
                <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-600">{row.periodLabel}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{row.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.context}</td>
                  <td className="px-4 py-2.5 text-right">{number(row.units)}</td>
                  <td className="px-4 py-2.5 text-right">{number(row.orderCount)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{number(row.freeUnits)} / {number(row.paidUnits)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{euro(row.extraAmount)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{euro(row.amount)}</td>
                </tr>
              ))}
              {timeline.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-slate-400">No hi ha dades amb aquests filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {timeline.length > visibleRows && (
          <button
            type="button"
            onClick={() => setVisibleRows((current) => current + 120)}
            className="w-full border-t border-[var(--line)] bg-white px-4 py-3 text-[13px] font-bold text-indigo-700 hover:bg-indigo-50"
          >
            Mostrar 120 files més
          </button>
        )}
      </div>
    </section>
  );
}

function RankingPanel({
  mode,
  productRows,
  modifierRows,
}: {
  mode: AnalysisMode;
  productRows: ProductRankingRow[];
  modifierRows: ModifierRankingRow[];
}) {
  const title = mode === "products" ? "Rànquing de productes complets" : mode === "flavors" ? "Sabors més escollits" : "Toppings i extres més escollits";
  const rows = mode === "products" ? productRows : modifierRows;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <div className="border-b border-[var(--line)] bg-slate-50 px-4 py-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        <p className="text-[12px] text-slate-500">Ordenat per unitats dins del període seleccionat</p>
      </div>
      <div className="max-h-[430px] overflow-auto">
        <table className="w-full min-w-[620px]">
          <thead className="sticky top-0 bg-white text-[10px] font-bold uppercase text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">{mode === "products" ? "Categoria" : "Producte base"}</th>
              <th className="px-3 py-2 text-right">Uds</th>
              <th className="px-3 py-2 text-right">{mode === "products" ? "Sab. / Top." : "Gratis / pag."}</th>
              <th className="px-4 py-2 text-right">Venda s/IVA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((row) => {
              const product = row as ProductRankingRow;
              const modifier = row as ModifierRankingRow;
              return (
                <tr key={row.id} className="text-[12px] text-slate-700 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{row.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{mode === "products" ? product.category : modifier.baseProductName}</td>
                  <td className="px-3 py-2.5 text-right">{number(row.units)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {mode === "products"
                      ? `${number(product.flavorUnits)} / ${number(product.toppingUnits)}`
                      : `${number(modifier.freeUnits)} / ${number(modifier.paidUnits)}`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{euro(row.amount)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-slate-400">No hi ha resultats.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CombinationPanel({ rows }: { rows: Array<{ id: string; baseProductName: string; combinationName: string; units: number }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <div className="border-b border-[var(--line)] bg-slate-50 px-4 py-3">
        <h3 className="text-[15px] font-bold text-slate-900">Combinacions més habituals</h3>
        <p className="text-[12px] text-slate-500">Sabors i toppings que es demanen junts</p>
      </div>
      <div className="max-h-[430px] divide-y divide-slate-100 overflow-auto">
        {rows.slice(0, 40).map((row, index) => (
          <div key={row.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-bold text-indigo-700">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-slate-900">{row.baseProductName}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{row.combinationName}</p>
            </div>
            <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{number(row.units)}x</span>
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-slate-400">No hi ha combinacions amb aquests filtres.</p>}
      </div>
    </div>
  );
}

function buildProductRanking(slices: ProductSalesSlice[], query: string) {
  const matchingBaseIds = new Set(
    slices
      .filter((slice) => slice.kind === "product")
      .filter((slice) => !query || normalize(`${slice.baseProductName} ${slice.baseCategoryName}`).includes(query))
      .map((slice) => slice.baseProductId),
  );
  const map = new Map<string, ProductRankingRow>();
  for (const slice of slices) {
    if (!matchingBaseIds.has(slice.baseProductId)) continue;
    const row = map.get(slice.baseProductId) ?? {
      id: slice.baseProductId,
      name: slice.baseProductName,
      category: slice.baseCategoryName,
      units: 0,
      amount: 0,
      grossAmount: 0,
      extraAmount: 0,
      flavorUnits: 0,
      toppingUnits: 0,
      orderCount: 0,
    };
    row.amount += slice.amount;
    row.grossAmount += slice.grossAmount;
    if (slice.kind === "product") {
      row.units += slice.units;
      row.orderCount += slice.orderCount;
    } else {
      row.extraAmount += slice.amount;
      if (slice.kind === "flavor") row.flavorUnits += slice.units;
      if (slice.kind === "topping") row.toppingUnits += slice.units;
    }
    map.set(slice.baseProductId, row);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.amount - a.amount);
}

function buildModifierRanking(slices: ProductSalesSlice[], kind: ProductSalesSliceKind, query: string) {
  const map = new Map<string, ModifierRankingRow>();
  for (const slice of slices) {
    if (slice.kind !== kind) continue;
    if (query && !normalize(`${slice.itemName} ${slice.baseProductName} ${slice.itemCategoryName}`).includes(query)) continue;
    const key = `${slice.itemProductId}|${normalize(slice.itemName)}|${slice.baseProductId}`;
    const row = map.get(key) ?? {
      id: key,
      name: slice.itemName,
      baseProductName: slice.baseProductName,
      category: slice.itemCategoryName,
      units: 0,
      amount: 0,
      freeUnits: 0,
      paidUnits: 0,
      orderCount: 0,
    };
    row.units += slice.units;
    row.amount += slice.amount;
    row.freeUnits += slice.freeUnits;
    row.paidUnits += slice.paidUnits;
    row.orderCount += slice.orderCount;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.amount - a.amount);
}

function buildTimeline(slices: ProductSalesSlice[], mode: AnalysisMode, grouping: TimeGrouping, query: string) {
  const productBaseIds = mode === "products"
    ? new Set(
        slices
          .filter((slice) => slice.kind === "product")
          .filter((slice) => !query || normalize(`${slice.baseProductName} ${slice.baseCategoryName}`).includes(query))
          .map((slice) => slice.baseProductId),
      )
    : null;
  const targetKind = mode === "products" ? null : MODE_KIND[mode];
  const map = new Map<string, TimelineRow>();
  for (const slice of slices) {
    if (mode === "products") {
      if (!productBaseIds?.has(slice.baseProductId)) continue;
    } else {
      if (slice.kind !== targetKind) continue;
      if (query && !normalize(`${slice.itemName} ${slice.baseProductName} ${slice.itemCategoryName}`).includes(query)) continue;
    }
    const period = timelinePeriod(slice.businessDate, slice.timeSlot, grouping);
    const name = mode === "products" ? slice.baseProductName : slice.itemName;
    const context = mode === "products" ? slice.baseCategoryName : slice.baseProductName;
    const entityId = mode === "products" ? slice.baseProductId : `${slice.itemProductId}|${normalize(slice.itemName)}|${slice.baseProductId}`;
    const key = `${period.key}|${entityId}`;
    const row = map.get(key) ?? {
      id: key,
      periodKey: period.key,
      periodLabel: period.label,
      name,
      context,
      units: 0,
      amount: 0,
      grossAmount: 0,
      extraAmount: 0,
      freeUnits: 0,
      paidUnits: 0,
      orderCount: 0,
    };
    row.amount += slice.amount;
    row.grossAmount += slice.grossAmount;
    row.freeUnits += slice.freeUnits;
    row.paidUnits += slice.paidUnits;
    if (mode === "products") {
      if (slice.kind === "product") {
        row.units += slice.units;
        row.orderCount += slice.orderCount;
      } else {
        row.extraAmount += slice.amount;
      }
    } else {
      row.units += slice.units;
      row.orderCount += slice.orderCount;
      row.extraAmount += slice.amount;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.periodKey.localeCompare(a.periodKey) || b.amount - a.amount);
}

function buildCombinationRanking(
  combinations: ProductModifierCombination[],
  category: string,
  baseProduct: string,
  fromSlot: string,
  toSlot: string,
  query: string,
) {
  const map = new Map<string, { id: string; baseProductName: string; combinationName: string; units: number }>();
  for (const combination of combinations) {
    if (category !== "all" && combination.baseCategoryName !== category) continue;
    if (baseProduct !== "all" && combination.baseProductId !== baseProduct) continue;
    if (!isSlotInRange(combination.timeSlot, fromSlot, toSlot)) continue;
    if (query && !normalize(`${combination.baseProductName} ${combination.combinationName}`).includes(query)) continue;
    const key = `${combination.baseProductId}|${normalize(combination.combinationName)}`;
    const row = map.get(key) ?? {
      id: key,
      baseProductName: combination.baseProductName,
      combinationName: combination.combinationName,
      units: 0,
    };
    row.units += combination.units;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || a.combinationName.localeCompare(b.combinationName, "ca"));
}

function timelinePeriod(date: string, slot: string, grouping: TimeGrouping) {
  if (grouping === "day") return { key: date, label: shortDate(date) };
  if (grouping === "hour") {
    const hour = `${slot.slice(0, 2)}:00`;
    return { key: `${date} ${hour}`, label: `${shortDate(date)} · ${hour}` };
  }
  return { key: `${date} ${slot}`, label: `${shortDate(date)} · ${slot}` };
}

function isSlotInRange(slot: string, from: string, to: string) {
  const index = BUSINESS_SLOTS.indexOf(slot);
  const fromIndex = BUSINESS_SLOTS.indexOf(from);
  const toIndex = BUSINESS_SLOTS.indexOf(to);
  if (index < 0 || fromIndex < 0 || toIndex < 0) return true;
  return fromIndex <= toIndex
    ? index >= fromIndex && index <= toIndex
    : index >= fromIndex || index <= toIndex;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 flex-1 rounded-md px-3 py-2 text-[12px] font-bold transition lg:flex-none ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {children}
    </button>
  );
}

function ExportButton({
  label,
  icon,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {loading ? "Preparant..." : label}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-400"
      >
        {children}
      </select>
    </label>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center gap-1.5 text-slate-500">{icon}<span className="text-[10px] font-bold uppercase">{label}</span></div>
      <p className="mt-1.5 text-[19px] font-bold text-slate-950">{value}</p>
    </div>
  );
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function sum<T extends Record<"units", number>>(rows: T[], key: "units") {
  return rows.reduce((total, row) => total + row[key], 0);
}

function number(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function modeLabel(mode: AnalysisMode) {
  if (mode === "flavors") return "Sabors";
  if (mode === "toppings") return "Toppings i extres";
  return "Productes complets";
}

function groupingLabel(grouping: TimeGrouping) {
  if (grouping === "half-hour") return "30 minuts";
  if (grouping === "hour") return "Hora";
  return "Dia";
}

function roundExport(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvCell).join(";"),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function csvCell(value: string | number) {
  const text = typeof value === "number" ? String(value).replace(".", ",") : String(value ?? "");
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
