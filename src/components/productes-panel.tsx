"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Plus, Power, RefreshCw, Save, Search } from "lucide-react";

import type { CatalogChangeRecord, PosCatalog, PosCategory, PosModifierGroup, PosProduct } from "@/lib/types";

type ProductDraft = {
  name: string;
  categoryId: string;
  modifierGroupId: string;
  price: string;
  vatRate: string;
  sortOrder: string;
  active: boolean;
};

type CategoryDraft = {
  name: string;
  color: string;
  sortOrder: string;
};

type ModifierGroupDraft = {
  name: string;
  categoryIds: number[];
  sortOrder: string;
  active: boolean;
};

const EMPTY_PRODUCT: ProductDraft = {
  name: "",
  categoryId: "",
  modifierGroupId: "",
  price: "",
  vatRate: "10",
  sortOrder: "0",
  active: true,
};

const EMPTY_CATEGORY: CategoryDraft = {
  name: "",
  color: "#64748b",
  sortOrder: "0",
};

const EMPTY_MODIFIER_GROUP: ModifierGroupDraft = {
  name: "",
  categoryIds: [],
  sortOrder: "0",
  active: true,
};

export function ProductesPanel({ catalog }: { catalog: PosCatalog }) {
  const [data, setData] = useState(catalog);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const pendingCount = data.pendingChanges.filter((change) => change.status === "pending").length;
  const errorCount = data.pendingChanges.filter((change) => change.status === "error").length;
  const activeCount = data.products.filter((product) => product.active).length;

  async function refreshCatalog() {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) return;
    setData(await response.json());
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      await refreshCatalog();
    });
  }

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.products;
    return data.products.filter((product) =>
      `${product.id} ${product.name} ${product.categoryName}`.toLowerCase().includes(term),
    );
  }, [data.products, query]);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-5">
        <MiniCard label="Productes" value={String(data.products.length)} helper={`${activeCount} actius`} />
        <MiniCard label="Categories" value={String(data.categories.length)} helper="estructura POS" />
        <MiniCard label="Toppings" value={String(data.modifierGroups.length)} helper="pagines assignables" />
        <MiniCard label="Pendents" value={String(pendingCount)} helper="cap a heladeria" tone={pendingCount ? "amber" : "emerald"} />
        <MiniCard label="Errors" value={String(errorCount)} helper="canvis no aplicats" tone={errorCount ? "red" : "slate"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-[17px] font-bold text-slate-950">Cataleg del POS</h2>
                <p className="text-[13px] text-slate-500">Els canvis es posen en cua i el PC de la heladeria els aplica automaticament.</p>
              </div>
              <div className="ml-auto flex w-full gap-2 md:w-auto">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] md:w-80">
                  <Search className="size-4 shrink-0 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar producte o categoria"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => run(refreshCatalog)}
                  disabled={isPending}
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-white px-3 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  title="Actualitzar"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <CategoryTable categories={data.categories} run={run} busy={isPending} />
          <ModifierGroupTable groups={data.modifierGroups} categories={data.categories} run={run} busy={isPending} />
          <ProductTable
            products={filteredProducts}
            categories={data.categories}
            modifierGroups={data.modifierGroups}
            changes={data.pendingChanges}
            run={run}
            busy={isPending}
          />
        </div>

        <div className="space-y-4">
          <NewCategoryForm run={run} busy={isPending} />
          <NewModifierGroupForm categories={data.categories} run={run} busy={isPending} />
          <NewProductForm categories={data.categories} modifierGroups={data.modifierGroups} run={run} busy={isPending} />
          <ChangeQueue changes={data.pendingChanges} />
        </div>
      </section>
    </div>
  );
}

function CategoryTable({ categories, run, busy }: { categories: PosCategory[]; run: (action: () => Promise<void>) => void; busy: boolean }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-950">Categories</h3>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} run={run} busy={busy} />
        ))}
      </div>
    </section>
  );
}

