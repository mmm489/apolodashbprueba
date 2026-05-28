import { NextResponse } from "next/server";

import { enqueueCatalogChange } from "@/lib/repositories";

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const color = String(body.color ?? "#64748b").trim() || "#64748b";
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);

  if (!name) {
    return NextResponse.json({ error: "Falta el nom de la categoria" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "category",
    action: "create",
    payload: { name, color, sort_order: Number.isFinite(sortOrder) ? sortOrder : 0 },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}
