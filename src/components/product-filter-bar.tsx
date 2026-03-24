"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ProductFilterBar({ product }: { product: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(product);

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("product", value.trim());
    } else {
      params.delete("product");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <section className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#203049]">Filtro de productos</p>
          <p className="text-xs text-[#7f8da2]">Busca por nombre para analizar articulos concretos y top ventas.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ej. CUCURUTXO, CAFE, XURROS"
            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[#203049]"
          />
          <button type="button" onClick={apply} className="rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            Filtrar producto
          </button>
        </div>
      </div>
    </section>
  );
}