function CategoryRow({ category, run, busy }: { category: PosCategory; run: (action: () => Promise<void>) => void; busy: boolean }) {
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category.name,
    color: category.color,
    sortOrder: String(category.sortOrder),
  });

  const changed =
    draft.name !== category.name ||
    draft.color !== category.color ||
    Number(draft.sortOrder) !== category.sortOrder;

  async function save() {
    await fetch(`/api/catalog/categories/${category.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        color: draft.color,
        sortOrder: Number(draft.sortOrder || 0),
      }),
    });
  }

  return (
    <div className="grid gap-2 px-4 py-3 md:grid-cols-[54px_minmax(0,1fr)_92px_40px] md:items-center">
      <span className="text-[12px] font-medium text-slate-400">#{category.id}</span>
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="color"
          value={draft.color}
          onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
          className="h-9 w-10 rounded-lg border border-[var(--line)] bg-white"
          title="Color"
        />
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] font-semibold outline-none focus:border-indigo-300"
        />
      </div>
      <input
        type="number"
        value={draft.sortOrder}
        onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
        className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-right text-[13px] outline-none focus:border-indigo-300"
        title="Ordre"
      />
      <button
        type="button"
        onClick={() => run(save)}
        disabled={!changed || busy}
        className="inline-flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
        title="Guardar categoria"
      >
        <Save className="size-4" />
      </button>
    </div>
  );
}

function ModifierGroupTable({
  groups,
  categories,
  run,
  busy,
}: {
  groups: PosModifierGroup[];
  categories: PosCategory[];
  run: (action: () => Promise<void>) => void;
  busy: boolean;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-950">Pagines de toppings</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">Agrupa categories de sabors/extres i assigna-les als productes.</p>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {groups.map((group) => (
          <ModifierGroupRow key={group.id} group={group} categories={categories} run={run} busy={busy} />
        ))}
        {groups.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-slate-500">Encara no hi ha pagines de toppings.</div>
        )}
      </div>
    </section>
  );
}

function ModifierGroupRow({
  group,
  categories,
  run,
  busy,
}: {
  group: PosModifierGroup;
  categories: PosCategory[];
  run: (action: () => Promise<void>) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<ModifierGroupDraft>({
    name: group.name,
    categoryIds: group.categoryIds,
    sortOrder: String(group.sortOrder),
    active: group.active,
  });

  const sortedDraftIds = [...draft.categoryIds].sort((a, b) => a - b).join(",");
  const sortedGroupIds = [...group.categoryIds].sort((a, b) => a - b).join(",");
  const changed =
    draft.name !== group.name ||
    sortedDraftIds !== sortedGroupIds ||
    Number(draft.sortOrder) !== group.sortOrder ||
    draft.active !== group.active;

  function toggleCategory(categoryId: number) {
    setDraft((current) => {
      const ids = new Set(current.categoryIds);
      if (ids.has(categoryId)) ids.delete(categoryId);
      else ids.add(categoryId);
      return { ...current, categoryIds: Array.from(ids) };
    });
  }

  async function save() {
    await fetch(`/api/catalog/modifier-groups/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        categoryIds: draft.categoryIds,
        sortOrder: Number(draft.sortOrder || 0),
        active: draft.active,
      }),
    });
  }

  async function deactivate() {
    await fetch(`/api/catalog/modifier-groups/${group.id}`, { method: "DELETE" });
  }

  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[58px_minmax(180px,0.7fr)_minmax(260px,1fr)_72px_84px] lg:items-start">
      <span className="pt-2 text-[12px] font-medium text-slate-400">#{group.id}</span>
      <input
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        className="min-w-0 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-900 outline-none focus:border-indigo-300"
      />
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => toggleCategory(category.id)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              draft.categoryIds.includes(category.id)
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-white"
            }`}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={draft.sortOrder}
        onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
        className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-right text-[13px] outline-none focus:border-indigo-300"
        title="Ordre"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setDraft((current) => ({ ...current, active: !current.active }))}
          className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[11px] font-bold ${
            draft.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {draft.active ? "Activa" : "Baixa"}
        </button>
        <button
          type="button"
          onClick={() => run(save)}
          disabled={!changed || !draft.name.trim() || busy}
          className="inline-flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
          title="Guardar pagina"
        >
          <Save className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => run(deactivate)}
          disabled={!group.active || busy}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-red-100 text-red-600 transition hover:bg-red-50 disabled:border-slate-100 disabled:text-slate-300"
          title="Donar de baixa"
        >
          <Power className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ProductTable({
  products,
  categories,
  modifierGroups,
  changes,
  run,
  busy,
}: {
  products: PosProduct[];
  categories: PosCategory[];
  modifierGroups: PosModifierGroup[];
  changes: CatalogChangeRecord[];
  run: (action: () => Promise<void>) => void;
  busy: boolean;
}) {
  const pendingByProduct = useMemo(() => {
    const map = new Map<number, CatalogChangeRecord>();
    for (const change of changes) {
      if (change.entityType === "product" && change.entityId && change.status === "pending" && !map.has(change.entityId)) {
        map.set(change.entityId, change);
      }
    }
    return map;
  }, [changes]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div className="grid grid-cols-[58px_minmax(210px,1.2fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_92px_72px_72px_88px_92px] border-b border-[var(--line)] bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>ID</span>
        <span>Producte</span>
        <span>Categoria</span>
        <span>Toppings</span>
        <span className="text-right">Preu</span>
        <span className="text-right">IVA</span>
        <span className="text-right">Ordre</span>
        <span>Estat</span>
        <span className="text-right">Accions</span>
      </div>
      <div className="max-h-[720px] divide-y divide-[var(--line)] overflow-auto">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            categories={categories}
            modifierGroups={modifierGroups}
            pendingChange={pendingByProduct.get(product.id)}
            run={run}
            busy={busy}
          />
        ))}
        {products.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-slate-500">No hi ha productes amb aquest filtre.</div>
        )}
      </div>
    </section>
  );
}

function ProductRow({
  product,
  categories,
  modifierGroups,
  pendingChange,
  run,
  busy,
}: {
  product: PosProduct;
  categories: PosCategory[];
  modifierGroups: PosModifierGroup[];
  pendingChange?: CatalogChangeRecord;
  run: (action: () => Promise<void>) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<ProductDraft>({
    name: product.name,
    categoryId: String(product.categoryId ?? ""),
    modifierGroupId: product.modifierGroupId ? String(product.modifierGroupId) : "",
    price: product.price.toFixed(2),
    vatRate: String(product.vatRate),
    sortOrder: String(product.sortOrder),
    active: product.active,
  });

  const changed =
    draft.name !== product.name ||
    Number(draft.categoryId) !== product.categoryId ||
    (draft.modifierGroupId ? Number(draft.modifierGroupId) : null) !== product.modifierGroupId ||
    Number(draft.price) !== product.price ||
    Number(draft.vatRate) !== product.vatRate ||
    Number(draft.sortOrder) !== product.sortOrder ||
    draft.active !== product.active;

  async function save() {
    await fetch(`/api/catalog/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        categoryId: Number(draft.categoryId),
        modifierGroupId: draft.modifierGroupId ? Number(draft.modifierGroupId) : null,
        price: Number(draft.price),
        vatRate: Number(draft.vatRate),
        sortOrder: Number(draft.sortOrder || 0),
        active: draft.active,
      }),
    });
  }

  async function deactivate() {
    await fetch(`/api/catalog/products/${product.id}`, { method: "DELETE" });
  }

  return (
    <div className="grid grid-cols-[58px_minmax(210px,1.2fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_92px_72px_72px_88px_92px] items-center gap-2 px-4 py-3 text-[13px]">
      <span className="font-medium text-slate-400">#{product.id}</span>
      <input
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        className="min-w-0 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-indigo-300"
      />
      <select
        value={draft.categoryId}
        onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
        className="min-w-0 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 outline-none focus:border-indigo-300"
      >
        <option value="">Sense categoria</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        value={draft.modifierGroupId}
        onChange={(event) => setDraft((current) => ({ ...current, modifierGroupId: event.target.value }))}
        className="min-w-0 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 outline-none focus:border-indigo-300"
      >
        <option value="">Sense toppings</option>
        {modifierGroups
          .filter((group) => group.active)
          .map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
      </select>
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft.price}
        onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
        className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-right outline-none focus:border-indigo-300"
      />
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft.vatRate}
        onChange={(event) => setDraft((current) => ({ ...current, vatRate: event.target.value }))}
        className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-right outline-none focus:border-indigo-300"
      />
      <input
        type="number"
        value={draft.sortOrder}
        onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
        className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-right outline-none focus:border-indigo-300"
      />
      <button
        type="button"
        onClick={() => setDraft((current) => ({ ...current, active: !current.active }))}
        className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[11px] font-bold ${
          draft.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {pendingChange ? "Pendent" : draft.active ? "Actiu" : "Baixa"}
      </button>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => run(save)}
          disabled={!changed || busy}
          className="inline-flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
          title="Guardar producte"
        >
          <Save className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => run(deactivate)}
          disabled={!product.active || busy}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-red-100 text-red-600 transition hover:bg-red-50 disabled:border-slate-100 disabled:text-slate-300"
          title="Donar de baixa"
        >
          <Power className="size-4" />
        </button>
      </div>
    </div>
  );
}

