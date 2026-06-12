import { NextResponse } from "next/server";

import { getEmployeeScheduleByToken } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!isDateOnly(from) || !isDateOnly(to)) {
    return NextResponse.json({ error: "Rango de fechas no valido." }, { status: 400 });
  }

  const data = await getEmployeeScheduleByToken(token, from, to);
  if (!data) {
    return NextResponse.json({ error: "Horario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    employee: {
      id: data.employee.id,
      name: data.employee.name,
    },
    shifts: data.shifts.map((shift) => ({
      id: shift.id,
      employeeId: shift.employeeId,
      employeeName: shift.employeeName,
      businessDate: shift.businessDate,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
    })),
  });
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
