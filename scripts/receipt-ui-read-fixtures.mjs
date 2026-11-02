import { buildRawMaterialInboundListResponse } from "../server/services/rawMaterialInboundReadProjectionService.mjs";

// Browser-only fixtures follow the same list/detail contract as the server.
// Never let a mocked receipt id fall through to the real local business API.
export async function fulfillReceiptRead(route, records) {
  if (route.request().method() !== "GET") return false;
  const url = new URL(route.request().url());
  if (url.pathname === "/api/raw-material-inbounds") {
    await route.fulfill({ json: buildRawMaterialInboundListResponse(records, url.searchParams) });
    return true;
  }
  const match = /^\/api\/raw-material-inbounds\/([^/]+)$/u.exec(url.pathname);
  if (!match) return false;
  const inbound = records.find(item => item.id === decodeURIComponent(match[1]));
  await route.fulfill(inbound ? { json: { inbound } } : { status: 404, json: { code: "MOCK_RECEIPT_NOT_FOUND" } });
  return true;
}

export async function openReceiptQueue(page) {
  await page.locator(".receipt-queue-item").first().waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const list = document.querySelector(".receiving-workbench .secondary-list");
    const back = document.querySelector(".formal-receiving-back");
    return Boolean(list?.getClientRects().length || back?.getClientRects().length);
  });
  if (!(await page.locator(".receiving-workbench .secondary-list").isVisible())) {
    // The first detail read can still be pending at narrow desktop widths.
    // Wait for its real back/empty-state entry instead of clicking hidden rows.
    await page.getByRole("button", { name: "← 返回单据队列", exact: true }).click();
  }
}

export async function selectReceiptRow(page, id) {
  await openReceiptQueue(page);
  await page.locator(`button.receipt-queue-item:has([title*="${id}"])`).click();
  await page.locator(".formal-receiving-workspace").getByText(id, { exact: true }).first().waitFor();
}

export async function selectReceiptTab(page, name) {
  await openReceiptQueue(page);
  await page.getByRole("tab", { name, exact: true }).click();
}
