"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, FileUp, LoaderCircle, Package, FileText, List, Trash2 } from "lucide-react";
import type { ExpenseRow, InvoiceSummary, ProductSpend } from "@/lib/analytics";
import { formatDashboardDate } from "@/lib/timezone";
import type { DocumentRecord } from "@/lib/types";

type Tab = "lineas" | "facturas" | "productos" | "documentos";

export function GastosTabs({
  rows,
  documents,
  invoices,
  products,
  totals,
}: {
  rows: ExpenseRow[];
  documents: DocumentRecord[];
  invoices: InvoiceSummary[];
  products: ProductSpend[];
  totals: { totalGross: number; totalVat: number };
}) {
  const [tab, setTab] = useState<Tab>("facturas");

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--line)]">
        <TabButton active={tab === "facturas"} onClick={() => setTab("facturas")} icon={<FileText className="h-4 w-4" />} label="Factures" count={invoices.length} />
        <TabButton active={tab === "lineas"} onClick={() => setTab("lineas")} icon={<List className="h-4 w-4" />} label="Linies" count={rows.length} />
        <TabButton active={tab === "productos"} onClick={() => setTab("productos")} icon={<Package className="h-4 w-4" />} label="Productes" count={products.length} />
        <TabButton active={tab === "documentos"} onClick={() => setTab("documentos")} icon={<FileUp className="h-4 w-4" />} label="Pujades" count={documents.length} />
      </div>

      <div className="p-5">
        {tab === "facturas" && <InvoicesTab invoices={invoices} />}
        {tab === "lineas" && <LinesTab rows={rows} totals={totals} />}
        {tab === "productos" && <ProductsTab products={products} />}
        {tab === "documentos" && <DocumentsTab documents={documents} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-[13px] font-semibold transition ${
        active
          ? "border-b-2 border-indigo-500 text-indigo-600"
          : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
        {count}
      </span>
    </button>
  );
}

