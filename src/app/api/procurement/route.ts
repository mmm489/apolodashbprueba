import { NextResponse } from "next/server";

import {
  createSuggestedPurchaseOrders,
  deleteConsumableUsage,
  getProcurementWorkspace,
  updatePurchaseOrderStatus,
  upsertConsumable,
  upsertConsumableUsage,
} from "@/lib/procurement";
import type { PurchaseOrderStatus } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const workspace = await getProcurementWorkspace(
      searchParams.get("from") ?? undefined,
      searchParams.get("to") ?? undefined,
    );
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "save-consumable") {
      const id = await upsertConsumable({
        id: optionalString(body.id),
        name: String(body.name ?? ""),
        sku: optionalString(body.sku),
        supplierName: optionalString(body.supplierName),
        unit: optionalString(body.unit),
        packSize: optionalNumber(body.packSize),
        packCost: optionalNumber(body.packCost),
        currentStock: optionalNumber(body.currentStock),
        safetyStock: optionalNumber(body.safetyStock),
        coverageDays: optionalNumber(body.coverageDays),
        active: body.active !== false,
      });
      return NextResponse.json({ ok: true, id }, { status: 201 });
    }

    if (action === "save-usage") {
      await upsertConsumableUsage({
        consumableId: String(body.consumableId ?? ""),
        productId: String(body.productId ?? ""),
        quantityPerSale: Number(body.quantityPerSale),
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (action === "delete-usage") {
      await deleteConsumableUsage(String(body.consumableId ?? ""), String(body.productId ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "create-orders") {
      const items = Array.isArray(body.items)
        ? body.items.map((item) => {
            const row = item as Record<string, unknown>;
            return { consumableId: String(row.consumableId ?? ""), packs: Number(row.packs) };
          })
        : [];
      const orderIds = await createSuggestedPurchaseOrders({
        from: String(body.from ?? ""),
        to: String(body.to ?? ""),
        notes: optionalString(body.notes),
        items,
      });
      return NextResponse.json({ ok: true, orderIds }, { status: 201 });
    }

    if (action === "update-order-status") {
      await updatePurchaseOrderStatus(
        String(body.orderId ?? ""),
        String(body.status ?? "") as PurchaseOrderStatus,
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Accion no reconocida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 400 });
  }
}

function optionalString(value: unknown) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  return Number(value);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "No se ha podido completar la operacion.";
}
