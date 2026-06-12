"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  LayoutGrid,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Tags,
} from "lucide-react";

import { formatDashboardDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type {
  CatalogChangeRecord,
  CatalogDraftChange,
  CatalogPublishRequest,
  PosCatalog,
  PosCategory,
  PosModifierGroup,
  PosProduct,
} from "@/lib/types";

type CatalogMode = "products" | "toppings";
type EditableProduct = PosProduct & { isNew?: boolean };
type EditableCategory = PosCategory & { isNew?: boolean };
type EditableModifierGroup = PosModifierGroup & { isNew?: boolean };

const MONEY = new Intl.NumberFormat("ca-ES", {
  style: "currency",
  currency: "EUR",
});

const EMPTY_SYNC = { lastSyncedAt: null, ok: null, message: null };

export function ProductesPanel({ catalog }: { catalog: PosCatalog }) {
  const [source, setSource] = useState<PosCatalog>({
    ...catalog,
    syncStatus: catalog.syncStatus ?? EMPTY_SYNC,
  });
  const [products, setProducts] = useState<EditableProduct[]>(catalog.products);
  const [categories, setCategories] = useState<EditableCategory[]>(catalog.categories);
  const [modifierGroups, setModifierGroups] = useState<EditableModifierGroup[]>(
    catalog.modifierGroups,
  );
  const [mode, setMode] = useState<CatalogMode>("products");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "all">("all");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    catalog.products[0]?.id ?? null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    catalog.modifierGroups.find((group) => group.active)?.id ?? catalog.modifierGroups[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const originalProducts = useMemo(
    () => new Map(source.products.map((product) => [product.id, product])),
    [source.products],
  );
  const originalCategories = useMemo(
    () => new Map(source.categories.map((category) => [category.id, category])),
    [source.categories],
  );
  const originalGroups = useMemo(
    () => new Map(source.modifierGroups.map((group) => [group.id, group])),
    [source.modifierGroups],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const groupById = useMemo(
    () => new Map(modifierGroups.map((group) => [group.id, group])),
    [modifierGroups],
  );

  const pendingChanges = source.pendingChanges;
  const pendingCount = pendingChanges.filter((change) => change.status === "pending").length;
  const errorCount = pendingChanges.filter((change) => change.status === "error").length;
  const activeProducts = products.filter((product) => product.active).length;

  const categoryStats = useMemo(() => {
    const stats = new Map<number, { active: number; inactive: number }>();
    for (const category of categories) stats.set(category.id, { active: 0, inactive: 0 });
    for (const product of products) {
      if (!product.categoryId) continue;
      const entry = stats.get(product.categoryId) ?? { active: 0, inactive: 0 };
      if (product.active) entry.active += 1;
      else entry.inactive += 1;
      stats.set(product.categoryId, entry);
    }
    return stats;
  }, [categories, products]);

  const pendingByProduct = useMemo(() => {
    const map = new Map<number, CatalogChangeRecord>();
    for (const change of pendingChanges) {
      if (
        change.status === "pending" &&
        change.entityType === "product" &&
        change.entityId &&
        !map.has(change.entityId)
      ) {
        map.set(change.entityId, change);
      }
    }
    return map;
  }, [pendingChanges]);

  const draftChanges = useMemo(
    () =>
      buildDraftChanges({
        products,
        categories,
        modifierGroups,
        originalProducts,
        originalCategories,
        originalGroups,
      }),
    [products, categories, modifierGroups, originalProducts, originalCategories, originalGroups],
  );

  const changedProductIds = useMemo(
    () =>
      new Set(
        draftChanges
          .filter((change) => change.entityType === "product" && change.entityId)
          .map((change) => Number(change.entityId)),
      ),
    [draftChanges],
  );
  const changedCategoryIds = useMemo(
    () =>
      new Set(
        draftChanges
          .filter((change) => change.entityType === "category" && change.entityId)
          .map((change) => Number(change.entityId)),
      ),
    [draftChanges],
  );
  const changedGroupIds = useMemo(
    () =>
      new Set(
        draftChanges
          .filter((change) => change.entityType === "modifier_group" && change.entityId)
          .map((change) => Number(change.entityId)),
      ),
    [draftChanges],
  );

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => showInactive || product.active)
      .filter((product) => selectedCategoryId === "all" || product.categoryId === selectedCategoryId)
      .filter((product) => {
        if (!term) return true;
        const category = product.categoryId ? categoryById.get(product.categoryId)?.name : "";
        const group = product.modifierGroupId ? groupById.get(product.modifierGroupId)?.name : "";
        return `${product.id} ${product.name} ${category} ${group}`.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const catA = a.categoryId ? categoryById.get(a.categoryId)?.sortOrder ?? 0 : 999;
        const catB = b.categoryId ? categoryById.get(b.categoryId)?.sortOrder ?? 0 : 999;
        return catA - catB || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });
  }, [categoryById, groupById, products, query, selectedCategoryId, showInactive]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const selectedCategory =
    selectedCategoryId === "all" ? null : categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedGroup = modifierGroups.find((group) => group.id === selectedGroupId) ?? null;

  function resetFromCatalog(nextCatalog: PosCatalog) {
    const safeCatalog = { ...nextCatalog, syncStatus: nextCatalog.syncStatus ?? EMPTY_SYNC };
    setSource(safeCatalog);
    setProducts(safeCatalog.products);
    setCategories(safeCatalog.categories);
    setModifierGroups(safeCatalog.modifierGroups);
    setSelectedProductId(safeCatalog.products[0]?.id ?? null);
    setSelectedGroupId(
      safeCatalog.modifierGroups.find((group) => group.active)?.id ?? safeCatalog.modifierGroups[0]?.id ?? null,
    );
  }

  async function refreshCatalog() {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) throw new Error("No s'ha pogut refrescar el cataleg");
    resetFromCatalog(await response.json());
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        setMessage(null);
        await action();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    });
  }

  async function publishChanges() {
    if (draftChanges.length === 0) return;
    const body: CatalogPublishRequest = { changes: draftChanges };
    const response = await fetch("/api/catalog/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload.error ?? "No s'han pogut publicar els canvis"));
    }
    setMessage(`${draftChanges.length} canvis enviats al POS. Quedaran pendents fins al proper sync.`);
    await refreshCatalog();
  }

  function discardDraft() {
    resetFromCatalog(source);
    setMessage("Borrador descartat.");
  }

  function updateProduct(id: number, patch: Partial<EditableProduct>) {
    setProducts((current) =>
      current.map((product) => (product.id === id ? { ...product, ...patch } : product)),
    );
  }

  function updateCategory(id: number, patch: Partial<EditableCategory>) {
    setCategories((current) =>
      current.map((category) => (category.id === id ? { ...category, ...patch } : category)),
    );
  }

  function updateGroup(id: number, patch: Partial<EditableModifierGroup>) {
    setModifierGroups((current) => current.map((group) => (group.id === id ? { ...group, ...patch } : group)));
  }

  function createProductDraft() {
    const category =
      selectedCategoryId === "all"
        ? categories.find((item) => item.name === "VARIOS") ?? categories[0]
        : categoryById.get(selectedCategoryId);
    if (!category) return;
    const maxSort = Math.max(0, ...products.filter((product) => product.categoryId === category.id).map((product) => product.sortOrder));
    const tempId = -Date.now();
    const product: EditableProduct = {
      id: tempId,
      name: "NOU PRODUCTE",
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      modifierGroupId: null,
      modifierIncludedCount: 0,
      modifierExtraPrice: 0,
      price: 0,
      vatRate: 10,
      imageUrl: null,
      active: true,
      sortOrder: maxSort + 1,
      isNew: true,
    };
    setProducts((current) => [product, ...current]);
    setSelectedProductId(tempId);
    setMode("products");
  }

  function removeNewProduct(id: number) {
    setProducts((current) => current.filter((product) => product.id !== id));
    if (selectedProductId === id) setSelectedProductId(null);
  }

  return (
    <div className="space-y-4">
      <CatalogStudioHeader
        products={products.length}
        activeProducts={activeProducts}
        categories={categories.length}
        groups={modifierGroups.length}
        draftCount={draftChanges.length}
        pendingCount={pendingCount}
        errorCount={errorCount}
        syncStatus={source.syncStatus ?? EMPTY_SYNC}
        busy={isPending}
        onRefresh={() => run(refreshCatalog)}
        onDiscard={discardDraft}
        onPublish={() => run(publishChanges)}
      />

      {message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_390px]">
        <aside className="space-y-3">
          <ModeSwitch mode={mode} onChange={setMode} />
          <CategoryRail
            categories={categories}
            selected={selectedCategoryId}
            stats={categoryStats}
            totalActive={products.filter((product) => product.active).length}
            totalInactive={products.filter((product) => !product.active).length}
            changedIds={changedCategoryIds}
            onSelect={setSelectedCategoryId}
          />
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-white p-3 shadow-sm md:flex-row md:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "products" ? "Buscar producte, categoria o topping" : "Buscar pagina de toppings"}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowInactive((current) => !current)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition",
                  showInactive
                    ? "border-slate-300 bg-slate-900 text-white"
                    : "border-[var(--line)] bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {showInactive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                Inactius
              </button>
              {mode === "products" && (
                <button
                  type="button"
                  onClick={createProductDraft}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  <Plus className="size-4" />
                  Producte
                </button>
              )}
            </div>
          </div>

          {mode === "products" ? (
            <ProductCanvas
              products={visibleProducts}
              categoryById={categoryById}
              groupById={groupById}
              pendingByProduct={pendingByProduct}
              changedIds={changedProductIds}
              selectedId={selectedProductId}
              onSelect={setSelectedProductId}
            />
          ) : (
            <ModifierGroupCanvas
              groups={modifierGroups}
              categories={categories}
              products={products}
              query={query}
              changedIds={changedGroupIds}
              selectedId={selectedGroupId}
              onSelect={setSelectedGroupId}
            />
          )}
        </main>

        <aside className="min-w-0 space-y-3">
          {mode === "products" ? (
            <>
              <ProductInspector
                product={selectedProduct}
                categories={categories}
                groups={modifierGroups}
                categoryById={categoryById}
                groupById={groupById}
                products={products}
                onChange={updateProduct}
                onRemoveNew={removeNewProduct}
              />
              <CategoryInspector
                category={selectedCategory}
                changed={Boolean(selectedCategory && changedCategoryIds.has(selectedCategory.id))}
                onChange={updateCategory}
              />
            </>
          ) : (
            <ModifierGroupInspector
              group={selectedGroup}
              categories={categories}
              products={products}
              changed={Boolean(selectedGroup && changedGroupIds.has(selectedGroup.id))}
              onChange={updateGroup}
            />
          )}
          <DraftQueue changes={draftChanges} pending={pendingChanges} />
        </aside>
      </section>
    </div>
  );
}

