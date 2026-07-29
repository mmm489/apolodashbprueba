import { NextResponse } from "next/server";

import {
  createTimeClockCorrectionRequestByToken,
  getEmployeeScheduleByToken,
  listEmployeeTimeClockIncidentsByToken,
  listTimeClockCorrectionRequests,
} from "@/lib/repositories";
import type { TimeClockCorrectionType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!isDateOnly(from) || !isDateOnly(to)) {
      return NextResponse.json({ error: "Rango de fechas no valido." }, { status: 400 });
    }

    const schedule = await getEmployeeScheduleByToken(token, from, to);
    if (!schedule) {
      return NextResponse.json({ error: "Enlace no encontrado." }, { status: 404 });
    }
    const [requests, incidents] = await Promise.all([
      listTimeClockCorrectionRequests({
        from,
        to,
        employeeId: schedule.employee.id,
      }),
      listEmployeeTimeClockIncidentsByToken({ token, from, to }),
    ]);
    return NextResponse.json({ requests, incidents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se han podido cargar las solicitudes." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json() as Record<string, unknown>;
    const correction = await createTimeClockCorrectionRequestByToken({
      token,
      pin: String(body.pin ?? ""),
      scheduleShiftId: body.scheduleShiftId == null ? null : String(body.scheduleShiftId),
      businessDate: String(body.businessDate ?? ""),
      requestType: String(body.requestType ?? "") as TimeClockCorrectionType,
      clockInTime: body.clockInTime == null ? null : String(body.clockInTime),
      clockOutTime: body.clockOutTime == null ? null : String(body.clockOutTime),
      reason: String(body.reason ?? ""),
    });
    return NextResponse.json({ correction }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se ha podido enviar la solicitud.";
    const status = message === "PIN incorrecto." ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
