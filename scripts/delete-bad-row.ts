import { getSql } from "@/lib/db";

async function main() {
  const sql = getSql();
  // Delete the bad 2023-11-29 row (had an accumulated value 227,670.55)
  const result = await sql`DELETE FROM sales_reports WHERE business_date = '2023-11-29' AND total_sales > 10000 RETURNING business_date, total_sales`;
  console.log(`Deleted ${result.length} row(s):`);
  for (const r of result) console.log(`  ${r.business_date}: ${r.total_sales} €`);

  // Re-verify 2023
  const rows = await sql`SELECT COUNT(*)::int AS n, SUM(total_sales)::numeric(12,2) AS total, MAX(total_sales)::numeric(10,2) AS maxd FROM sales_reports WHERE EXTRACT(YEAR FROM business_date) = 2023`;
  console.log(`\n2023 ara: ${rows[0].n} dies, total=${rows[0].total} €, max dia=${rows[0].maxd} €`);
}
main().catch((error) => { console.error(error); process.exit(1); });
