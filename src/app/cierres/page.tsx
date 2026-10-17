import { AppFrame } from "@/components/app-frame";
import { CashClosingsReport } from "@/components/cash-closings-report";
import { DateFilterBar } from "@/components/date-filter-bar";
import { resolveDateFilter } from "@/lib/analytics";
import { listCashClosings } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function CierresPage({
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
  const closings = await listCashClosings(filter.from, filter.to);

  return (
    <AppFrame title="Tancaments Z" description="Tancaments originals i conciliacio de vendes.">
      <DateFilterBar preset={filter.preset} from={filter.from} to={filter.to} />
      <CashClosingsReport closings={closings} />
    </AppFrame>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
