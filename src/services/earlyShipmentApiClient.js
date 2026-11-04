// P2-03 先发已做好的部分：办公室把车间已做好的数量先发，剩下的拆成续做明细。
import { createOfficeIdempotencyKey, readOfficeApiJson, requestOfficeApi, toOfficeApiError } from "./officeApiClientCore.js";

export async function splitForEarlyShipment({ authState, productionTaskId, expectedRevision, reason = "", idempotencyKey = createOfficeIdempotencyKey() } = {}) {
  try {
    const response = await requestOfficeApi(`/production-tasks/${encodeURIComponent(productionTaskId)}/early-shipment`, {
      authState,
      method: "POST",
      idempotencyKey,
      serverRequired: true,
      body: { expectedRevision, reason, idempotencyKey },
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return { ok: false, uncertain: response.status >= 500, error: toOfficeApiError(json, response.status, "先发拆分没有成功，请刷新后再试。") };
    return { ok: true, data: json };
  } catch {
    return { ok: false, uncertain: true, error: { code: "REQUEST_UNAVAILABLE", message: "网络不稳，结果没确认，请刷新核对，不要重复点。" } };
  }
}

export async function setEarlyShipmentRequest({ authState, productionTaskId, expectedRevision, requested = true, note = "", idempotencyKey = createOfficeIdempotencyKey() } = {}) {
  try {
    const response = await requestOfficeApi(`/production-tasks/${encodeURIComponent(productionTaskId)}/early-shipment-request`, {
      authState,
      method: "POST",
      idempotencyKey,
      serverRequired: true,
      body: { expectedRevision, requested, note, idempotencyKey },
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return { ok: false, uncertain: response.status >= 500, error: toOfficeApiError(json, response.status, "没有安排成功，请刷新后再试。") };
    return { ok: true, data: json };
  } catch {
    return { ok: false, uncertain: true, error: { code: "REQUEST_UNAVAILABLE", message: "网络不稳，结果没确认，请刷新核对。" } };
  }
}
