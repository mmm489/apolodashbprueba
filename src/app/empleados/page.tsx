import { AppFrame } from "@/components/app-frame";
import { EmpleadosPanel } from "@/components/empleados-panel";
import { listEmployees } from "@/lib/repositories";

export default async function EmpleadosPage() {
  const employees = await listEmployees();

  return (
    <AppFrame
      title="Empleados"
      description="Gestiona los empleados, sus horarios y dias de trabajo para calcular la productividad."
    >
      <EmpleadosPanel employees={employees} />
    </AppFrame>
  );
}