function CatalogStudioHeader({
  products,
  activeProducts,
  categories,
  groups,
  draftCount,
  pendingCount,
  errorCount,
  syncStatus,
  busy,
  onRefresh,
  onDiscard,
  onPublish,
}: {
  products: number;
  activeProducts: number;
  categories: number;
  groups: number;
  draftCount: number;
  pendingCount: number;
  errorCount: number;
  syncStatus: PosCatalog["syncStatus"];
  busy: boolean;
  onRefresh: () => void;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white">
              <LayoutGrid className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-950">Catalog Studio</h2>
              <p className="text-sm text-slate-500">
                Editor visual del POS. Prepara canvis i publica&apos;ls quan estiguin revisats.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Productes" value={String(products)} helper={`${activeProducts} actius`} />
          <Metric label="Categories" value={String(categories)} helper="estructura" />
          <Metric label="Toppings" value={String(groups)} helper="pagines" />
          <Metric label="Borrador" value={String(draftCount)} helper="sense publicar" tone={draftCount ? "amber" : "slate"} />
          <Metric label="Pendents" value={String(pendingCount)} helper="cap al POS" tone={pendingCount ? "amber" : "emerald"} />
          <Metric label="Errors" value={String(errorCount)} helper="sync" tone={errorCount ? "red" : "slate"} />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line)] pt-3 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
          <Clock3 className="size-4 shrink-0" />
          <span className="truncate">
            Ultim sync:{" "}
            {syncStatus?.lastSyncedAt ? formatDashboardDateTime(syncStatus.lastSyncedAt, "ca-ES") : "pendent de registrar"}
            {syncStatus?.message ? ` · ${syncStatus.message}` : ""}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            Refrescar
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy || draftCount === 0}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <RotateCcw className="size-4" />
            Descartar
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy || draftCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Send className="size-4" />
            Publicar canvis
          </button>
        </div>
      </div>
    </section>
  );
}

