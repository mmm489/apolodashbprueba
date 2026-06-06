import { NextRequest, NextResponse } from "next/server";
import { listTimeClockSessions } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from"));
  const to = cleanDate(searchParams.get("to"));
  const sessions = await listTimeClockSessions(from, to);
  return NextResponse.json({ sessions });
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