function NewCategoryForm({ run, busy }: { run: (action: () => Promise<void>) => void; busy: boolean }) {
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_CATEGORY);

  async function create() {
    await fetch("/api/catalog/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        color: draft.color,
        sortOrder: Number(draft.sortOrder || 0),
      }),
    });
    setDraft(EMPTY_CATEGORY);
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <h3 className="text-[14px] font-bold text-slate-950">Nova categoria</h3>
      <div className="mt-3 space-y-2">
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom"
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        />
        <div className="grid grid-cols-[56px_1fr] gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-white"
          />
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
            placeholder="Ordre"
            className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
        </div>
        <button
          type="button"
          onClick={() => run(create)}
          disabled={!draft.name.trim() || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Plus className="size-4" />
          Crear categoria
        </button>
      </div>
    </section>
  );
}

function NewModifierGroupForm({ categories, run, busy }: { categories: PosCategory[]; run: (action: () => Promise<void>) => void; busy: boolean }) {
  const [draft, setDraft] = useState<ModifierGroupDraft>(EMPTY_MODIFIER_GROUP);

  function toggleCategory(categoryId: number) {
    setDraft((current) => {
      const ids = new Set(current.categoryIds);
      if (ids.has(categoryId)) ids.delete(categoryId);
      else ids.add(categoryId);
      return { ...current, categoryIds: Array.from(ids) };
    });
  }

  async function create() {
    await fetch("/api/catalog/modifier-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        categoryIds: draft.categoryIds,
        sortOrder: Number(draft.sortOrder || 0),
        active: draft.active,
      }),
    });
    setDraft(EMPTY_MODIFIER_GROUP);
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <h3 className="text-[14px] font-bold text-slate-950">Nova pagina toppings</h3>
      <div className="mt-3 space-y-3">
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Ex: Gelats / Batuts"
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        />
        <input
          type="number"
          value={draft.sortOrder}
          onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
          placeholder="Ordre"
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        />
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-auto rounded-xl border border-[var(--line)] bg-slate-50 p-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                draft.categoryIds.includes(category.id)
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => run(create)}
          disabled={!draft.name.trim() || draft.categoryIds.length === 0 || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Plus className="size-4" />
          Crear pagina
        </button>
      </div>
    </section>
  );
}

