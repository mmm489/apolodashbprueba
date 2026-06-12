import { NextResponse } from "next/server";

import { ensureEmployeeScheduleLinks, listEmployees } from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json({ error: "Falta employeeId." }, { status: 400 });
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.id === employeeId && item.isActive);
  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado o inactivo." }, { status: 404 });
  }

  const [share] = await ensureEmployeeScheduleLinks([employeeId]);
  if (!share) {
    return NextResponse.json({ error: "No se ha podido crear el enlace." }, { status: 500 });
  }

  return NextResponse.json({
    employeeId: employee.id,
    employeeName: employee.name,
    token: share.token,
  });
}
