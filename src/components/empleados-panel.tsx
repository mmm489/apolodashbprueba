"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { Employee } from "@/lib/types";

function parseHours(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}

const emptyForm = { name: "", hourlyCost: 0, shiftStart: "09:00", shiftEnd: "17:00", workingDaysPerMonth: 22 };

export function EmpleadosPanel({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalEmployees = employees.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { id: editingId, ...form } : form;

    await fetch("/api/employees", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setLoading(false);
    router.refresh();
  }

  function startEdit(emp: Employee) {
    setForm({
      name: emp.name,
      hourlyCost: emp.hourlyCost,
      shiftStart: emp.shiftStart,
      shiftEnd: emp.shiftEnd,
      workingDaysPerMonth: emp.workingDaysPerMonth,
    });
    setEditingId(emp.id);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar aquest empleat?")) return;
    setLoading(true);
    await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        <MiniCard label="Empleats actius" value={String(totalEmployees)} />
        <MiniCard label="Cost mitja/hora" value={totalEmployees > 0 ? `${(employees.reduce((s, e) => s + e.hourlyCost, 0) / totalEmployees).toFixed(2)} €/h` : "—"} />
      </section>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500">{totalEmployees} empleat{totalEmployees !== 1 ? "s" : ""} registrat{totalEmployees !== 1 ? "s" : ""}</p>
        <button
          type="button"
          onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus className="size-4" />
          Nou empleat
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"
        >
          <p className="mb-4 text-[15px] font-semibold text-slate-900">
            {editingId ? "Editar empleat" : "Nou empleat"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
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
              Cancel·lar
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-[var(--line)] bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-slate-50/80 text-left text-[12px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Nom</th>
              <th className="px-5 py-3 text-right">Cost/hora</th>
              <th className="px-5 py-3 text-right">Accions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                  No hi ha empleats registrats. Fes clic a &quot;Nou empleat&quot; per comencar.
                </td>
              </tr>
            )}
            {employees.map((emp) => {
              return (
                <tr key={emp.id} className="border-b border-[var(--line)] transition hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-900">{emp.name}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{emp.hourlyCost.toFixed(2)} €/h</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(emp)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                        title="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(emp.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
