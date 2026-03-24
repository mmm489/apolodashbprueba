import { readdir } from "node:fs/promises";
import path from "node:path";

import { env, requireEnv } from "@/lib/env";
import { ingestPdf } from "@/lib/ingestion/service";

async function main() {
  const rootDir = requireEnv("ONEDRIVE_INPUT_DIR");
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(rootDir, entry.name));

  if (!files.length) {
    console.log(`No PDF files found in ${rootDir}`);
    return;
  }

  console.log(`Scanning ${files.length} PDFs from ${env.ONEDRIVE_INPUT_DIR}`);

  for (const filePath of files) {
    const result = await ingestPdf(filePath);
    console.log(JSON.stringify({ filePath, duplicated: result.duplicated }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
