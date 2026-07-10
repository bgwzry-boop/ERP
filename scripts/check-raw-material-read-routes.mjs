import assert from "node:assert/strict";
import { handleRawMaterialReadRoutes } from "../server/routes/rawMaterialReadRoutes.mjs";

const calls = [];
const workspace = {
  rawMaterialInboundRepository: {
    async listRawMaterialInbounds({ query }) {
      return { items: [{ inboundId: "RMI-1" }], page: Number(query.get("page") ?? 1) };
    },
    async getRawMaterialInbound({ inboundId }) {
      return inboundId === "RMI-1" ? { inboundId } : null;
    },
  },
  rawMaterialSupplierStatementReviewRepository: {
    async listReviews({ query }) {
      return { items: [{ reviewId: "RMS-1" }], status: query.get("status") ?? "all" };
    },
  },
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
};

await expectJson("/api/raw-material-inbounds?page=2", { items: [{ inboundId: "RMI-1" }], page: 2 });
await expectJson("/api/raw-material-supplier-statement-reviews?status=open", { items: [{ reviewId: "RMS-1" }], status: "open" });
await expectJson("/api/raw-material-inbounds/RMI-1", { inbound: { inboundId: "RMI-1" } });
await expectNotFound("/api/raw-material-inbounds/MISSING", "RAW_MATERIAL_INBOUND_NOT_FOUND");
assert.equal(await handleRawMaterialReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/raw-material-inbounds/RMI-1/labels") }), false);

console.log("raw-material read routes checks passed");

async function expectJson(pathname, body) {
  assert.equal(await handleRawMaterialReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "json", response: dependencies.response, status: 200, body });
}

async function expectNotFound(pathname, code) {
  assert.equal(await handleRawMaterialReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code });
}
