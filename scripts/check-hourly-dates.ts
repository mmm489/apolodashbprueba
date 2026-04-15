import { getSalesWorkspace } from "@/lib/analytics";

async function main() {
  const ws = await getSalesWorkspace({ preset: "30d" });
  console.log(`\nFilter: ${ws.filter.from} → ${ws.filter.to}\n`);
  console.log("dayStatuses (newest first):\n");
  for (const d of ws.dayStatuses) {
    console.log(
      `  ${d.date}  |  hasArticles=${d.hasArticles ? "✓" : "✗"}  |  hasHourly=${d.hasHourly ? "✓" : "✗"}  |  totalSales=${d.totalSales ?? "--"}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
