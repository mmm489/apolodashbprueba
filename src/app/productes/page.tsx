import { AppFrame } from "@/components/app-frame";
import { ProductesPanel } from "@/components/productes-panel";
import { listProductCosts } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ProductesPage() {
  const products = await listProductCosts();

  return (
    <AppFrame
      title="Productes"
      description="Llista de productes amb cost unitari, ordenats per categoria."
    >
      <ProductesPanel products={products} />
    </AppFrame>
  );
}
