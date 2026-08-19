import { AppFrame } from "@/components/app-frame";
import { ProcurementPanel } from "@/components/procurement-panel";
import { getProcurementWorkspace } from "@/lib/procurement";

export const dynamic = "force-dynamic";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = firstValue(params?.from);
  const to = firstValue(params?.to);
  const workspace = await getProcurementWorkspace(from, to);

  return (
    <AppFrame
      title="Compras y consumibles"
      description="Calcula necesidades segun ventas, controla existencias y prepara pedidos por proveedor."
    >
      <ProcurementPanel initialWorkspace={workspace} />
    </AppFrame>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
