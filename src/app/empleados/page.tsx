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
      description={readOnly ? "Empleats llegits directament de la base de dades del POS." : "Gestiona els empleats, els seus horaris i dies de treball per calcular la productivitat."}
    >
      <EmpleadosPanel employees={employees} readOnly={readOnly} />
    </AppFrame>
  );
}
