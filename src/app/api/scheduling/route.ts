import { NextResponse } from "next/server";

import {
  deleteEmployeeScheduleShift,
  deleteEmployeeScheduleShiftsInRange,
  listEmployeeScheduleShifts,
  replaceEmployeeScheduleShiftsForDays,
  upsertEmployeeScheduleShift,
} from "@/lib/repositories";

type SchedulingInput = {
  id?: unknown;
  employeeId?: unknown;
  businessDate?: unknown;
  shiftStart?: unknown;
  shiftEnd?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const shifts = await listEmployeeScheduleShifts(from, to);
  return NextResponse.json(shifts);
}

export async function POST(request: Request) {
  const body = await request.json();
  const rawItems: SchedulingInput[] = Array.isArray(body.items) ? body.items : [body];

  try {
    const items = rawItems.map((item) => ({
      id: item.id ? String(item.id) : undefined,
      employeeId: String(item.employeeId ?? ""),
      businessDate: String(item.businessDate ?? ""),
      shiftStart: String(item.shiftStart ?? ""),
      shiftEnd: String(item.shiftEnd ?? ""),
    }));
    const saved = body.replaceExisting
      ? await replaceEmployeeScheduleShiftsForDays(items)
      : await Promise.all(items.map((item) => upsertEmployeeScheduleShift({
        id: item.id,
        employeeId: String(item.employeeId ?? ""),
        businessDate: String(item.businessDate ?? ""),
        shiftStart: String(item.shiftStart ?? ""),
        shiftEnd: String(item.shiftEnd ?? ""),
      })));

    return NextResponse.json({ ok: true, count: rawItems.length, shifts: saved.filter(Boolean) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se ha podido guardar el turno." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const id = String(body.id ?? body.shiftId ?? "");
  const employeeId = String(body.employeeId ?? "");
  const businessDate = String(body.businessDate ?? "");

  if (from && to) {
    try {
      const deleted = await deleteEmployeeScheduleShiftsInRange(from, to);
      return NextResponse.json({ ok: true, deleted });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se ha podido limpiar la semana." },
        { status: 400 },
      );
    }
  }

  if (!id && (!employeeId || !businessDate)) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }

  await deleteEmployeeScheduleShift({ id, employeeId, businessDate });
  return NextResponse.json({ ok: true });
}
