import { applyRawMaterialInboundAction } from "./rawMaterialInboundCommandService.mjs";

export function createRawMaterialInboundOrchestrator(repository, { now = () => new Date() } = {}) {
  if (typeof repository?.applyInboundAction !== "function") {
    throw new TypeError("Raw material inbound repository must implement applyInboundAction.");
  }

  return {
    applyAction(input = {}) {
      return repository.applyInboundAction({
        ...input,
        decide: ({ workspace, inbounds }) => applyRawMaterialInboundAction({
          ...input,
          workspace,
          inbounds,
        }),
      });
    },

    async recordInboundAction({ workspace, inboundId, actionSlug, body = {}, operatorId }) {
      try {
        const expectedRevision = Number(body.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
          throw Object.assign(new Error("expectedRevision 必须是当前记录的正整数版本号。"), {
            statusCode: 422,
            code: "EXPECTED_REVISION_REQUIRED",
          });
        }
        const user = (Array.isArray(workspace.users) ? workspace.users : []).find(
          (item) => cleanText(item?.id ?? item?.userId) === cleanText(operatorId),
        );
        const operatorName = cleanText(user?.displayName ?? user?.display_name ?? user?.name) || cleanText(operatorId);
        const result = await this.applyAction({
          workspace,
          inboundId,
          action: actionSlug,
          body: { ...body, expectedRevision },
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload: body,
          operatorId,
          operatorName,
          serverNow: toIsoTimestamp(now()),
        });
        if (result.operationLog && typeof result.operationLog === "object") {
          const rows = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
          const operationLogId = cleanText(result.operationLog.id);
          workspace.operationLogs = [
            result.operationLog,
            ...rows.filter((row) => !operationLogId || cleanText(row?.id) !== operationLogId),
          ];
        }
        return {
          inbound: result.inbound,
          operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
        };
      } catch (error) {
        const statusCode = Number(error?.statusCode);
        const safeStatusCode = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
        const details = error?.details ?? (error?.currentRevision ? { currentRevision: error.currentRevision } : undefined);
        return {
          error: true,
          statusCode: safeStatusCode,
          code: cleanText(error?.code) || (safeStatusCode === 404
            ? "RAW_MATERIAL_INBOUND_NOT_FOUND"
            : "RAW_MATERIAL_INBOUND_ACTION_FAILED"),
          message: cleanText(error?.message) || "Raw material inbound action failed.",
          ...(details ? { details } : {}),
        };
      }
    },
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
