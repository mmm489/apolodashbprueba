import { NextResponse } from "next/server";

import { enqueueCatalogChange } from "@/lib/repositories";

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const categoryId = Number(body.categoryId ?? body.category_id);
  const price = numberOrDefault(body.price, NaN);
  const vatRate = numberOrDefault(body.vatRate ?? body.vat_rate, 10);
  const sortOrder = numberOrDefault(body.sortOrder ?? body.sort_order, 0);
  const imageUrl = body.imageUrl ?? body.image_url;
  const modifierGroupId = body.modifierGroupId ?? body.modifier_group_id;
  const modifierIncludedCount = numberOrDefault(body.modifierIncludedCount ?? body.modifier_included_count, 0);
  const modifierExtraPrice = numberOrDefault(body.modifierExtraPrice ?? body.modifier_extra_price, 0);

  if (!name || !Number.isInteger(categoryId) || categoryId <= 0 || !Number.isFinite(price)) {
    return NextResponse.json({ error: "Falten camps: nom, categoria i preu" }, { status: 400 });
  }

  const change = await enqueueCatalogChange({
    entityType: "product",
    action: "create",
    payload: {
      name,
      category_id: categoryId,
      price,
      vat_rate: vatRate,
      image_url: imageUrl ? String(imageUrl) : null,
      modifier_group_id: modifierGroupId ? numberOrDefault(modifierGroupId, NaN) : null,
      modifier_included_count: modifierGroupId ? Math.max(0, Math.floor(modifierIncludedCount)) : 0,
      modifier_extra_price: modifierGroupId ? Math.max(0, Math.round(modifierExtraPrice * 100) / 100) : 0,
      active: body.active == null ? true : Boolean(body.active),
      sort_order: sortOrder,
    },
  });

  return NextResponse.json({ ok: true, change }, { status: 202 });
}
