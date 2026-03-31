import { AppFrame } from "@/components/app-frame";
import { EmpleadosPanel } from "@/components/empleados-panel";
import { listEmployees } from "@/lib/repositories";

export default async function EmpleadosPage() {
  const employees = await listEmployees();

  return (
    <AppFrame
      title="Empleats"
      description="Gestiona els empleats, els seus horaris i dies de treball per calcular la productivitat."
    >
      <EmpleadosPanel employees={employees} />
    </AppFrame>
  );
}
