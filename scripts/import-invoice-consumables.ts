import { detectInvoiceConsumablesInDatabase, importInvoiceConsumables } from "../src/lib/procurement";

async function main() {
  if (process.argv.includes("--dry-run")) {
    const detection = await detectInvoiceConsumablesInDatabase();
    const exampleLimit = process.argv.includes("--all") ? detection.candidates.length : 30;
    console.log(JSON.stringify({
      processed: detection.processed,
      accepted: detection.accepted,
      candidates: detection.candidates.length,
      grouped: detection.grouped,
      discarded: detection.discarded,
      examples: detection.candidates.slice(0, exampleLimit).map(({ name, supplierName, unit, packSize, packCost }) => ({
        name, supplierName, unit, packSize, packCost,
      })),
    }, null, 2));
  } else {
    const result = await importInvoiceConsumables();
    console.log(JSON.stringify(result));
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "No se ha podido analizar las facturas.");
    process.exit(1);
  });
