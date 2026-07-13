import { inventoryIntentRouteModule as defaultInventoryIntentRouteModule } from "./inventoryIntentRoutes.mjs";

export async function handleInventoryReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  filterByKeyword,
  filterByValue,
  paginate,
  sendNotFound,
  cleanServerText,
  findInventoryCorrectionDraft,
  buildInventoryCorrectionDraftDetail,
  filterInventoryCorrectionDraftSummaries,
  toInventoryCorrectionDraftSummary,
  inventoryIntentRouteModule = defaultInventoryIntentRouteModule,
}) {
  if (url.pathname === "/api/inventory/items") {
    let items = workspace.inventories;
    items = filterByKeyword(items, url.searchParams.get("keyword"), ["id", "size", "color", "handle", "style", "zone", "state"]);
    items = filterByValue(items, url.searchParams.get("size"), "size");
    items = filterByValue(items, url.searchParams.get("color"), "color");
    items = filterByValue(items, url.searchParams.get("handleType"), "handle");
    items = filterByValue(items, url.searchParams.get("style"), "style");
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/inventory/ledger-entries") {
    sendJson(
      response,
      200,
      await workspace.inventoryLedgerReadRepository.listInventoryLedgerEntries({
        workspace,
        query: url.searchParams,
      }),
    );
    return true;
  }

  if (await inventoryIntentRouteModule.handleReadRoutes({ url, response, workspace, sendJson })) return true;

  if (url.pathname === "/api/inventory/correction-drafts") {
    const items = filterInventoryCorrectionDraftSummaries(
      (workspace.inventoryCorrectionDrafts ?? []).map((draft) => toInventoryCorrectionDraftSummary(workspace, draft)),
      url.searchParams,
    );
    sendJson(response, 200, {
      ...paginate(items, url.searchParams),
      filters: {
        status: cleanServerText(url.searchParams.get("status")) || "待确认生效",
        inventoryItemId: cleanServerText(url.searchParams.get("inventoryItemId")),
        keyword: cleanServerText(url.searchParams.get("keyword")),
      },
    });
    return true;
  }

  const correctionDraftMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)$/);
  if (!correctionDraftMatch) return false;

  const draft = findInventoryCorrectionDraft(workspace, decodeURIComponent(correctionDraftMatch[1]));
  if (!draft) sendNotFound(response, "INVENTORY_CORRECTION_DRAFT_NOT_FOUND");
  else sendJson(response, 200, buildInventoryCorrectionDraftDetail(workspace, draft));
  return true;
}
