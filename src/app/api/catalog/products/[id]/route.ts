import { NextResponse } from "next/server";

import { enqueueCatalogChange } from "@/lib/repositories";

type RouteContext = { params: Promise<{ id: string }> };

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Producte invalid" }, { status: 400 });
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const categoryId = Number(body.categoryId ?? body.category_id);
  const price = numberOrDefault(body.price, NaN);
  const vatRate = numberOrDefault(body.vatRate ?? body.vat_rate, 10);
  const sortOrder = numberOrDefault(body.sortOrder ?? body.sort_order, 0);
  const imageUrl = body.imageUrl ?? body.image_url;
  const modifierGroupId = body.modifierGroupId ?? body.modifier_group_id;

  if (!name || !Number.isInteger(categoryId) || categoryId <= 0 || !Number.isFinite(price)) {
    return NextResponse.json({ error: "Falten camps: nom, categoria i preu" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "product",
    action: "update",
    entityId: productId,
    payload: {
      name,
      category_id: categoryId,
      price,
      vat_rate: vatRate,
      image_url: imageUrl ? String(imageUrl) : null,
      modifier_group_id: modifierGroupId ? numberOrDefault(modifierGroupId, NaN) : null,
      active: body.active == null ? true : Boolean(body.active),
      sort_order: sortOrder,
    },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Producte invalid" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "product",
    action: "deactivate",
    entityId: productId,
    payload: { active: false },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}
