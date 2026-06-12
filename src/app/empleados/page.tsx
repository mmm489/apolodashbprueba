import { AppFrame } from "@/components/app-frame";
import { EmpleadosPanel } from "@/components/empleados-panel";
import { isPosDataSource } from "@/lib/db";
import { listEmployees } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function EmpleadosPage() {
  const employees = await listEmployees();
  const readOnly = isPosDataSource();

  return (
    <AppFrame
      title="Empleats"
      description={readOnly ? "Gestiona empleats, PINs, accessos del POS i cost empresa/hora del dashboard." : "Gestiona empleats, cost/hora i dades laborals per calcular productivitat."}
    >
      <EmpleadosPanel employees={employees} readOnly={readOnly} />
    </AppFrame>
  );
}
