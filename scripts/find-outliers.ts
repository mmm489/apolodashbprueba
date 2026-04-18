import { getSql } from "@/lib/db";

async function main() {
  const sql = getSql();
  const rows = await sql`
    SELECT business_date, total_sales
    FROM sales_reports
    WHERE EXTRACT(YEAR FROM business_date) = 2023 AND total_sales > 5000
    ORDER BY total_sales DESC
    LIMIT 20
  `;
  console.log("=== 2023: dies amb venda > 5000 € (sospitosos) ===");
  for (const r of rows) {
    console.log(`  ${r.business_date}: ${Number(r.total_sales).toFixed(2)} €`);
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
