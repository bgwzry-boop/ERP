import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";

export async function checkAttachmentApi({ baseUrl, headers, postJson, getJson }) {
  const attachmentUploadBody = {
    ownerType: "statement",
    ownerId: "ST-LIVE-API-001",
    purpose: "payment_screenshot",
    fileType: "image",
    fileName: "payment-proof-postgres-live.svg",
    mimeType: "image/svg+xml",
    uploadedBy: "U-OFFICE-A",
    contentRef: "p0://payment-screenshot/ST-LIVE-API-001/postgres-live",
    contentDataUrl:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIj48dGV4dCB4PSIxMCIgeT0iNjAiPlBvc3RncmVzIExpdmU8L3RleHQ+PC9zdmc+",
  };
  const created = await postJson(baseUrl, "/api/attachments", attachmentUploadBody, { headers });
  postgresAssertions.assertCreated({ created });

  const duplicateCreated = await postJson(
    baseUrl,
    "/api/attachments",
    { ...attachmentUploadBody, fileName: "payment-proof-postgres-live-copy.svg" },
    { headers },
  );
  postgresAssertions.assertDuplicateCreated({ duplicateCreated, created });

  const listed = await getJson(
    baseUrl,
    "/api/attachments?ownerType=statement&ownerId=ST-LIVE-API-001&purpose=payment_screenshot&fileType=image",
    { headers },
  );
  postgresAssertions.assertListed({ listed, created });

  const contentResponse = await fetch(`${baseUrl}/api/attachments/${created.attachmentId}/content`, { headers });
  assert.equal(contentResponse.status, 200);
  assert.equal(contentResponse.headers.get("content-type"), "image/svg+xml");
  assert.match(await contentResponse.text(), /Postgres Live/);

  const accessUrl = await getJson(baseUrl, `/api/attachments/${created.attachmentId}/access-url?ttlSeconds=120`, {
    headers,
  });
  postgresAssertions.assertAccessUrl({ accessUrl, created });

  const accessLogs = await getJson(baseUrl, `/api/attachments/${created.attachmentId}/access-logs?limit=10`, {
    headers,
  });
  postgresAssertions.assertAccessLogs({ accessLogs });
}
