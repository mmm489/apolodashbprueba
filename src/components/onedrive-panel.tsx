"use client";

import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

type OneDriveStatus = {
  available?: boolean;
  configured?: boolean;
  connected?: boolean;
  folderName?: string;
  folderWebUrl?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  reason?: string;
  error?: string;
};

type SyncResult = {
  ok?: boolean;
  alreadyRunning?: boolean;
  processed?: number;
  duplicated?: number;
  skipped?: number;
  error?: string;
};

export function OneDrivePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OneDriveStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/onedrive/status", { cache: "no-store" });
      const payload = (await response.json()) as OneDriveStatus;
      setStatus(payload);
      if (!response.ok) setError(payload.error ?? "No se ha podido consultar OneDrive.");
    } catch (requestError) {
      setError(describeError(requestError));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const result = searchParams.get("onedrive");
    const queryMessage = searchParams.get("message");
    if (result === "connected") setMessage("OneDrive conectado. La carpeta de facturas ya esta preparada.");
    if (result === "error" || result === "configuration-error") {
      setError(queryMessage ?? "No se ha podido conectar OneDrive.");
    }
  }, [searchParams]);

  function syncNow() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/onedrive/sync", { method: "POST" });
        const payload = (await response.json()) as SyncResult;
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "No se ha podido procesar OneDrive.");

        setMessage(
          payload.alreadyRunning
            ? "Ya hay una sincronizacion en curso."
            : `${payload.processed ?? 0} nuevas, ${payload.duplicated ?? 0} ya existentes y ${payload.skipped ?? 0} omitidas.`,
        );
        await loadStatus();
        router.refresh();
      } catch (requestError) {
        setError(describeError(requestError));
      }
    });
  }

  function disconnect() {
    if (!window.confirm("Desconectar OneDrive? Las facturas ya importadas se conservaran.")) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/onedrive/status", { method: "DELETE" });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "No se ha podido desconectar OneDrive.");
        setMessage("OneDrive desconectado. Las facturas importadas siguen en el dashboard.");
        await loadStatus();
      } catch (requestError) {
        setError(describeError(requestError));
      }
    });
  }

  if (!status) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-slate-50 p-4 text-[13px] text-slate-600">
        <LoaderCircle className="size-5 animate-spin text-indigo-600" />
        Comprovant la connexio amb OneDrive...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-start gap-4">
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${status.connected ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
            {status.connected ? <FolderOpen className="size-6" /> : <Cloud className="size-6" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold text-slate-900">
                {status.connected ? "Carpeta automatica conectada" : "Conectar OneDrive personal"}
              </p>
              {status.connected ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Actiu</span>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
              {status.connected
                ? "Sube facturas a Apps / Apolo Dashboard / Facturas pendientes. Las subcarpetas tambien se procesan y los duplicados se ignoran."
                : status.reason ?? "Autoriza tu cuenta una sola vez y el dashboard creara una carpeta privada para facturas."}
            </p>
            {status.connected ? (
              <p className="mt-2 text-[12px] text-slate-500">
                Ultima lectura: <span className="font-medium text-slate-700">{formatDate(status.lastSyncAt)}</span>
                {status.lastSuccessAt ? ` · Ultima correcta: ${formatDate(status.lastSuccessAt)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!status.connected ? (
            <a
              href="/api/onedrive/connect"
              aria-disabled={!status.configured}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition ${status.configured ? "bg-sky-600 hover:bg-sky-700" : "pointer-events-none bg-slate-300"}`}
            >
              <Cloud className="size-4" />
              Conectar OneDrive
            </a>
          ) : (
            <>
              {status.folderWebUrl ? (
                <a
                  href={status.folderWebUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ExternalLink className="size-4" />
                  Obrir carpeta
                </a>
              ) : null}
              <button
                type="button"
                onClick={syncNow}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Processar ara
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={isPending}
                title="Desconnectar OneDrive"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <Unplug className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-[13px] text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      ) : null}
      {error || status.lastError ? (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-[13px] text-rose-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error ?? status.lastError}
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Encara no processat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado con OneDrive.";
}
