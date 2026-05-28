import { AppFrame } from "@/components/app-frame";
import { ProductesPanel } from "@/components/productes-panel";
import { isPosDataSource } from "@/lib/db";
import { listProductCosts } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ProductesPage() {
  const products = await listProductCosts();
  const readOnly = isPosDataSource();

  return (
    <AppFrame
      title="Productes"
      description={readOnly ? "Productes llegits directament de la base de dades del POS." : "Llista de productes amb cost unitari, ordenats per categoria."}
    >
      <ProductesPanel products={products} readOnly={readOnly} />
    </AppFrame>
  );
}