function NewProductForm({
  categories,
  modifierGroups,
  run,
  busy,
}: {
  categories: PosCategory[];
  modifierGroups: PosModifierGroup[];
  run: (action: () => Promise<void>) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<ProductDraft>({
    ...EMPTY_PRODUCT,
    categoryId: categories[0] ? String(categories[0].id) : "",
  });

  async function create() {
    await fetch("/api/catalog/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        categoryId: Number(draft.categoryId),
        modifierGroupId: draft.modifierGroupId ? Number(draft.modifierGroupId) : null,
        price: Number(draft.price),
        vatRate: Number(draft.vatRate || 10),
        sortOrder: Number(draft.sortOrder || 0),
        active: draft.active,
      }),
    });
    setDraft({ ...EMPTY_PRODUCT, categoryId: draft.categoryId, modifierGroupId: draft.modifierGroupId });
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <h3 className="text-[14px] font-bold text-slate-950">Nou producte</h3>
      <div className="mt-3 space-y-2">
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom"
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        />
        <select
          value={draft.categoryId}
          onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        >
          <option value="">Categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={draft.modifierGroupId}
          onChange={(event) => setDraft((current) => ({ ...current, modifierGroupId: event.target.value }))}
          className="w-full rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
        >
          <option value="">Sense toppings</option>
          {modifierGroups
            .filter((group) => group.active)
            .map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
            placeholder="Preu"
            className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.vatRate}
            onChange={(event) => setDraft((current) => ({ ...current, vatRate: event.target.value }))}
            placeholder="IVA"
            className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
            placeholder="Ordre"
            className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
        </div>
        <button
          type="button"
          onClick={() => run(create)}
          disabled={!draft.name.trim() || !draft.categoryId || !draft.price || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Plus className="size-4" />
          Crear producte
        </button>
      </div>
    </section>
  );
}

function ChangeQueue({ changes }: { changes: CatalogChangeRecord[] }) {
  const latest = changes.slice(0, 12);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
      <h3 className="text-[14px] font-bold text-slate-950">Cua de canvis</h3>
      <div className="mt-3 space-y-2">
        {latest.map((change) => (
          <div key={change.id} className="rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={change.status} />
              <span className="text-[12px] font-bold uppercase text-slate-600">
                {change.action} {change.entityType}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">{new Date(change.requestedAt).toLocaleString("ca-ES")}</span>
            </div>
            <p className="mt-1 truncate text-[12px] text-slate-500">
              {change.entityId ? `ID ${change.entityId}` : "nou"} {change.errorMessage ? `- ${change.errorMessage}` : ""}
            </p>
          </div>
        ))}
        {latest.length === 0 && <p className="text-[13px] text-slate-500">Encara no hi ha canvis.</p>}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: CatalogChangeRecord["status"] }) {
  if (status === "applied") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === "error") return <AlertTriangle className="size-4 text-red-600" />;
  return <Clock3 className="size-4 text-amber-600" />;
}

function MiniCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "slate" | "emerald" | "amber" | "red";
}) {
  const tones = {
    slate: "text-slate-950 bg-white",
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
    red: "text-red-700 bg-red-50",
  };

  return (
    <article className={`rounded-2xl border border-[var(--line)] p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-[13px] font-medium opacity-70">{label}</p>
      <p className="mt-2 text-[28px] font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[12px] opacity-60">{helper}</p>
    </article>
  );
}
