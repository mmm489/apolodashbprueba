import { NextResponse } from "next/server";

import { resolveDateFilter } from "@/lib/analytics";
import {
  listCashClosings,
  listHourlySales,
  listProductSales,
  listSalesReports,
} from "@/lib/repositories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = resolveDateFilter({
    preset: searchParams.get("preset") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const [salesReports, hourlySales, productSales, cashClosings] = await Promise.all([
    listSalesReports(filter.from, filter.to),
    listHourlySales(filter.from, filter.to),
    listProductSales(filter.from, filter.to),
    listCashClosings(filter.from, filter.to),
  ]);

  const totals = salesReports.reduce(
    (acc, report) => {
      acc.sales += report.totalSales;
      acc.orders += report.orderCount;
      for (const [method, amount] of Object.entries(report.paymentMix)) {
        acc.paymentMix[method] = (acc.paymentMix[method] ?? 0) + amount;
      }
      return acc;
    },
    { sales: 0, orders: 0, paymentMix: {} as Record<string, number> },
  );
  const topProducts = new Map<string, { productCode: string; productName: string; units: number; amount: number }>();
  for (const item of productSales) {
    const current = topProducts.get(item.productCode) ?? {
      productCode: item.productCode,
      productName: item.productName,
      units: 0,
      amount: 0,
    };
    current.units += item.units;
    current.amount += item.amount;
    topProducts.set(item.productCode, current);
  }

  return NextResponse.json({
    filter,
    totals: {
      ...totals,
      averageTicket: totals.orders > 0 ? totals.sales / totals.orders : 0,
    },
    salesReports,
    hourlySales,
    topProducts: [...topProducts.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 25),
    cashClosings,
  });
}
