import { getSql } from "@/lib/db";
import { schemaSql } from "@/lib/schema";

async function main() {
  const sql = getSql();
  await sql.query(schemaSql);
  console.log("Database schema created successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
