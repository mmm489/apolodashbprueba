import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/analytics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const snapshot = await getDashboardSnapshot({
    preset: searchParams.get("preset") ?? searchParams.get("range") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  return NextResponse.json(snapshot);
}
