import { ingestPdfBuffer } from "@/lib/ingestion/service";
import {
  downloadDriveItem,
  getDriveDeltaPage,
  getGraphAccessToken,
  getGraphItemPath,
  isPdfGraphItem,
} from "@/lib/microsoft-graph";
import { getSyncState, setSyncState } from "@/lib/repositories";

const DELTA_STATE_KEY = "microsoft_graph_delta_link";

export async function syncOneDrivePdfs() {
  const accessToken = await getGraphAccessToken();
  let cursor = await getSyncState(DELTA_STATE_KEY);
  let processed = 0;
  let duplicated = 0;
  let skipped = 0;
  let latestDeltaLink = cursor;

  for (;;) {
    const page = await getDriveDeltaPage(accessToken, cursor ?? undefined);
    latestDeltaLink = page["@odata.deltaLink"] ?? latestDeltaLink;

    for (const item of page.value) {
      if (!isPdfGraphItem(item)) {
        skipped += 1;
        continue;
      }

      const sourcePath = getGraphItemPath(item);
      const pdfBuffer = await downloadDriveItem(accessToken, item.id);
      const result = await ingestPdfBuffer({
        fileName: item.name,
        sourcePath,
        pdfBuffer,
      });

      if (result.duplicated) {
        duplicated += 1;
      } else {
        processed += 1;
      }
    }

    if (page["@odata.nextLink"]) {
      cursor = page["@odata.nextLink"];
      continue;
    }

    break;
  }

  if (latestDeltaLink) {
    await setSyncState(DELTA_STATE_KEY, latestDeltaLink);
  }

  return {
    processed,
    duplicated,
    skipped,
    deltaStored: Boolean(latestDeltaLink),
  };
}
