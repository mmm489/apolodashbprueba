import { AccountingPanel } from "@/components/accounting-panel";
import { AppFrame } from "@/components/app-frame";
import { DateFilterBar } from "@/components/date-filter-bar";
import { getAccountingWorkspace } from "@/lib/accounting";
import { resolveDateFilter } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveDateFilter({
    preset: firstValue(params?.preset),
    from: firstValue(params?.from),
    to: firstValue(params?.to),
  });
  const workspace = await getAccountingWorkspace(filter.from, filter.to);

  return (
    <AppFrame
      title="Contabilidad"
      description="Asientos en borrador, plan contable, IVA, banco y cierres mensuales para revisión de gestoría."
    >
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />
      <AccountingPanel workspace={workspace} filter={filter} />
    </AppFrame>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
