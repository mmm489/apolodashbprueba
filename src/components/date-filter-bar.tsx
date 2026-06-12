"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Calendar, ChevronRight } from "lucide-react";

import { formatDashboardDate } from "@/lib/timezone";

const presets = [
  { value: "today", label: "Avui" },
  { value: "yesterday", label: "Ahir" },
  { value: "7d", label: "7 dies" },
  { value: "30d", label: "30 dies" },
  { value: "90d", label: "90 dies" },
  { value: "month", label: "Aquest mes" },
  { value: "year", label: "Aquest any" },
];

export function DateFilterBar({
  preset,
  from,
  to,
}: {
  preset: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(preset === "custom");

  function updateParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      params.set(key, value);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  function selectPreset(value: string) {
    setShowCustom(false);
    updateParams({ preset: value });
  }

  function applyCustom() {
    updateParams({ preset: "custom", from: customFrom, to: customTo });
  }

  const fromLabel = formatDateLabel(from);
  const toLabel = formatDateLabel(to);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Presets */}
        <div className="flex items-center gap-1">
          <Calendar className="mr-1.5 size-4 text-indigo-500" />
          {presets.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => selectPreset(item.value)}
              className={`cursor-pointer rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                preset === item.value && !showCustom
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className={`cursor-pointer rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ${
              showCustom || preset === "custom"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            Personalitzat
          </button>
        </div>

        {/* Date range display */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
          <span className="text-[13px] font-medium text-slate-600">{fromLabel}</span>
          <ChevronRight className="size-3 text-slate-400" />
          <span className="text-[13px] font-medium text-slate-600">{toLabel}</span>
        </div>
      </div>

      {/* Custom date picker - expandable */}
      {showCustom && (
        <div className="border-t border-[var(--line)] bg-slate-50/50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Data inici</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Data fi</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={applyCustom}
                className="cursor-pointer rounded-xl bg-indigo-600 px-6 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-700 active:scale-[0.97]"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDateLabel(dateStr: string) {
  return formatDashboardDate(dateStr, "ca-ES", { day: "numeric", month: "short", year: "numeric" });
}
