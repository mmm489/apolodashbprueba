import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyEmployeeSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const week = firstValue(query?.week);
  redirect(`/mi-horario/${token}${week ? `?week=${encodeURIComponent(week)}` : ""}`);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
