"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";

import type { Employee } from "@/lib/types";

type EmployeeForm = {
  name: string;
  hourlyCost: number;
  shiftStart: string;
  shiftEnd: string;
  workingDaysPerMonth: number;
  pin: string;
  role: "admin" | "employee";
  canAccessCashlogy: boolean;
  canAccessSupplierPayments: boolean;
  canAccessProducts: boolean;
};

const emptyForm: EmployeeForm = {
  name: "",
  hourlyCost: 0,
  shiftStart: "09:00",
  shiftEnd: "17:00",
  workingDaysPerMonth: 22,
  pin: "",
  role: "employee",
  canAccessCashlogy: false,
  canAccessSupplierPayments: false,
  canAccessProducts: false,
};

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "DEL"];

export function EmpleadosPanel({ employees, readOnly = false }: { employees: Employee[]; readOnly?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalEmployees = employees.length;
  const posMode = readOnly;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (posMode && !editingId && !/^\d{4}$/.test(form.pin)) {
      setMessage("Per crear un empleat POS cal un PIN de 4 numeros.");
      setLoading(false);
      return;
    }
    if (posMode && editingId && form.pin && !/^\d{4}$/.test(form.pin)) {
      setMessage("El PIN ha de tenir 4 numeros.");
      setLoading(false);
      return;
    }

    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { id: editingId, ...form } : form;

    const res = await fetch("/api/employees", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.error || "No s'ha pogut guardar.");
      setLoading(false);
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setMessage(posMode ? "Canvi enviat al POS. S'aplicara amb el sync de la heladeria." : "Empleat guardat.");
    router.refresh();
    setLoading(false);
  }

  function startEdit(emp: Employee) {
    setForm({
      name: emp.name,
      hourlyCost: emp.hourlyCost,
      shiftStart: emp.shiftStart,
      shiftEnd: emp.shiftEnd,
      workingDaysPerMonth: emp.workingDaysPerMonth,
      pin: "",
      role: emp.role === "admin" ? "admin" : "employee",
      canAccessCashlogy: emp.canAccessCashlogy ?? emp.role === "admin",
      canAccessSupplierPayments: emp.canAccessSupplierPayments ?? emp.role === "admin",
      canAccessProducts: emp.canAccessProducts ?? emp.role === "admin",
    });
    setEditingId(emp.id);
    setShowForm(true);
    setMessage(null);
  }

  async function handleDelete(id: string) {
    const text = posMode
      ? "Desactivar aquest empleat al POS?"
      : "Eliminar aquest empleat?";
    if (!confirm(text)) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "No s'ha pogut desactivar.");
      return;
    }
    setMessage(posMode ? "Desactivacio enviada al POS." : "Empleat eliminat.");
    router.refresh();
  }

  function pressPinKey(key: string) {
    if (key === "CLR") {
      setForm((current) => ({ ...current, pin: "" }));
      return;
    }
    if (key === "DEL") {
      setForm((current) => ({ ...current, pin: current.pin.slice(0, -1) }));
      return;
    }
    setForm((current) => ({ ...current, pin: `${current.pin}${key}`.slice(0, 4) }));
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <MiniCard label="Empleats actius" value={String(totalEmployees)} />
        <MiniCard
          label={posMode ? "Origen" : "Cost mitja/hora"}
          value={posMode ? "POS + sync" : totalEmployees > 0 ? `${(employees.reduce((s, e) => s + e.hourlyCost, 0) / totalEmployees).toFixed(2)} EUR/h` : "--"}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-slate-500">
            {totalEmployees} empleat{totalEmployees !== 1 ? "s" : ""} registrat{totalEmployees !== 1 ? "s" : ""}
          </p>
          {posMode && (
            <p className="mt-1 text-[12px] font-medium text-amber-700">
              Els canvis es publiquen al POS de la heladeria amb el sincronitzador.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(!showForm);
            setMessage(null);
          }}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus className="size-4" />
          {posMode ? "Nou empleat POS" : "Nou empleat"}
        </button>
      </div>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-slate-900">
                {editingId ? "Editar empleat" : "Nou empleat"}
              </p>
              {posMode && (
                <p className="mt-1 text-[12px] text-slate-500">
                  No es mostra el PIN actual. Escriu un PIN nou nomes si vols canviar-lo.
                </p>
              )}
            </div>
            {posMode && (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-700">
                POS
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-500">Nom</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                  placeholder="Nom de l'empleat"
                />
              </div>

              {posMode && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-slate-500">Rol</label>
                  <select
                    value={form.role}
                    onChange={(e) => {
                      const role = e.target.value === "admin" ? "admin" : "employee";
                      setForm({
                        ...form,
                        role,
                        canAccessCashlogy: role === "admin" ? true : form.canAccessCashlogy,
                        canAccessSupplierPayments: role === "admin" ? true : form.canAccessSupplierPayments,
                        canAccessProducts: role === "admin" ? true : form.canAccessProducts,
                      });
                    }}
                    className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                  >
                    <option value="employee">Empleado</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              )}

              {posMode && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
                    Accessos al menu del POS
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <AccessToggle
                      label="Cashlogy"
                      description="Backoffice i estat"
                      checked={form.canAccessCashlogy}
                      disabled={form.role === "admin"}
                      onChange={(checked) => setForm({ ...form, canAccessCashlogy: checked })}
                    />
                    <AccessToggle
                      label="Pagaments"
                      description="Pagaments proveidors"
                      checked={form.canAccessSupplierPayments}
                      disabled={form.role === "admin"}
                      onChange={(checked) => setForm({ ...form, canAccessSupplierPayments: checked })}
                    />
                    <AccessToggle
                      label="Productes"
                      description="Editor local POS"
                      checked={form.canAccessProducts}
                      disabled={form.role === "admin"}
                      onChange={(checked) => setForm({ ...form, canAccessProducts: checked })}
                    />
                  </div>
                  {form.role === "admin" && (
                    <p className="mt-3 text-[12px] font-medium text-emerald-700">
                      Els admins tenen tots els accessos activats.
                    </p>
                  )}
                </div>
              )}

              {!posMode && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-slate-500">Cost/hora (EUR)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.01}
                    value={form.hourlyCost}
                    onChange={(e) => setForm({ ...form, hourlyCost: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>

            {posMode && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound className="size-4 text-slate-500" />
                  <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
                    {editingId ? "Nou PIN opcional" : "PIN de 4 numeros"}
                  </p>
                </div>
                <div className="mb-3 flex justify-center gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl font-black ${
                        form.pin.length > index
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-300"
                      }`}
                    >
                      {form.pin.length > index ? "*" : ""}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PIN_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pressPinKey(key)}
                      className="h-12 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-900 shadow-sm transition active:bg-slate-100"
                    >
                      {key === "DEL" ? "<" : key}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {editingId ? "Guardar canvis" : "Afegir empleat"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="rounded-xl border border-[var(--line)] px-5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-slate-50/80 text-left text-[12px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Nom</th>
              {posMode && <th className="px-5 py-3">Rol</th>}
              {posMode && <th className="px-5 py-3">Accessos POS</th>}
              <th className="px-5 py-3 text-right">{posMode ? "PIN" : "Cost/hora"}</th>
              <th className="px-5 py-3 text-right">Estat</th>
              <th className="px-5 py-3 text-right">Accions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={posMode ? 6 : 4} className="px-5 py-8 text-center text-slate-400">
                  No hi ha empleats registrats.
                </td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-[var(--line)] transition hover:bg-slate-50/50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  <div className="flex flex-col gap-1">
                    <span>{emp.name}</span>
                    {emp.syncStatus === "pending" && (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-amber-600">
                        Pendent de sync
                      </span>
                    )}
                  </div>
                </td>
                {posMode && (
                  <td className="px-5 py-3 text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      {emp.role === "admin" ? "Admin" : "Empleado"}
                    </span>
                  </td>
                )}
                {posMode && (
                  <td className="px-5 py-3 text-slate-600">
                    <div className="flex flex-wrap gap-1.5">
                      <AccessBadge label="Cashlogy" enabled={emp.role === "admin" || emp.canAccessCashlogy === true} />
                      <AccessBadge label="Pagaments" enabled={emp.role === "admin" || emp.canAccessSupplierPayments === true} />
                      <AccessBadge label="Productes" enabled={emp.role === "admin" || emp.canAccessProducts === true} />
                    </div>
                  </td>
                )}
                <td className="px-5 py-3 text-right text-slate-600">
                  {posMode ? "Ocult" : `${emp.hourlyCost.toFixed(2)} EUR/h`}
                </td>
                <td className="px-5 py-3 text-right text-slate-600">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    emp.syncStatus === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {emp.syncStatus === "pending"
                      ? emp.pendingAction === "deactivate"
                        ? "Pendent baixa"
                        : emp.pendingAction === "update"
                          ? "Pendent canvi"
                          : "Pendent alta"
                      : "Actiu"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(emp)}
                      disabled={emp.syncStatus === "pending"}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      title="Editar"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp.id)}
                      disabled={emp.syncStatus === "pending"}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      title={posMode ? "Desactivar" : "Eliminar"}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[26px] font-bold tracking-tight text-slate-900">{value}</p>
    </article>
  );
}

function AccessToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 transition ${
        checked
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600"
      } ${disabled ? "cursor-not-allowed opacity-70" : "hover:border-indigo-200"}`}
    >
      <span>
        <span className="block text-sm font-black">{label}</span>
        <span className="block text-[11px] font-medium text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
    </label>
  );
}

function AccessBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
        enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      {enabled ? label : `No ${label}`}
    </span>
  );
}
