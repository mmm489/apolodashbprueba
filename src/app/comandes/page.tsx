import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listPosOrderLines } from "@/lib/repositories";
import type { PosOrderLineRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderGroup = {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  status: string;
  paymentMethod: string;
  tableNumber: string | null;
  employeeName: string | null;
  businessDate: string;
  orderTime: string;
  total: number;
  base: number;
  vat: number;
  lines: GroupedLine[];
};

type GroupedLine = PosOrderLineRecord & {
  displayName: string;
  visibleNote: string | null;
  modifiers: Array<PosOrderLineRecord & { displayName: string; visibleNote: string | null }>;
};

export default async function ComandesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveDateFilter({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });
  const lines = await listPosOrderLines(filter.from, filter.to);
  const orders = groupOrders(lines);
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const activeLines = lines.filter((line) => line.status !== "cancelled");
  const totalBase = activeOrders.reduce((sum, order) => sum + order.base, 0);
  const totalWithVat = activeOrders.reduce((sum, order) => sum + order.total, 0);
  const averageTicket = activeOrders.length > 0 ? totalBase / activeOrders.length : 0;
  const cancelledOrders = orders.filter((order) => order.status === "cancelled").length;

  return (
    <AppFrame
      title="Comandes"
      description="Consulta de comandas i línies sincronitzades des del POS de la gelateria."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Comandes" value={fmtNum(activeOrders.length)} color="indigo" />
        <Metric label="Línies" value={fmtNum(activeLines.length)} color="slate" />
        <Metric label="Vendes s/IVA" value={euro(totalBase)} color="emerald" />
        <Metric label="Vendes amb IVA" value={euro(totalWithVat)} color="amber" />
        <Metric label="Tiquet mitjà s/IVA" value={euro(averageTicket)} color="violet" />
      </section>

      {cancelledOrders > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Hi ha {cancelledOrders} comanda{cancelledOrders === 1 ? "" : "s"} cancel·lada
          {cancelledOrders === 1 ? "" : "s"} en aquest període. Es mostren a la llista, però no compten als totals.
        </div>
      )}

      {orders.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">No hi ha comandes en aquest període</p>
          <p className="mt-2 text-sm text-slate-500">
            Quan el POS sincronitzi vendes, apareixeran aquí amb les seves línies.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            {orders.slice(0, 80).map((order) => (
              <article
                key={order.id}
                className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold tracking-tight text-slate-950">
                        {order.orderNumber}
                      </h2>
                      <StatusBadge status={order.status} />
                      <PaymentBadge method={order.paymentMethod} />
                      {order.tableNumber && (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                          Taula {order.tableNumber}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {formatDate(order.businessDate)} · {order.orderTime}
                      {order.employeeName ? ` · ${order.employeeName}` : ""}
                      {order.invoiceNumber ? ` · ${order.invoiceNumber}` : ""}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</p>
                    <p className="text-2xl font-black tabular-nums text-slate-950">{euro(order.total)}</p>
                    <p className="text-xs font-semibold text-slate-500">{euro(order.base)} s/IVA</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {order.lines.map((line) => (
                    <div key={line.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[15px] font-bold text-slate-900">
                            {fmtQty(line.qty)}x {line.displayName}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {line.categoryName || "Sense categoria"} · IVA {fmtNum(line.vatRate)}%
                          </p>
                          {line.visibleNote && (
                            <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                              Nota: {line.visibleNote}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {euro(line.lineTotal)}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {euro(line.lineBase)} s/IVA
                          </p>
                        </div>
                      </div>

                      {line.modifiers.length > 0 && (
                        <div className="mt-3 border-l-2 border-indigo-200 pl-3">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Complements
                          </p>
                          <div className="space-y-1.5">
                            {line.modifiers.map((modifier) => (
                              <div
                                key={modifier.id}
                                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                              >
                                <p className="min-w-0 truncate text-sm font-semibold text-slate-700">
                                  + {fmtQty(modifier.qty)}x {modifier.displayName}
                                </p>
                                <p className="shrink-0 text-sm font-bold tabular-nums text-slate-700">
                                  {euro(modifier.lineTotal)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-950">Línies de comanda</h2>
              <p className="mt-1 text-sm text-slate-500">
                Vista plana per revisar imports, quantitats i productes.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <Th>Data</Th>
                    <Th>Comanda</Th>
                    <Th>Producte</Th>
                    <Th>Categoria</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Preu u.</Th>
                    <Th align="right">Base</Th>
                    <Th align="right">IVA</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.slice(0, 400).map((line) => (
                    <tr key={line.id} className={line.status === "cancelled" ? "bg-rose-50/50 text-slate-400" : ""}>
                      <Td>
                        <div className="font-semibold text-slate-900">{formatDate(line.businessDate)}</div>
                        <div className="text-xs text-slate-500">{line.orderTime}</div>
                      </Td>
                      <Td>
                        <div className="font-bold text-slate-900">{line.orderNumber}</div>
                        <div className="text-xs text-slate-500">{statusLabel(line.status)}</div>
                      </Td>
                      <Td>
                        <div className="max-w-[280px] truncate font-semibold text-slate-900">{displayLineName(line)}</div>
                        {visibleNote(line.notes) && (
                          <div className="max-w-[280px] truncate text-xs text-amber-700">{visibleNote(line.notes)}</div>
                        )}
                      </Td>
                      <Td>{line.categoryName || "-"}</Td>
                      <Td align="right">{fmtQty(line.qty)}</Td>
                      <Td align="right">{euro(line.unitPrice)}</Td>
                      <Td align="right">{euro(line.lineBase)}</Td>
                      <Td align="right">{euro(line.lineVat)}</Td>
                      <Td align="right" className="font-bold text-slate-900">{euro(line.lineTotal)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppFrame>
  );
}

function groupOrders(lines: PosOrderLineRecord[]): OrderGroup[] {
  const byOrder = new Map<string, PosOrderLineRecord[]>();
  for (const line of lines) {
    const list = byOrder.get(line.orderId) ?? [];
    list.push(line);
    byOrder.set(line.orderId, list);
  }

  return Array.from(byOrder.entries()).map(([orderId, orderLines]) => {
    const first = orderLines[0];
    const grouped = groupLines(orderLines);
    return {
      id: orderId,
      orderNumber: first.orderNumber,
      invoiceNumber: first.invoiceNumber,
      status: first.status,
      paymentMethod: first.paymentMethod,
      tableNumber: first.tableNumber,
      employeeName: first.employeeName,
      businessDate: first.businessDate,
      orderTime: first.orderTime,
      total: first.orderTotal,
      base: first.orderBase,
      vat: first.orderVat,
      lines: grouped,
    };
  });
}

function groupLines(lines: PosOrderLineRecord[]): GroupedLine[] {
  const bases: GroupedLine[] = [];
  const modifiers: PosOrderLineRecord[] = [];

  lines.forEach((line) => {
    if (modifierParent(line.notes)) modifiers.push(line);
    else {
      bases.push({
        ...line,
        displayName: displayLineName(line),
        visibleNote: visibleNote(line.notes),
        modifiers: [],
      });
    }
  });

  modifiers.forEach((modifier) => {
    const parentLineId = noteMarker(modifier.notes, "HC-PARENT-LINE:");
    const parentName = modifierParent(modifier.notes);
    const target =
      (parentLineId && bases.find((base) => noteMarker(base.notes, "HC-LINE:") === parentLineId)) ||
      [...bases].reverse().find((base) => normalise(base.productName) === normalise(parentName));

    const displayModifier = {
      ...modifier,
      displayName: displayLineName(modifier),
      visibleNote: visibleNote(modifier.notes),
    };

    if (target) target.modifiers.push(displayModifier);
    else {
      bases.push({
        ...modifier,
        displayName: displayLineName(modifier),
        visibleNote: visibleNote(modifier.notes),
        modifiers: [],
      });
    }
  });

  return bases;
}

function displayLineName(line: PosOrderLineRecord) {
  const display = noteDisplayName(line.notes);
  return display || line.productName;
}

function modifierParent(notes: string | null) {
  const first = notes?.split(/\r?\n/, 1)[0]?.trim() || "";
  return first.toLowerCase().startsWith("per ") ? first.slice(4).trim() : null;
}

function noteDisplayName(notes: string | null) {
  return notes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("nom:"))
    ?.slice(4)
    .trim() || null;
}

function noteMarker(notes: string | null, marker: string) {
  const lower = marker.toLowerCase();
  const line = notes
    ?.split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith(lower));
  return line?.slice(marker.length).trim() || null;
}

function visibleNote(notes: string | null) {
  const hasParent = Boolean(modifierParent(notes));
  const visible = notes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index) => {
      if (!line) return false;
      if (index === 0 && hasParent) return false;
      if (/^HC[-_\s]*(PARENT[-_\s]*)?LINE\s*:?\s*/i.test(line)) return false;
      if (line.toLowerCase().startsWith("nom:")) return false;
      return true;
    })
    .join("\n")
    .trim();
  return visible || null;
}

function normalise(value: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "cancelled"
      ? "bg-rose-100 text-rose-700"
      : status === "completed"
        ? "bg-emerald-100 text-emerald-700"
        : status === "ready"
          ? "bg-blue-100 text-blue-700"
          : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>
      {statusLabel(status)}
    </span>
  );
}

function PaymentBadge({ method }: { method: string }) {
  return (
    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
      {paymentLabel(method)}
    </span>
  );
}

function Metric({ label, value, color = "indigo" }: { label: string; value: string; color?: string }) {
  const colors: Record<string, string> = {
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    indigo: "border-l-indigo-500",
    slate: "border-l-slate-400",
    violet: "border-l-violet-500",
  };
  return (
    <div className={`rounded-xl border border-[var(--line)] border-l-[3px] ${colors[color] ?? colors.indigo} bg-white p-4 shadow-sm`}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return <td className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendent",
    preparing: "Preparant",
    ready: "Llest",
    completed: "Completada",
    cancelled: "Cancel·lada",
  };
  return labels[status] ?? status;
}

function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    efectivo: "Efectiu",
    tarjeta: "Targeta",
    manual: "Manual",
  };
  return labels[method] ?? method;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ca-ES", {
    day: "2-digit",
    month: "short",
  });
}

function euro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function fmtQty(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
