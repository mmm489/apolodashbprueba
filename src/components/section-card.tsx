import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  title: string;
  eyebrow: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="mb-5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            {eyebrow}
          </span>
        </div>
        <h2 className="text-[20px] font-bold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="text-[13px] leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
