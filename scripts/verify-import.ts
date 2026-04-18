import { getSql } from "@/lib/db";

async function main() {
  const sql = getSql();

  console.log("=== Totals per any importat ===\n");
  const rows = await sql`
    SELECT
      EXTRACT(YEAR FROM business_date)::int AS year,
      COUNT(*)::int AS days,
      SUM(total_sales)::numeric(12,2) AS total_year,
      MIN(total_sales)::numeric(10,2) AS min_day,
      MAX(total_sales)::numeric(10,2) AS max_day,
      AVG(total_sales)::numeric(10,2) AS avg_day
    FROM sales_reports
    GROUP BY year
    ORDER BY year
  `;
  for (const r of rows) {
    console.log(`  ${r.year}: ${r.days} dies | Total=${r.total_year}€ | min=${r.min_day}€ max=${r.max_day}€ avg=${r.avg_day}€`);
  }

  // Spot checks against known values from the CAIXES file
  console.log("\n=== Spot checks ===");
  const spots = [
    { date: "2024-08-31", expected: 1687.55 },
    { date: "2023-07-03", expected: 1321.35 },
    { date: "2024-07-03", expected: 1321.5 },
    { date: "2025-02-01", expected: 1888.20 },
  ];
  for (const s of spots) {
    const r = await sql`SELECT total_sales FROM sales_reports WHERE business_date = ${s.date}`;
    const got = r[0] ? Number(r[0].total_sales) : null;
    const ok = got !== null && Math.abs(got - s.expected) < 0.01;
    console.log(`  ${s.date}: esperat=${s.expected}€, BD=${got}€  ${ok ? "✓" : "✗ (POSSIBLE ACUM!)"}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
