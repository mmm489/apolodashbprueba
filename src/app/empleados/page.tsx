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
      description={readOnly ? "Gestiona els empleats i els PINs del POS des del dashboard. Els canvis s'apliquen amb el sync de la heladeria." : "Gestiona els empleats, els seus horaris i dies de treball per calcular la productivitat."}
    >
      <EmpleadosPanel employees={employees} readOnly={readOnly} />
    </AppFrame>
  );
}
