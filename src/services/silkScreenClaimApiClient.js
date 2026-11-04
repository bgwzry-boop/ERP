// P2-02 丝印个人认领：领任务池、领取、释放。
import { createOfficeIdempotencyKey, readOfficeApiJson, requestOfficeApi, toOfficeApiError } from "./officeApiClientCore.js";

export async function listSilkScreenClaimPool({ authState, signal } = {}) {
  return send("/production-schedules/silk-screen-pool", { authState, signal, method: "GET" }, "领任务列表读取失败，请稍后刷新。");
}

export async function claimSilkScreenTask({ authState, productionTaskId, expectedRevision, idempotencyKey = createOfficeIdempotencyKey() } = {}) {
  return send(`/production-tasks/${encodeURIComponent(productionTaskId)}/claim`, {
    authState,
    method: "POST",
    idempotencyKey,
    body: { expectedRevision, idempotencyKey },
  }, "领取没有成功，请刷新后再试。");
}

export async function releaseSilkScreenTask({ authState, productionTaskId, expectedRevision, reason = "", idempotencyKey = createOfficeIdempotencyKey() } = {}) {
  return send(`/production-tasks/${encodeURIComponent(productionTaskId)}/release`, {
    authState,
    method: "POST",
    idempotencyKey,
    body: { expectedRevision, reason, idempotencyKey },
  }, "释放没有成功，请刷新后再试。");
}

async function send(path, options, fallbackMessage) {
  try {
    const response = await requestOfficeApi(path, { ...options, serverRequired: true });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return { ok: false, uncertain: response.status >= 500, error: toOfficeApiError(json, response.status, fallbackMessage) };
    return { ok: true, data: json };
  } catch (error) {
    if (error?.code === "REQUEST_ABORTED") return { ok: false, aborted: true, error: { code: "REQUEST_ABORTED", message: "请求已取消。" } };
    // The request may or may not have reached the server: the caller refreshes before letting anyone retry.
    return { ok: false, uncertain: true, error: { code: "REQUEST_UNAVAILABLE", message: "网络不稳，结果没确认，请刷新列表核对后再操作。" } };
  }
}
