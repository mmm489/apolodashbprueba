import { AppFrame } from "@/components/app-frame";
import { ProductCostsPanel } from "@/components/product-costs-panel";
import { listProductCostWorkspace } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function CosteProductosPage() {
  const workspace = await listProductCostWorkspace();

  return (
    <AppFrame
      title="Coste productos"
      description="Concilia costes antiguos con el catalogo actual del POS y revisa margenes por producto."
    >
      <ProductCostsPanel initialWorkspace={workspace} />
    </AppFrame>
  );
}
