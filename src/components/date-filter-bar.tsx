"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Calendar } from "lucide-react";

const presets = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "month", label: "Este mes" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
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

  function updateParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      params.set(key, value);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-1.5">
          <Calendar className="mr-1 size-4 text-slate-400" />
          {presets.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => updateParams({ preset: item.value })}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                preset === item.value
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="date"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
          />
          <span className="hidden text-slate-300 sm:inline">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
          />
          <button
            type="button"
            onClick={() => updateParams({ preset: "custom", from: customFrom, to: customTo })}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-slate-800"
          >
            Aplicar
          </button>
        </div>
      </div>
    </section>
  );
}
