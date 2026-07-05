import { NextResponse } from "next/server";

import {
  getEmployeeScheduleWeekPublication,
  setEmployeeScheduleWeekPublication,
} from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? "";

  if (!isDateOnly(weekStart)) {
    return NextResponse.json({ error: "Semana no valida." }, { status: 400 });
  }

  const publication = await getEmployeeScheduleWeekPublication(weekStart);
  return NextResponse.json(publication);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? "");
  const isVisible = Boolean(body.isVisible);

  if (!isDateOnly(weekStart)) {
    return NextResponse.json({ error: "Semana no valida." }, { status: 400 });
  }

  const publication = await setEmployeeScheduleWeekPublication(weekStart, isVisible);
  return NextResponse.json({ ok: true, publication });
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
