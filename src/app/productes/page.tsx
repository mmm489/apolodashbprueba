import { AppFrame } from "@/components/app-frame";
import { ProductesPanel } from "@/components/productes-panel";
import { listPosCatalog } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ProductesPage() {
  const catalog = await listPosCatalog();

  return (
    <AppFrame
      title="Productes"
      description="Edita categories i productes. Els canvis es sincronitzen amb el POS de la heladeria."
    >
      <ProductesPanel catalog={catalog} />
    </AppFrame>
  );
}
