export function SalesBars({
  items,
}: {
  items: Array<{ label: string; valueA: number; valueB: number }>;
}) {
  const max = Math.max(...items.flatMap((item) => [item.valueA, item.valueB]), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-slate-900">Vendes comparades</h3>
        <div className="flex items-center gap-4 text-[12px] text-slate-500">
          <Legend color="bg-indigo-500" label="Marge" />
          <Legend color="bg-amber-400" label="Ingressos" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-5">
        <div className="flex h-[260px] items-end gap-3">
          {items.map((item) => (
            <div key={item.label} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[200px] items-end gap-1.5">
                <div
                  className="w-3.5 rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-300 group-hover:from-indigo-700 group-hover:to-indigo-500"
                  style={{ height: `${Math.max(8, (item.valueA / max) * 100)}%` }}
                />
                <div
                  className="w-3.5 rounded-t-md bg-gradient-to-t from-amber-500 to-amber-300 transition-all duration-300 group-hover:from-amber-600 group-hover:to-amber-400"
                  style={{ height: `${Math.max(8, (item.valueB / max) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-400 transition group-hover:text-slate-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
