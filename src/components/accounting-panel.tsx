"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  AccountingAccountType,
  AccountingJournalEntry,
  AccountingWorkspace,
  DateFilter,
} from "@/lib/types";

type Tab = "asientos" | "plan" | "banco" | "iva" | "cierres";
type ExportKind = "journal" | "ledger" | "trial-balance" | "pnl" | "vat" | "bank";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "asientos", label: "Asientos" },
  { id: "plan", label: "Plan contable" },
  { id: "banco", label: "Banco" },
  { id: "iva", label: "IVA" },
  { id: "cierres", label: "Cierres mensuales" },
];

const ACCOUNT_TYPES: Array<{ value: AccountingAccountType; label: string }> = [
  { value: "asset", label: "Activo" },
  { value: "liability", label: "Pasivo" },
  { value: "equity", label: "Patrimonio" },
  { value: "income", label: "Ingreso" },
  { value: "expense", label: "Gasto" },
];
const inputClass = "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10";

export function AccountingPanel({
  workspace,
  filter,
}: {
  workspace: AccountingWorkspace;
  filter: DateFilter;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("asientos");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const exportHref = (kind: ExportKind, format: "csv" | "xlsx") => {
    const params = new URLSearchParams({ from: filter.from, to: filter.to, kind, format });
    return `/api/accounting/export?${params.toString()}`;
  };

  function runJsonAction(label: string, url: string, body: Record<string, unknown>) {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || `Error en ${label}.`);
        return;
      }
      if (url.includes("generate")) {
        setMessage(`Borradores creados: ${data.created ?? 0}. Ya existentes: ${data.skipped ?? 0}.`);
      } else if (url.includes("entries")) {
        setMessage(`Asientos validados: ${data.validated ?? 0}.`);
      } else {
        setMessage(`${label} completado.`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <BookOpenCheck className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Contabilidad en revision</h2>
              <p className="text-sm text-slate-500">
                Genera asientos desde POS, facturas, pagos y nominas. Todo queda en borrador hasta validar.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => runJsonAction("Generar borradores", "/api/accounting/generate", { from: filter.from, to: filter.to })}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
              Generar borradores
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => runJsonAction("Validar asientos", "/api/accounting/entries", { from: filter.from, to: filter.to })}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" />
              Validar cuadrados
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Borradores" value={fmtNum(workspace.totals.draftEntries)} color="amber" />
          <Metric label="Validados" value={fmtNum(workspace.totals.validatedEntries)} color="emerald" />
          <Metric label="Bloqueados" value={fmtNum(workspace.totals.lockedEntries)} color="slate" />
          <Metric label="Descuadres" value={fmtNum(workspace.totals.unbalancedEntries)} color="rose" />
          <Metric label="Banco pendiente" value={fmtNum(workspace.totals.bankPending)} color="indigo" />
          <Metric label="Debe/Haber" value={`${euro(workspace.totals.debit)} / ${euro(workspace.totals.credit)}`} color="slate" />
        </div>
        {message && (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
            {message}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--line)] bg-white p-2 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-bold transition",
              tab === item.id ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "asientos" && <JournalTab entries={workspace.entries} exportHref={exportHref} />}
      {tab === "plan" && <AccountsTab workspace={workspace} isPending={isPending} setMessage={setMessage} />}
      {tab === "banco" && <BankTab workspace={workspace} filter={filter} exportHref={exportHref} setMessage={setMessage} />}
      {tab === "iva" && <VatTab workspace={workspace} exportHref={exportHref} />}
      {tab === "cierres" && <PeriodsTab workspace={workspace} filter={filter} runJsonAction={runJsonAction} isPending={isPending} />}
    </div>
  );
}

