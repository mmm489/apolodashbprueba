import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { SectionCard } from "@/components/section-card";
import { UploadPanel } from "@/components/upload-panel";
import { getFinancialWorkspace } from "@/lib/analytics";

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspace = await getFinancialWorkspace({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });

  const statusColors: Record<string, string> = {
    validated: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
  };

  return (
    <AppFrame
      title="Documents i carrega"
      description="Centre documental per pujar PDFs, revisar estat i controlar el pipeline d'analisi."
    >
      <DateFilterBar preset={workspace.filter.preset} from={workspace.filter.from} to={workspace.filter.to} />

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Pujada directa" eyebrow="Carrega" description="Arrossega factures, vendes, nomines o banc per processar-los al moment.">
          <UploadPanel />
        </SectionCard>

        <SectionCard title="Historial documental" eyebrow="Seguiment" description="Llistat de documents processats dins del rang actiu.">
          <div className="stagger-children space-y-2">
            {workspace.snapshot.documents.map((document) => (
              <div key={document.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800">{document.fileName}</p>
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusColors[document.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {document.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-[12px] text-slate-500">{document.documentType}</span>
                  <span className="text-slate-300">·</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${document.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {(document.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {document.errorMessage ? (
                  <p className="mt-2 text-[12px] text-rose-600">{document.errorMessage}</p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </AppFrame>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
