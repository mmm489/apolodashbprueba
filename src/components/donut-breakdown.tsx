export function DonutBreakdown({
  items,
}: {
  items: Array<{ label: string; amount: number }>;
}) {
  const palette = ["#6366f1", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#6ee7b7"];
  const total = items.reduce((sum, item) => sum + item.amount, 0) || 1;
  const stops = items.slice(0, 8).reduce<string[]>((acc, item, index) => {
    const consumed = items.slice(0, index).reduce((sum, entry) => sum + entry.amount, 0);
    const start = (consumed / total) * 100;
    const end = ((consumed + item.amount) / total) * 100;
    acc.push(`${palette[index % palette.length]} ${start}% ${end}%`);
    return acc;
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="stagger-children grid gap-2 sm:grid-cols-2">
        {items.slice(0, 8).map((item, index) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/50 px-3 py-2.5 transition hover:bg-white hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-[13px] text-slate-700">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: palette[index % palette.length] }}
              />
              <span className="capitalize">{item.label.replaceAll("_", " ")}</span>
            </div>
            <span className="text-[13px] font-semibold text-slate-900">
              {Math.round((item.amount / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center rounded-xl border border-[var(--line)] bg-slate-50/50 p-6">
        <div
          className="relative size-[200px] rounded-full shadow-inner"
          style={{ background: `conic-gradient(${stops.join(",")})` }}
        >
          <div className="absolute inset-[32px] flex items-center justify-center rounded-full bg-white shadow-sm">
            <div className="text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Total</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{euro(total)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