function ModeSwitch({ mode, onChange }: { mode: CatalogMode; onChange: (mode: CatalogMode) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("products")}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition",
          mode === "products" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50",
        )}
      >
        <Package className="size-4" />
        Productes
      </button>
      <button
        type="button"
        onClick={() => onChange("toppings")}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition",
          mode === "toppings" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50",
        )}
      >
        <Tags className="size-4" />
        Toppings
      </button>
    </div>
  );
}

function CategoryRail({
  categories,
  selected,
  stats,
  totalActive,
  totalInactive,
  changedIds,
  onSelect,
}: {
  categories: EditableCategory[];
  selected: number | "all";
  stats: Map<number, { active: number; inactive: number }>;
  totalActive: number;
  totalInactive: number;
  changedIds: Set<number>;
  onSelect: (id: number | "all") => void;
}) {
  return (
    <nav className="rounded-lg border border-[var(--line)] bg-white p-2 shadow-sm">
      <CategoryButton
        label="Totes"
        active={selected === "all"}
        color="#0f172a"
        activeCount={totalActive}
        inactiveCount={totalInactive}
        changed={false}
        onClick={() => onSelect("all")}
      />
      <div className="mt-1 max-h-[calc(100vh-310px)] space-y-1 overflow-auto pr-1">
        {categories.map((category) => {
          const count = stats.get(category.id) ?? { active: 0, inactive: 0 };
          return (
            <CategoryButton
              key={category.id}
              label={category.name}
              color={category.color}
              active={selected === category.id}
              activeCount={count.active}
              inactiveCount={count.inactive}
              changed={changedIds.has(category.id)}
              onClick={() => onSelect(category.id)}
            />
          );
        })}
      </div>
    </nav>
  );
}

