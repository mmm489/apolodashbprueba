import { getSql } from "@/lib/db";
import { schemaSql } from "@/lib/schema";

async function main() {
  const sql = getSql();
  const statements = schemaSql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(`${statement};`);
  }

  console.log("Database schema created successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
