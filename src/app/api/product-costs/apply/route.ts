import { NextResponse } from "next/server";

import { applyProductCostAssignments } from "@/lib/repositories";

export async function POST(request: Request) {
  const body = await request.json();
  const items = Array.isArray(body.items)
    ? body.items
    : [{
        posProductId: body.posProductId,
        unitCost: body.unitCost,
        legacyProductCode: body.legacyProductCode,
        effectiveFrom: body.effectiveFrom,
      }];

  const result = await applyProductCostAssignments({
    items: items.map((item: Record<string, unknown>) => ({
      posProductId: String(item.posProductId ?? ""),
      unitCost: item.unitCost == null ? null : Number(item.unitCost),
      legacyProductCode: item.legacyProductCode == null ? null : String(item.legacyProductCode),
      effectiveFrom: item.effectiveFrom == null ? null : String(item.effectiveFrom),
    })),
  });

  return NextResponse.json(result);
}
