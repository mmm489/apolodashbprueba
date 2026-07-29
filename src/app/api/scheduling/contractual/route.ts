import { NextResponse } from "next/server";

import {
  generateEmployeeContractualSchedule,
  listEmployeeScheduleWeekSettings,
} from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? "";
  try {
    const settings = await listEmployeeScheduleWeekSettings(weekStart);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se han podido cargar los descansos." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const result = await generateEmployeeContractualSchedule({
      employeeId: String(body.employeeId ?? ""),
      weekStart: String(body.weekStart ?? ""),
      restDate: String(body.restDate ?? ""),
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se ha podido generar el horario contractual." },
      { status: 400 },
    );
  }
}
