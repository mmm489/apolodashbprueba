import { cn } from "@/lib/utils";

const tones = {
  accent: {
    bg: "bg-gradient-to-br from-indigo-50 to-violet-50",
    icon: "bg-indigo-100 text-indigo-600",
    border: "border-indigo-100",
  },
  neutral: {
    bg: "bg-white",
    icon: "bg-slate-100 text-slate-600",
    border: "border-[var(--line)]",
  },
  success: {
    bg: "bg-gradient-to-br from-emerald-50 to-teal-50",
    icon: "bg-emerald-100 text-emerald-600",
    border: "border-emerald-100",
  },
  warning: {
    bg: "bg-gradient-to-br from-amber-50 to-orange-50",
    icon: "bg-amber-100 text-amber-600",
    border: "border-amber-100",
  },
  danger: {
    bg: "bg-gradient-to-br from-red-50 to-rose-50",
    icon: "bg-red-100 text-red-600",
    border: "border-red-100",
  },
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: keyof typeof tones;
}) {
  const t = tones[tone];

  return (
    <article
      className={cn(
        "group rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        t.bg,
        t.border,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500">{title}</span>
        <span className={cn("rounded-xl p-2", t.icon)}>
          {icon}
        </span>
      </div>
      <p className="mt-4 text-[28px] font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
    </article>
  );
}
