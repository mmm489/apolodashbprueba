/**
 * One-shot: create a product_cost_history entry for every row in
 * product_costs that doesn't yet have one. Uses valid_from = 2023-01-01 so
 * any past sale picks up the same cost that was in the flat table before.
 */
import { backfillProductCostHistoryOnce } from "@/lib/repositories";

async function main() {
  const { inserted } = await backfillProductCostHistoryOnce();
  console.log(`✓ Backfilled ${inserted} product cost history rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
