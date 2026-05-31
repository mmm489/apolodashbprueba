import { NextResponse } from "next/server";

import { enqueueCatalogChange } from "@/lib/repositories";

type RouteContext = { params: Promise<{ id: string }> };

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCategoryIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  );
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Falta el nom de la pagina" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "modifier_group",
    action: "update",
    entityId: groupId,
    payload: {
      name,
      description: body.description ? String(body.description) : null,
      sort_order: numberOrDefault(body.sortOrder ?? body.sort_order, 0),
      active: body.active == null ? true : Boolean(body.active),
      category_ids: normalizeCategoryIds(body.categoryIds ?? body.category_ids),
    },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "modifier_group",
    action: "deactivate",
    entityId: groupId,
    payload: { active: false },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}
