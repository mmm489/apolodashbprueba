import { syncOneDrivePdfs } from "@/lib/ingestion/microsoft-graph-sync";

async function main() {
  const result = await syncOneDrivePdfs();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