function JournalTab({
  entries,
  exportHref,
}: {
  entries: AccountingJournalEntry[];
  exportHref: (kind: ExportKind, format: "csv" | "xlsx") => string;
}) {
  const ledgerTotals = useMemo(() => {
    const rows = new Map<string, { name: string; debit: number; credit: number }>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const row = rows.get(line.accountCode) ?? { name: line.accountName, debit: 0, credit: 0 };
        row.debit += line.debit;
        row.credit += line.credit;
        rows.set(line.accountCode, row);
      }
    }
    return [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
  }, [entries]);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <HeaderRow
        title="Diario contable"
        description="Asientos generados en borrador desde los datos existentes del dashboard."
        actions={<ExportButtons exportHref={exportHref} kinds={["journal", "ledger", "trial-balance", "pnl"]} />}
      />
      {ledgerTotals.length > 0 && (
        <div className="grid gap-2 border-b border-[var(--line)] p-4 lg:grid-cols-4">
          {ledgerTotals.map(([code, row]) => (
            <div key={code} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-black text-slate-500">{code} · {row.name}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{euro(row.debit - row.credit)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <Th>Fecha</Th>
              <Th>Origen</Th>
              <Th>Descripcion</Th>
              <Th>Estado</Th>
              <Th align="right">Debe</Th>
              <Th align="right">Haber</Th>
              <Th>Lineas</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <JournalRow key={entry.id} entry={entry} />
            ))}
            {entries.length === 0 && <EmptyRow colSpan={7} text="No hay asientos en este periodo." />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function JournalRow({ entry }: { entry: AccountingJournalEntry }) {
  return (
    <tr className="border-b border-[var(--line)] align-top last:border-0 hover:bg-slate-50/70">
      <Td>
        <div className="font-bold text-slate-900">{entry.entryDate}</div>
        <div className="text-xs text-slate-400">{entry.period}</div>
      </Td>
      <Td>
        <div className="font-semibold text-slate-700">{sourceLabel(entry.sourceType)}</div>
        <div className="text-xs text-slate-400">{entry.sourceId}</div>
      </Td>
      <Td>
        <div className="font-semibold text-slate-900">{entry.description}</div>
        {!entry.isBalanced && <div className="mt-1 text-xs font-bold text-rose-600">Descuadrado</div>}
      </Td>
      <Td><StatusBadge status={entry.status} /></Td>
      <Td align="right" className="font-bold text-slate-900">{euro(entry.totalDebit)}</Td>
      <Td align="right" className="font-bold text-slate-900">{euro(entry.totalCredit)}</Td>
      <Td>
        <details>
          <summary className="cursor-pointer text-xs font-bold text-indigo-600">Ver lineas</summary>
          <div className="mt-2 space-y-1">
            {entry.lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[90px_1fr_90px_90px] gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                <span className="font-bold text-slate-600">{line.accountCode}</span>
                <span>{line.accountName}</span>
                <span className="text-right">{line.debit ? euro(line.debit) : ""}</span>
                <span className="text-right">{line.credit ? euro(line.credit) : ""}</span>
              </div>
            ))}
          </div>
        </details>
      </Td>
    </tr>
  );
}

function AccountsTab({
  workspace,
  isPending,
  setMessage,
}: {
  workspace: AccountingWorkspace;
  isPending: boolean;
  setMessage: (message: string | null) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountingAccountType>("expense");

  function saveAccount(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    fetch("/api/accounting/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, type }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "No se ha podido guardar la cuenta.");
        setCode("");
        setName("");
        setType("expense");
        setMessage("Cuenta guardada.");
        router.refresh();
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Error guardando cuenta."));
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={saveAccount} className="h-fit rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="size-5 text-slate-500" />
          <h3 className="text-lg font-black text-slate-950">Crear o editar cuenta</h3>
        </div>
        <div className="space-y-3">
          <Field label="Codigo">
            <input value={code} onChange={(event) => setCode(event.target.value)} className={inputClass} placeholder="629" />
          </Field>
          <Field label="Nombre">
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Otros servicios" />
          </Field>
          <Field label="Tipo">
            <select value={type} onChange={(event) => setType(event.target.value as AccountingAccountType)} className={inputClass}>
              {ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <button disabled={isPending} className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
            Guardar cuenta
          </button>
        </div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <HeaderRow title="Plan contable PGC basico" description="Cuentas principales para ventas, IVA, caja, banco, gastos y proveedores." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <Th>Codigo</Th>
                <Th>Nombre</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {workspace.accounts.map((account) => (
                <tr key={account.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/70">
                  <Td className="font-black text-slate-900">{account.code}</Td>
                  <Td>{account.name}</Td>
                  <Td>{accountTypeLabel(account.type)}</Td>
                  <Td>{account.isActive ? "Activa" : "Inactiva"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function BankTab({
  workspace,
  filter,
  exportHref,
  setMessage,
}: {
  workspace: AccountingWorkspace;
  filter: DateFilter;
  exportHref: (kind: ExportKind, format: "csv" | "xlsx") => string;
  setMessage: (message: string | null) => void;
}) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  async function uploadBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setMessage(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/accounting/bank/import", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se ha podido importar el banco.");
      setMessage(`Banco importado. Nuevos: ${data.inserted ?? 0}. Ya existentes/omitidos: ${data.skipped ?? 0}.`);
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error importando banco.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={uploadBank} className="h-fit rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Upload className="size-5 text-slate-500" />
          <h3 className="text-lg font-black text-slate-950">Importar extracto</h3>
        </div>
        <div className="space-y-3">
          <Field label="Cuenta">
            <input name="accountName" className={inputClass} defaultValue={workspace.bankAccounts[0]?.name ?? "Banco principal"} />
          </Field>
          <Field label="IBAN opcional">
            <input name="iban" className={inputClass} placeholder="ES..." />
          </Field>
          <Field label="Archivo CSV/XLSX">
            <input name="file" type="file" accept=".csv,.xlsx,.xls" className={inputClass} required />
          </Field>
          <button disabled={isUploading} className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {isUploading ? "Importando..." : "Subir extracto"}
          </button>
          <p className="text-xs text-slate-400">
            Columnas reconocidas: Fecha, Fecha valor, Concepto/Descripcion, Importe, Cargo/Abono.
          </p>
        </div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <HeaderRow
          title="Movimientos bancarios"
          description={`Extractos importados entre ${filter.from} y ${filter.to}. La conciliacion queda pendiente para revision.`}
          actions={<ExportButtons exportHref={exportHref} kinds={["bank"]} />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <Th>Fecha</Th>
                <Th>Descripcion</Th>
                <Th>Contraparte</Th>
                <Th>Estado</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {workspace.bankTransactions.map((tx) => (
                <tr key={tx.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/70">
                  <Td>{tx.transactionDate}</Td>
                  <Td className="font-semibold text-slate-900">{tx.description}</Td>
                  <Td>{tx.counterparty ?? "--"}</Td>
                  <Td><BankStatus status={tx.status} /></Td>
                  <Td align="right" className={tx.amount >= 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{euro(tx.amount)}</Td>
                </tr>
              ))}
              {workspace.bankTransactions.length === 0 && <EmptyRow colSpan={5} text="No hay movimientos bancarios importados." />}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function VatTab({ workspace, exportHref }: { workspace: AccountingWorkspace; exportHref: (kind: ExportKind, format: "csv" | "xlsx") => string }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="IVA repercutido" value={euro(workspace.vatSummary.outputVat)} color="amber" />
        <Metric label="IVA soportado" value={euro(workspace.vatSummary.inputVat)} color="emerald" />
        <Metric label="IVA a pagar" value={euro(workspace.vatSummary.payableVat)} color={workspace.vatSummary.payableVat >= 0 ? "rose" : "emerald"} />
      </div>
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <HeaderRow
          title="Resumen IVA"
          description="Calculado desde las lineas contables 477 y 472 dentro del periodo seleccionado."
          actions={<ExportButtons exportHref={exportHref} kinds={["vat"]} />}
        />
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Este resumen es preparatorio. La gestoria debe revisar criterios fiscales, deducibilidad y modelos oficiales.
        </p>
      </section>
    </section>
  );
}

function PeriodsTab({
  workspace,
  filter,
  runJsonAction,
  isPending,
}: {
  workspace: AccountingWorkspace;
  filter: DateFilter;
  runJsonAction: (label: string, url: string, body: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [period, setPeriod] = useState(filter.from.slice(0, 7));
  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="h-fit rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="size-5 text-slate-500" />
          <h3 className="text-lg font-black text-slate-950">Cerrar mes</h3>
        </div>
        <Field label="Periodo">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className={inputClass} />
        </Field>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runJsonAction("Cerrar periodo", "/api/accounting/periods", { period })}
          className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Bloquear asientos validados
        </button>
        <p className="mt-3 text-xs text-slate-400">
          Solo bloquea asientos ya validados del mes. Los borradores quedan pendientes de revision.
        </p>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <HeaderRow title="Periodos contables" description="Meses cerrados para evitar cambios accidentales." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <Th>Periodo</Th>
                <Th>Estado</Th>
                <Th>Cerrado</Th>
                <Th>Usuario</Th>
              </tr>
            </thead>
            <tbody>
              {workspace.periods.map((item) => (
                <tr key={item.period} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50/70">
                  <Td className="font-black text-slate-900">{item.period}</Td>
                  <Td><StatusBadge status={item.status === "closed" ? "locked" : "draft"} /></Td>
                  <Td>{item.closedAt ? new Date(item.closedAt).toLocaleString("es-ES") : "--"}</Td>
                  <Td>{item.closedBy ?? "--"}</Td>
                </tr>
              ))}
              {workspace.periods.length === 0 && <EmptyRow colSpan={4} text="Todavia no hay periodos cerrados." />}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function HeaderRow({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
      <div>
        <p className="text-[15px] font-black text-slate-950">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {actions}
    </div>
  );
}

function ExportButtons({ exportHref, kinds }: { exportHref: (kind: ExportKind, format: "csv" | "xlsx") => string; kinds: ExportKind[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((kind) => (
        <div key={kind} className="flex overflow-hidden rounded-xl border border-[var(--line)]">
          <a href={exportHref(kind, "xlsx")} className="inline-flex items-center gap-1 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <FileSpreadsheet className="size-3.5" /> {exportLabel(kind)}
          </a>
          <a href={exportHref(kind, "csv")} className="inline-flex items-center bg-slate-50 px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">
            <Download className="size-3.5" />
          </a>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, color = "slate" }: { label: string; value: string; color?: string }) {
  const colors: Record<string, string> = {
    amber: "border-l-amber-500",
    emerald: "border-l-emerald-500",
    indigo: "border-l-indigo-500",
    rose: "border-l-rose-500",
    slate: "border-l-slate-400",
  };
  return (
    <div className={cn("rounded-xl border border-[var(--line)] border-l-[3px] bg-white p-4 shadow-sm", colors[color] ?? colors.slate)}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "draft"
      ? "bg-amber-50 text-amber-700"
      : status === "validated"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-700";
  const label = status === "draft" ? "Borrador" : status === "validated" ? "Validado" : "Bloqueado";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", classes)}>{label}</span>;
}

function BankStatus({ status }: { status: string }) {
  const classes = status === "matched" ? "bg-emerald-50 text-emerald-700" : status === "ignored" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";
  const label = status === "matched" ? "Conciliado" : status === "ignored" ? "Ignorado" : "Pendiente";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", classes)}>{label}</span>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-8 text-center text-slate-400">{text}</td>
    </tr>
  );
}

function Th({ children, align }: { children: ReactNode; align?: "right" }) {
  return <th className={cn("px-5 py-3", align === "right" && "text-right")}>{children}</th>;
}

function Td({ children, align, className = "" }: { children: ReactNode; align?: "right"; className?: string }) {
  return <td className={cn("px-5 py-3 text-slate-600", align === "right" && "text-right", className)}>{children}</td>;
}

function sourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    sales_day: "Ventas POS",
    supplier_invoice: "Factura proveedor",
    supplier_payment: "Pago proveedor",
    payroll: "Nomina",
    bank: "Banco",
  };
  return labels[sourceType] ?? sourceType;
}

function accountTypeLabel(type: AccountingAccountType) {
  return ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? type;
}

function exportLabel(kind: ExportKind) {
  const labels: Record<ExportKind, string> = {
    journal: "Diario",
    ledger: "Mayor",
    "trial-balance": "Balance",
    pnl: "PyG",
    vat: "IVA",
    bank: "Banco",
  };
  return labels[kind];
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}
