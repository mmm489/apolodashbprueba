import { NextResponse } from "next/server";

import { applyExactProductCosts } from "@/lib/repositories";

export async function POST() {
  const result = await applyExactProductCosts();
  return NextResponse.json(result);
}
