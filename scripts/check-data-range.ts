import { getSql } from "@/lib/db";

async function main() {
  const sql = getSql();

  const tables: Array<{ table: string; dateCol: string }> = [
    { table: "sales_reports", dateCol: "business_date" },
    { table: "product_sales", dateCol: "business_date" },
    { table: "hourly_sales", dateCol: "business_date" },
    { table: "hourly_product_sales", dateCol: "business_date" },
    { table: "invoices", dateCol: "issue_date" },
    { table: "payrolls", dateCol: "pay_period" },
    { table: "employee_shifts", dateCol: "business_date" },
  ];

  console.log("\n=== Rang de dates per taula ===\n");
  for (const { table, dateCol } of tables) {
    try {
      const rows = await sql.query(
        `SELECT MIN(${dateCol}) as min_d, MAX(${dateCol}) as max_d, COUNT(*) as n FROM ${table}`,
      );
      const r = rows[0] as { min_d: unknown; max_d: unknown; n: unknown };
      console.log(`${table.padEnd(25)}  ${String(r.min_d ?? "--").padEnd(25)} → ${String(r.max_d ?? "--").padEnd(25)}  (${r.n} files)`);
    } catch (e) {
      console.log(`${table.padEnd(25)}  (error: ${e instanceof Error ? e.message : String(e)})`);
    }
  }

  console.log("\n=== Dies amb sales_reports (per confirmar continuitat) ===\n");
  const rows = await sql`SELECT business_date, total_sales FROM sales_reports ORDER BY business_date ASC`;
  for (const row of rows) {
    console.log(`  ${row.business_date}  →  ${Number(row.total_sales).toFixed(2)} €`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
