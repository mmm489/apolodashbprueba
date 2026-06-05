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
  const activeOrders = orders.filter((order) => order.status !== "cancelled" && order.paymentMethod !== "aparcat");
  const activeLines = lines.filter((line) => line.status !== "cancelled" && line.paymentMethod !== "aparcat");
  const totalBase = activeOrders.reduce((sum, order) => sum + order.base, 0);
  const totalWithVat = activeOrders.reduce((sum, order) => sum + order.total, 0);
  const averageTicket = activeOrders.length > 0 ? totalBase / activeOrders.length : 0;
  const cancelledOrders = orders.filter((order) => order.status === "cancelled").length;
  const parkedOrders = orders.filter((order) => order.paymentMethod === "aparcat" && order.status !== "cancelled").length;

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

      {parkedOrders > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Hi ha {parkedOrders} comanda{parkedOrders === 1 ? "" : "s"} aparcada
          {parkedOrders === 1 ? "" : "s"} en aquest període. Es mostren a la llista, però no compten com a venda fins que es cobrin.
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
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Historial de comandes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cada comanda surt en una línia. Obre-la per revisar productes, sabors i complements.
            </p>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.25fr_1.25fr_0.9fr_1fr_1fr_170px] gap-4 border-b border-[var(--line)] bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                <div>Comanda</div>
                <div>Data</div>
                <div>Items</div>
                <div>Pagament</div>
                <div className="text-right">Total</div>
                <div className="text-right">Detall</div>
              </div>

              <div className="divide-y divide-slate-100">
                {orders.slice(0, 160).map((order) => (
                  <details key={order.id} className="group bg-white open:bg-slate-50/40">
                    <summary className="grid cursor-pointer list-none grid-cols-[1.25fr_1.25fr_0.9fr_1fr_1fr_170px] items-center gap-4 px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-black tracking-tight text-slate-950">
                            {order.orderNumber}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                        {order.invoiceNumber && (
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                            {order.invoiceNumber}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">
                          {formatDate(order.businessDate)} · {order.orderTime}
                        </p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {order.employeeName || "Sense empleat"}
                          {order.tableNumber ? ` · Taula ${order.tableNumber}` : ""}
                        </p>
                      </div>

                      <div>
                        <p className="font-bold text-slate-900">{orderItemLabel(order)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{modifierLabel(order)}</p>
                      </div>

                      <div>
                        <PaymentBadge method={order.paymentMethod} />
                      </div>

                      <div className="text-right">
                        <p className="text-xl font-black tabular-nums text-slate-950">{euro(order.total)}</p>
                        <p className="text-xs font-semibold text-slate-500">{euro(order.base)} s/IVA</p>
                      </div>

                      <div className="text-right">
                        <span className="inline-flex min-w-[130px] justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition group-open:bg-slate-950 group-open:text-white">
                          <span className="group-open:hidden">Ver items</span>
                          <span className="hidden group-open:inline">Ocultar</span>
                        </span>
                      </div>
                    </summary>

                    <div className="border-t border-slate-100 bg-slate-50/70 px-5 pb-5 pt-2">
                      <div className="rounded-2xl border border-slate-200 bg-white">
                        <div className="grid grid-cols-[1fr_110px_120px_120px] gap-4 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                          <div>Producte</div>
                          <div className="text-right">Qty</div>
                          <div className="text-right">Base</div>
                          <div className="text-right">Total</div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {order.lines.map((line) => (
                            <div key={line.id} className="px-4 py-3">
                              <div className="grid grid-cols-[1fr_110px_120px_120px] items-start gap-4">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-950">{line.displayName}</p>
                                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                                    {line.categoryName || "Sense categoria"} · IVA {fmtNum(line.vatRate)}%
                                  </p>
                                  {line.visibleNote && (
                                    <p className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                      Nota: {line.visibleNote}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right font-bold tabular-nums text-slate-900">
                                  {fmtQty(line.qty)}
                                </div>
                                <div className="text-right font-semibold tabular-nums text-slate-600">
                                  {euro(line.lineBase)}
                                </div>
                                <div className="text-right font-black tabular-nums text-slate-950">
                                  {euro(line.lineTotal)}
                                </div>
                              </div>

                              {line.modifiers.length > 0 && (
                                <div className="mt-3 ml-4 border-l-2 border-indigo-200 pl-3">
                                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Complements d'aquest producte
                                  </p>
                                  <div className="space-y-1.5">
                                    {line.modifiers.map((modifier) => (
                                      <div
                                        key={modifier.id}
                                        className="grid grid-cols-[1fr_110px_120px_120px] items-center gap-4 rounded-xl bg-slate-50 px-3 py-2"
                                      >
                                        <p className="min-w-0 truncate text-sm font-semibold text-slate-700">
                                          + {modifier.displayName}
                                        </p>
                                        <p className="text-right text-sm font-bold tabular-nums text-slate-700">
                                          {fmtQty(modifier.qty)}
                                        </p>
                                        <p className="text-right text-sm font-semibold tabular-nums text-slate-500">
                                          {euro(modifier.lineBase)}
                                        </p>
                                        <p className="text-right text-sm font-bold tabular-nums text-slate-700">
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
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
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

function orderItemLabel(order: OrderGroup) {
  const count = order.lines.length;
  return `${fmtNum(count)} producte${count === 1 ? "" : "s"}`;
}

function modifierLabel(order: OrderGroup) {
  const count = order.lines.reduce((sum, line) => sum + line.modifiers.length, 0);
  if (count === 0) return "Sense complements";
  return `${fmtNum(count)} complement${count === 1 ? "" : "s"}`;
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
    manual: "Targeta",
    aparcat: "Aparcat",
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
