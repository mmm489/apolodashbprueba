"use client";

import { CheckCircle2, FileUp, LoaderCircle, XCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

type UploadResult = {
  ok?: boolean;
  uploaded?: number;
  processed?: Array<{
    fileName: string;
    duplicated: boolean;
    status: string;
    documentType: string;
    error?: string;
  }>;
  error?: string;
};

export function UploadPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalSizeLabel = useMemo(() => {
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    return new Intl.NumberFormat("es-ES", {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 2,
    }).format(bytes / 1024 / 1024);
  }, [files]);

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const allowedExtensions = [".pdf", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp"];
    setFiles(
      Array.from(fileList).filter((file) => {
        const lower = file.name.toLowerCase();
        return allowedExtensions.some((ext) => lower.endsWith(ext));
      }),
    );
    setResult(null);
  }

  function upload() {
    if (!files.length) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        files.forEach((file) => {
          formData.append("files", file);
        });

        const response = await fetch("/api/ingest/upload", {
          method: "POST",
          body: formData,
        });

        const text = await response.text();
        let payload: UploadResult;
        try {
          payload = text ? (JSON.parse(text) as UploadResult) : { error: "La resposta del servidor ha arribat buida." };
        } catch {
          payload = { ok: false, error: `Resposta inesperada del servidor (status ${response.status}): ${text.slice(0, 200)}` };
        }

        setResult(payload);

        if (response.ok) {
          setFiles([]);
        }
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Error inesperat en pujar i analitzar els documents.",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        htmlFor="pdf-upload"
        className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center transition-all hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <FileUp className="size-6" />
        </div>
        <p className="mt-4 text-[15px] font-semibold text-slate-800">Arrossega documents o fotos de factures</p>
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
          Puja factures, informes de vendes en PDF, Excel o imatge (JPG, PNG), nomines o extractes bancaris per processar-los.
        </p>
        <input id="pdf-upload" type="file" accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => onFilesSelected(event.target.files)} />
      </label>

      {/* Batch info */}
      <div className="rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lot actual</p>
            <p className="mt-1 text-[15px] font-semibold text-slate-900">
              {files.length ? `${files.length} fitxer${files.length > 1 ? "s" : ""}` : "Cap fitxer seleccionat"}
            </p>
            <p className="text-[12px] text-slate-500">{files.length ? totalSizeLabel : "Selecciona documents per analitzar-los."}</p>
          </div>
          <button
            type="button"
            onClick={upload}
            disabled={isPending || !files.length}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            Pujar i analitzar
          </button>
        </div>

        {files.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((file) => (
              <span key={`${file.name}-${file.size}`} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-600">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Result */}
      {result ? (
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resultat</p>
          {result.error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3">
              <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <p className="text-[13px] text-rose-700">{result.error}</p>
            </div>
          ) : null}
          {result.processed?.length ? (
            <div className="stagger-children mt-3 space-y-2">
              {result.processed.map((item) => (
                <div key={item.fileName} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-slate-50/50 p-3 transition hover:bg-white">
                  <div className="flex items-center gap-2">
                    {item.status === "validated" ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : item.status === "error" ? (
                      <XCircle className="size-4 text-rose-500" />
                    ) : (
                      <LoaderCircle className="size-4 text-amber-500" />
                    )}
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">{item.fileName}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.duplicated ? "Ja existia" : "Nou"} | {item.documentType}
                      </p>
                      {item.error ? <p className="mt-1 text-[11px] text-rose-600">{item.error}</p> : null}
                    </div>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                    item.status === "validated"
                      ? "bg-emerald-50 text-emerald-700"
                      : item.status === "error"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