function CategoryButton({
  label,
  color,
  active,
  activeCount,
  inactiveCount,
  changed,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  activeCount: number;
  inactiveCount: number;
  changed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition",
        active ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50",
      )}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{label}</span>
      {changed && <span className="size-1.5 rounded-full bg-amber-400" />}
      <span className={cn("rounded bg-white/10 px-1.5 py-0.5 text-xs font-black", !active && "bg-slate-100 text-slate-500")}>
        {activeCount}
      </span>
      {inactiveCount > 0 && (
        <span className={cn("text-xs font-semibold", active ? "text-white/55" : "text-slate-400")}>
          {inactiveCount}
        </span>
      )}
    </button>
  );
}

function ProductCanvas({
  products,
  categoryById,
  groupById,
  pendingByProduct,
  changedIds,
  selectedId,
  onSelect,
}: {
  products: EditableProduct[];
  categoryById: Map<number, EditableCategory>;
  groupById: Map<number, EditableModifierGroup>;
  pendingByProduct: Map<number, CatalogChangeRecord>;
  changedIds: Set<number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <section className="min-h-[640px] rounded-lg border border-[var(--line)] bg-[#111827] p-4 shadow-sm">
      {products.length === 0 ? (
        <div className="flex min-h-[420px] items-center justify-center text-center text-slate-400">
          <p className="text-sm font-semibold">No hi ha productes amb aquest filtre.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {products.map((product) => {
            const category = product.categoryId ? categoryById.get(product.categoryId) : null;
            const group = product.modifierGroupId ? groupById.get(product.modifierGroupId) : null;
            const pending = pendingByProduct.has(product.id);
            const changed = changedIds.has(product.id) || product.isNew;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product.id)}
                className={cn(
                  "min-h-[138px] rounded-lg border bg-[#1f2937] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[#273244]",
                  selectedId === product.id ? "border-emerald-400 ring-2 ring-emerald-400/20" : "border-white/10",
                  !product.active && "opacity-55",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: category?.color ?? "#64748b" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-lg font-black leading-6 text-white">{product.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                      {category?.name ?? "Sense categoria"}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-black text-white">{formatMoney(product.price)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {group ? <Badge tone="indigo">{group.name}</Badge> : <Badge>Sense toppings</Badge>}
                  {changed && <Badge tone="amber">Borrador</Badge>}
                  {pending && <Badge tone="blue">Pendent</Badge>}
                  {!product.active && <Badge tone="slate">Baixa</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProductInspector({
  product,
  categories,
  groups,
  categoryById,
  groupById,
  products,
  onChange,
  onRemoveNew,
}: {
  product: EditableProduct | null;
  categories: EditableCategory[];
  groups: EditableModifierGroup[];
  categoryById: Map<number, EditableCategory>;
  groupById: Map<number, EditableModifierGroup>;
  products: EditableProduct[];
  onChange: (id: number, patch: Partial<EditableProduct>) => void;
  onRemoveNew: (id: number) => void;
}) {
  if (!product) {
    return (
      <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
        <h3 className="text-base font-black text-slate-950">Producte</h3>
        <p className="mt-2 text-sm text-slate-500">Selecciona una targeta per editar-la.</p>
      </section>
    );
  }

  const selectedGroup = product.modifierGroupId ? groupById.get(product.modifierGroupId) ?? null : null;

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Producte seleccionat</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{product.name}</h3>
        </div>
        <button
          type="button"
          onClick={() => onChange(product.id, { active: !product.active })}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-black",
            product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
          )}
        >
          {product.active ? "Actiu" : "Baixa"}
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <Field label="Nom">
          <input
            value={product.name}
            onChange={(event) => onChange(product.id, { name: event.target.value })}
            className="field"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preu">
            <input
              type="number"
              min="0"
              step="0.01"
              value={numberInput(product.price)}
              onChange={(event) => onChange(product.id, { price: cleanNumber(event.target.value) })}
              className="field text-right"
            />
          </Field>
          <Field label="IVA">
            <input
              type="number"
              min="0"
              step="0.01"
              value={numberInput(product.vatRate)}
              onChange={(event) => onChange(product.id, { vatRate: cleanNumber(event.target.value) })}
              className="field text-right"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select
              value={product.categoryId ?? ""}
              onChange={(event) => onChange(product.id, { categoryId: Number(event.target.value) })}
              className="field"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ordre">
            <input
              type="number"
              value={String(product.sortOrder)}
              onChange={(event) => onChange(product.id, { sortOrder: cleanInteger(event.target.value) })}
              className="field text-right"
            />
          </Field>
        </div>
        <Field label="Pagina de toppings">
          <select
            value={product.modifierGroupId ?? ""}
            onChange={(event) => {
              const groupId = event.target.value ? Number(event.target.value) : null;
              onChange(product.id, {
                modifierGroupId: groupId,
                modifierIncludedCount: groupId ? product.modifierIncludedCount : 0,
                modifierExtraPrice: groupId ? product.modifierExtraPrice : 0,
              });
            }}
            className="field"
          >
            <option value="">Sense toppings</option>
            {groups
              .filter((group) => group.active)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gratis">
            <input
              type="number"
              min="0"
              step="1"
              value={String(product.modifierIncludedCount)}
              disabled={!product.modifierGroupId}
              onChange={(event) => onChange(product.id, { modifierIncludedCount: cleanInteger(event.target.value) })}
              className="field text-right disabled:bg-slate-100 disabled:text-slate-400"
            />
          </Field>
          <Field label="Extra">
            <input
              type="number"
              min="0"
              step="0.01"
              value={numberInput(product.modifierExtraPrice)}
              disabled={!product.modifierGroupId}
              onChange={(event) => onChange(product.id, { modifierExtraPrice: cleanNumber(event.target.value) })}
              className="field text-right disabled:bg-slate-100 disabled:text-slate-400"
            />
          </Field>
        </div>
      </div>

      {product.isNew && (
        <button
          type="button"
          onClick={() => onRemoveNew(product.id)}
          className="mt-3 w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700"
        >
          Eliminar producte nou del borrador
        </button>
      )}

      <ProductToppingPreview
        group={selectedGroup}
        product={product}
        products={products}
        categoryById={categoryById}
      />
    </section>
  );
}

function ProductToppingPreview({
  group,
  product,
  products,
  categoryById,
}: {
  group: EditableModifierGroup | null;
  product: EditableProduct;
  products: EditableProduct[];
  categoryById: Map<number, EditableCategory>;
}) {
  if (!group) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-bold text-slate-500">Aquest producte no obre pantalla de toppings.</p>
      </div>
    );
  }

  const groupCategories = group.categoryIds
    .map((id) => categoryById.get(id))
    .filter(Boolean) as EditableCategory[];

  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-indigo-500" />
        <p className="text-sm font-black text-slate-900">Vista previa toppings</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="emerald">{product.modifierIncludedCount} gratis</Badge>
        <Badge tone="amber">extra {formatMoney(product.modifierExtraPrice)}</Badge>
        {groupBadges(groupCategories).map((badge) => (
          <Badge key={badge} tone="indigo">
            {badge}
          </Badge>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {groupCategories.map((category) => {
          const itemCount = products.filter((item) => item.categoryId === category.id && item.active).length;
          return (
            <div key={category.id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{category.name}</span>
              <span className="text-xs font-semibold text-slate-400">{itemCount} opcions</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryInspector({
  category,
  changed,
  onChange,
}: {
  category: EditableCategory | null;
  changed: boolean;
  onChange: (id: number, patch: Partial<EditableCategory>) => void;
}) {
  if (!category) return null;
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />
        <h3 className="text-base font-black text-slate-950">Categoria</h3>
        {changed && <Badge tone="amber">Borrador</Badge>}
      </div>
      <div className="mt-3 grid gap-3">
        <Field label="Nom">
          <input
            value={category.name}
            onChange={(event) => onChange(category.id, { name: event.target.value })}
            className="field"
          />
        </Field>
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <Field label="Color">
            <input
              type="color"
              value={category.color}
              onChange={(event) => onChange(category.id, { color: event.target.value })}
              className="h-10 w-full rounded-md border border-[var(--line)] bg-white"
            />
          </Field>
          <Field label="Ordre">
            <input
              type="number"
              value={String(category.sortOrder)}
              onChange={(event) => onChange(category.id, { sortOrder: cleanInteger(event.target.value) })}
              className="field text-right"
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function ModifierGroupCanvas({
  groups,
  categories,
  products,
  query,
  changedIds,
  selectedId,
  onSelect,
}: {
  groups: EditableModifierGroup[];
  categories: EditableCategory[];
  products: EditableProduct[];
  query: string;
  changedIds: Set<number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const term = query.trim().toLowerCase();
  const visibleGroups = groups.filter((group) =>
    term ? `${group.name} ${group.categoryNames.join(" ")}`.toLowerCase().includes(term) : true,
  );

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-2">
        {visibleGroups.map((group) => {
          const groupCategories = group.categoryIds
            .map((id) => categoryById.get(id))
            .filter(Boolean) as EditableCategory[];
          const assigned = products.filter((product) => product.modifierGroupId === group.id);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(group.id)}
              className={cn(
                "rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                selectedId === group.id ? "border-indigo-400 bg-indigo-50" : "border-[var(--line)] bg-white",
                !group.active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">{group.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{assigned.length} productes assignats</p>
                </div>
                {changedIds.has(group.id) && <Badge tone="amber">Borrador</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {groupBadges(groupCategories).map((badge) => (
                  <Badge key={badge} tone="indigo">
                    {badge}
                  </Badge>
                ))}
                {!group.active && <Badge>Baixa</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {groupCategories.slice(0, 8).map((category) => (
                  <span
                    key={category.id}
                    className="rounded-md px-2 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.name}
                  </span>
                ))}
                {groupCategories.length > 8 && <Badge>+{groupCategories.length - 8}</Badge>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ModifierGroupInspector({
  group,
  categories,
  products,
  changed,
  onChange,
}: {
  group: EditableModifierGroup | null;
  categories: EditableCategory[];
  products: EditableProduct[];
  changed: boolean;
  onChange: (id: number, patch: Partial<EditableModifierGroup>) => void;
}) {
  if (!group) {
    return (
      <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
        <h3 className="text-base font-black text-slate-950">Pagina de toppings</h3>
        <p className="mt-2 text-sm text-slate-500">Selecciona una pagina per editar-la.</p>
      </section>
    );
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const currentGroup = group;
  const assignedProducts = products.filter((product) => product.modifierGroupId === currentGroup.id);
  const groupCategories = currentGroup.categoryIds
    .map((id) => categoryById.get(id))
    .filter(Boolean) as EditableCategory[];

  function toggleCategory(categoryId: number) {
    const ids = new Set(currentGroup.categoryIds);
    if (ids.has(categoryId)) ids.delete(categoryId);
    else ids.add(categoryId);
    onChange(currentGroup.id, {
      categoryIds: Array.from(ids),
      categoryNames: Array.from(ids)
        .map((id) => categoryById.get(id)?.name)
        .filter(Boolean) as string[],
    });
  }

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Pagina toppings</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{group.name}</h3>
        </div>
        <div className="flex gap-1.5">
          {changed && <Badge tone="amber">Borrador</Badge>}
          <button
            type="button"
            onClick={() => onChange(group.id, { active: !group.active })}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-black",
              group.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
            )}
          >
            {group.active ? "Activa" : "Baixa"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <Field label="Nom">
          <input value={group.name} onChange={(event) => onChange(group.id, { name: event.target.value })} className="field" />
        </Field>
        <Field label="Descripcio">
          <textarea
            value={group.description ?? ""}
            onChange={(event) => onChange(group.id, { description: event.target.value })}
            className="field min-h-20 resize-none"
          />
        </Field>
        <Field label="Ordre">
          <input
            type="number"
            value={String(group.sortOrder)}
            onChange={(event) => onChange(group.id, { sortOrder: cleanInteger(event.target.value) })}
            className="field text-right"
          />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase text-slate-400">Categories dins la pagina</p>
        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-auto rounded-lg border border-[var(--line)] bg-slate-50 p-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-bold transition",
                group.categoryIds.includes(category.id)
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold uppercase text-slate-400">Preview POS</p>
        {groupCategories.map((category) => {
          const itemCount = products.filter((product) => product.categoryId === category.id && product.active).length;
          return (
            <div key={category.id} className="rounded-md border border-[var(--line)] bg-slate-50 p-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{category.name}</span>
                <span className="text-xs font-bold text-slate-400">{itemCount}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase text-slate-400">Productes que la fan servir</p>
        <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-[var(--line)] bg-slate-50 p-2">
          {assignedProducts.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-500">Cap producte assignat.</p>
          ) : (
            assignedProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{product.name}</span>
                <span className="text-xs font-bold text-slate-400">
                  {product.modifierIncludedCount} gratis · {formatMoney(product.modifierExtraPrice)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function DraftQueue({ changes, pending }: { changes: CatalogDraftChange[]; pending: CatalogChangeRecord[] }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <h3 className="text-base font-black text-slate-950">Canvis</h3>
      <div className="mt-3 space-y-2">
        {changes.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">No hi ha canvis en borrador.</p>
        ) : (
          changes.slice(0, 10).map((change, index) => (
            <div key={`${change.entityType}-${change.entityId ?? "new"}-${index}`} className="rounded-md bg-amber-50 px-3 py-2">
              <p className="text-xs font-black uppercase text-amber-700">
                {change.action} {labelEntity(change.entityType)}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-amber-900">
                {String(change.payload.name ?? change.entityId ?? "nou")}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className="mb-2 text-xs font-bold uppercase text-slate-400">Ultims pendents/aplicats</p>
        <div className="max-h-44 space-y-2 overflow-auto">
          {pending.slice(0, 8).map((change) => (
            <div key={change.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2">
              <StatusIcon status={change.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black uppercase text-slate-600">
                  {change.action} {labelEntity(change.entityType)}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {change.errorMessage || formatDashboardDateTime(change.requestedAt, "ca-ES")}
                </p>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-sm text-slate-500">Encara no hi ha cua de canvis.</p>}
        </div>
      </div>
    </section>
  );
}

function Metric({
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
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
  };
  return (
    <article className={cn("min-w-28 rounded-lg px-3 py-2", tones[tone])}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="text-2xl font-black leading-7">{value}</p>
      <p className="text-xs font-medium opacity-60">{helper}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "indigo" | "amber" | "emerald" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return <span className={cn("rounded-md px-2 py-1 text-xs font-black", tones[tone])}>{children}</span>;
}

function StatusIcon({ status }: { status: CatalogChangeRecord["status"] }) {
  if (status === "applied") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  if (status === "error") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />;
  return <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-600" />;
}

function buildDraftChanges(input: {
  products: EditableProduct[];
  categories: EditableCategory[];
  modifierGroups: EditableModifierGroup[];
  originalProducts: Map<number, PosProduct>;
  originalCategories: Map<number, PosCategory>;
  originalGroups: Map<number, PosModifierGroup>;
}): CatalogDraftChange[] {
  const categoryChanges = input.categories
    .map((category) => categoryChange(category, input.originalCategories.get(category.id)))
    .filter(Boolean) as CatalogDraftChange[];
  const groupChanges = input.modifierGroups
    .map((group) => modifierGroupChange(group, input.originalGroups.get(group.id)))
    .filter(Boolean) as CatalogDraftChange[];
  const productChanges = input.products
    .map((product) => productChange(product, input.originalProducts.get(product.id)))
    .filter(Boolean) as CatalogDraftChange[];
  return [...categoryChanges, ...groupChanges, ...productChanges];
}

function categoryChange(category: EditableCategory, original?: PosCategory): CatalogDraftChange | null {
  const payload = {
    name: category.name.trim(),
    color: category.color,
    sort_order: cleanInteger(category.sortOrder),
  };
  if (category.isNew || category.id < 0) {
    if (!payload.name) return null;
    return { entityType: "category", action: "create", payload };
  }
  if (!original) return null;
  if (
    payload.name === original.name &&
    payload.color === original.color &&
    payload.sort_order === original.sortOrder
  ) {
    return null;
  }
  return { entityType: "category", action: "update", entityId: category.id, payload };
}

function modifierGroupChange(group: EditableModifierGroup, original?: PosModifierGroup): CatalogDraftChange | null {
  const payload = {
    name: group.name.trim(),
    description: group.description || null,
    sort_order: cleanInteger(group.sortOrder),
    active: group.active,
    category_ids: group.categoryIds,
  };
  if (group.isNew || group.id < 0) {
    if (!payload.name || payload.category_ids.length === 0) return null;
    return { entityType: "modifier_group", action: "create", payload };
  }
  if (!original) return null;
  if (
    payload.name === original.name &&
    payload.description === (original.description || null) &&
    payload.sort_order === original.sortOrder &&
    payload.active === original.active &&
    sameArray(payload.category_ids, original.categoryIds)
  ) {
    return null;
  }
  return { entityType: "modifier_group", action: "update", entityId: group.id, payload };
}

function productChange(product: EditableProduct, original?: PosProduct): CatalogDraftChange | null {
  if (!product.name.trim() || !product.categoryId || product.price < 0) return null;
  const modifierGroupId = product.modifierGroupId || null;
  const payload = {
    name: product.name.trim(),
    category_id: product.categoryId,
    price: roundMoney(product.price),
    vat_rate: roundMoney(product.vatRate),
    image_url: product.imageUrl,
    active: product.active,
    sort_order: cleanInteger(product.sortOrder),
    modifier_group_id: modifierGroupId,
    modifier_included_count: modifierGroupId ? cleanInteger(product.modifierIncludedCount) : 0,
    modifier_extra_price: modifierGroupId ? roundMoney(product.modifierExtraPrice) : 0,
  };
  if (product.isNew || product.id < 0) {
    return { entityType: "product", action: "create", payload };
  }
  if (!original) return null;
  if (
    payload.name === original.name &&
    payload.category_id === original.categoryId &&
    payload.price === roundMoney(original.price) &&
    payload.vat_rate === roundMoney(original.vatRate) &&
    payload.image_url === original.imageUrl &&
    payload.active === original.active &&
    payload.sort_order === original.sortOrder &&
    payload.modifier_group_id === original.modifierGroupId &&
    payload.modifier_included_count === original.modifierIncludedCount &&
    payload.modifier_extra_price === roundMoney(original.modifierExtraPrice)
  ) {
    return null;
  }
  return { entityType: "product", action: "update", entityId: product.id, payload };
}

function groupBadges(categories: EditableCategory[]) {
  const badges = new Set<string>();
  for (const category of categories) {
    const lower = category.name.toLowerCase();
    if (lower.includes("sabor")) badges.add("Sabors");
    if (lower.includes("bola")) badges.add("Bola gelat");
    if (lower.includes("extres batut")) badges.add("Nata batut");
    if (lower.includes("choco") || lower.includes("cremas") || lower.includes("mermelada") || lower.includes("crunchy")) {
      badges.add("Toppings");
    }
  }
  return Array.from(badges);
}

function labelEntity(entity: CatalogDraftChange["entityType"]) {
  if (entity === "product") return "producte";
  if (entity === "category") return "categoria";
  return "toppings";
}

function formatMoney(value: number) {
  return MONEY.format(Number.isFinite(value) ? value : 0);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanInteger(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function numberInput(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function sameArray(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