/* ---- Facturas Tab ---- */
function InvoicesTab({ invoices }: { invoices: InvoiceSummary[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!invoices.length) {
    return <Empty text="No hi ha factures en aquest periode." />;
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const isOpen = expandedId === inv.id;
        return (
          <div key={inv.id} className="rounded-xl border border-[var(--line)] transition hover:shadow-sm">
            <button
              onClick={() => setExpandedId(isOpen ? null : inv.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">{inv.supplierName}</p>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700 shrink-0">
                    {euro(inv.totalAmount)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-500">
                  <span>{formatDate(inv.issueDate)}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{inv.category.replaceAll("_", " ")}</span>
                  <span>{inv.lineCount} {inv.lineCount === 1 ? "linia" : "linies"}</span>
                  {inv.taxAmount > 0 && <span>IVA: {euro(inv.taxAmount)}</span>}
                </div>
              </div>
            </button>

            {isOpen && inv.lines.length > 0 && (
              <div className="border-t border-[var(--line)] bg-slate-50/50 px-4 py-3">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Descripcio</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quant.</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">P.Unit</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Import</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((line, i) => (
                      <tr key={i} className="border-t border-[var(--line)]/50">
                        <td className="py-2 pr-3 text-[13px] text-slate-700">{line.lineDescription}</td>
                        <td className="py-2 pr-3 text-right text-[13px] text-slate-500">{line.quantity !== 1 ? fmtNum(line.quantity) : ""}</td>
                        <td className="py-2 pr-3 text-right text-[13px] text-slate-500">{line.unitPrice > 0 ? euro(line.unitPrice) : ""}</td>
                        <td className="py-2 text-right text-[13px] font-semibold text-slate-800">{euro(line.lineAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Lines Tab ---- */
function LinesTab({ rows, totals }: { rows: ExpenseRow[]; totals: { totalGross: number; totalVat: number } }) {
  if (!rows.length) {
    return <Empty text="No hi ha linies de despesa en aquest periode." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <Th>Data</Th>
            <Th>Proveidor</Th>
            <Th>Descripcio</Th>
            <Th align="right">Quant.</Th>
            <Th align="right">P. Unit.</Th>
            <Th align="right">Import</Th>
            <Th align="right">IVA</Th>
            <Th>Categoria</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.invoiceId}-${i}`} className="border-b border-[var(--line)] transition hover:bg-slate-50/80">
              <Td>{formatDate(row.issueDate)}</Td>
              <Td className="font-semibold text-slate-800">{row.supplierName}</Td>
              <Td className="max-w-[240px] truncate" title={row.lineDescription}>{row.lineDescription}</Td>
              <Td align="right">{row.quantity !== 1 ? fmtNum(row.quantity) : ""}</Td>
              <Td align="right">{row.unitPrice > 0 ? euro(row.unitPrice) : ""}</Td>
              <Td align="right" className="font-semibold text-slate-800">{euro(row.lineAmount)}</Td>
              <Td align="right">{row.vatAmount > 0 ? euro(row.vatAmount) : ""}</Td>
              <Td>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {row.category.replaceAll("_", " ")}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/50">
            <Td colSpan={5} className="font-semibold text-slate-600">Total</Td>
            <Td align="right" className="font-bold text-slate-900">{euro(totals.totalGross)}</Td>
            <Td align="right" className="font-bold text-slate-900">{euro(totals.totalVat)}</Td>
            <Td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---- Products Tab ---- */
function ProductsTab({ products }: { products: ProductSpend[] }) {
  if (!products.length) {
    return <Empty text="No hi ha productes desglossats. Les linies de factura apareixeran aqui." />;
  }

  const maxAmount = products[0]?.totalAmount ?? 1;

  return (
    <div className="space-y-2">
      {products.map((p) => (
        <div key={p.description} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-800 truncate">{p.description}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                <span>{fmtNum(p.totalQuantity)} uds</span>
                <span>·</span>
                <span>{p.occurrences} {p.occurrences === 1 ? "factura" : "factures"}</span>
                <span>·</span>
                <span>{p.suppliers.join(", ")}</span>
              </div>
            </div>
            <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700 shrink-0">
              {euro(p.totalAmount)}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all"
              style={{ width: `${(p.totalAmount / maxAmount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Documents Tab ---- */
function DocumentsTab({ documents }: { documents: DocumentRecord[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!documents.length) {
    return <Empty text="No hi ha pujades en aquest periode." />;
  }

  const sorted = [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function deleteDocument(document: DocumentRecord) {
    const ok = window.confirm(`Eliminar "${document.fileName}"?\n\nTambé s'eliminaran la factura i les línies extretes d'aquest fitxer.`);
    if (!ok) return;

    setDeletingId(document.id);
    setError(null);
    try {
      const response = await fetch(`/api/ingest/documents/${encodeURIComponent(document.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "No s'ha pogut eliminar el document.");
      }
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No s'ha pogut eliminar el document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>
      ) : null}
      {sorted.map((document) => (
        <div key={document.id} className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-800">{document.fileName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                <span>{formatDateTime(document.createdAt)}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                  {document.documentType}
                </span>
                <span>confiança {Math.round(document.confidence * 100)}%</span>
              </div>
              {document.errorMessage ? (
                <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  {document.errorMessage}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusClass(document.status)}`}>
                {statusLabel(document.status)}
              </span>
              <button
                type="button"
                onClick={() => deleteDocument(document)}
                disabled={deletingId === document.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === document.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Shared helpers ---- */
function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-slate-400">{text}</p>;
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`py-3 pr-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className, colSpan, title }: { children?: React.ReactNode; align?: "right"; className?: string; colSpan?: number; title?: string }) {
  return (
    <td colSpan={colSpan} title={title} className={`py-2.5 pr-3 text-[13px] text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string) {
  return formatDashboardDate(dateStr, "ca-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return formatDashboardDate(dateStr, "ca-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: DocumentRecord["status"]) {
  if (status === "validated") return "Validada";
  if (status === "error") return "Error";
  if (status === "processing") return "Processant";
  if (status === "extracted") return "Extreta";
  return "Rebuda";
}

function statusClass(status: DocumentRecord["status"]) {
  if (status === "validated") return "bg-emerald-50 text-emerald-700";
  if (status === "error") return "bg-rose-50 text-rose-700";
  if (status === "processing" || status === "extracted") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}
