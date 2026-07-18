import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildPostgresIdempotencyRequest,
  readPostgresIdempotencyReplay,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";
import {
  buildRawMaterialActionIdempotencyScope,
  rawMaterialWriteConflict,
  readLocalRawMaterialActionReplay,
  recordLocalRawMaterialActionResult,
} from "./rawMaterialInboundConcurrency.mjs";
import {
  createRawMaterialInboundLocalStore,
  rawMaterialInboundStoreKey,
} from "./rawMaterialInboundLocalStore.mjs";
import {
  buildFindRawMaterialInboundPayloadQuery,
  buildFindRawMaterialInboundPayloadSql,
  buildInsertRawMaterialInboundDraftTransactionQuery,
  buildInsertRawMaterialInboundDraftTransactionSql,
  buildListRawMaterialInboundPayloadsQuery,
  buildListRawMaterialInboundPayloadsSql,
  buildUpsertRawMaterialInboundPayloadTransactionQuery,
  buildUpsertRawMaterialInboundPayloadTransactionSql,
} from "./rawMaterialInboundPostgresQueryBuilder.mjs";
import { buildRawMaterialInboundListResponse } from "./services/rawMaterialInboundReadProjectionService.mjs";
import { applyRawMaterialOcrReparse, applyRawMaterialOcrReview } from "./rawMaterialInboundOcrSupport.mjs";
import {
  buildRawMaterialProductionTaskGoodsSpec,
  findRawMaterialCustomer,
  findRawMaterialOrderLine,
  findRawMaterialProductionTask,
  normalizeOperationLog,
  normalizeRawMaterialInbound,
  normalizeRawMaterialInboundActionResult,
  normalizeRawMaterialInbounds,
  resolveRawMaterialProductionTaskMatch,
} from "./rawMaterialInboundRecordService.mjs";
import { createRawMaterialCostMarginBuilder } from "./rawMaterialCostMarginBuilderService.mjs";
import {
  normalizeRawMaterialCostAllocationConfirmations,
  normalizeRawMaterialCostAllocationDrafts,
  normalizeRawMaterialCostAllocationWarnings,
  normalizeRawMaterialCostLossCalibrations,
  normalizeRawMaterialOrderMarginReports,
  normalizeRawMaterialOrderMarginSnapshots,
} from "./rawMaterialCostMarginRecordNormalizer.mjs";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
  normalizeRawMaterialLeftoverReturnRecords,
  normalizeRawMaterialLeftoverReviewRecords,
  normalizeRawMaterialSplitRecords,
} from "./rawMaterialTraceabilityRecordNormalizer.mjs";
export { rawMaterialInboundStoreKey, normalizeRawMaterialInbounds, buildRawMaterialInboundListResponse };
export {
  buildFindRawMaterialInboundPayloadQuery,
  buildFindRawMaterialInboundPayloadSql,
  buildInsertRawMaterialInboundDraftTransactionQuery,
  buildInsertRawMaterialInboundDraftTransactionSql,
  buildListRawMaterialInboundPayloadsQuery,
  buildListRawMaterialInboundPayloadsSql,
  buildUpsertRawMaterialInboundPayloadTransactionQuery,
  buildUpsertRawMaterialInboundPayloadTransactionSql,
};

const rawMaterialCostMarginBuilder = createRawMaterialCostMarginBuilder({
  findProductionTask: findRawMaterialProductionTask,
  findOrderLine: findRawMaterialOrderLine,
  findCustomer: findRawMaterialCustomer,
  buildGoodsSpec: buildRawMaterialProductionTaskGoodsSpec,
});

export function createRawMaterialInboundRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_RAW_MATERIAL_INBOUND_STORE ??
    process.env.ERP_RAW_MATERIAL_STORE ??
    "local";
  if (mode === "local") {
    return createLocalRawMaterialInboundRepository({
      storageRoot: options.storageRoot,
    });
  }
  if (mode === "postgres") {
    return createPostgresRawMaterialInboundRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_RAW_MATERIAL_INBOUND_DATABASE_URL ??
        process.env.ERP_RAW_MATERIAL_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  throw new Error(`Unsupported raw material inbound repository mode: ${mode}`);
}

export function createLocalRawMaterialInboundRepository(options = {}) {
  const store = createRawMaterialInboundLocalStore({ storageRoot: options.storageRoot });

  return {
    kind: "local_json",

    loadState({ seedInbounds = [] } = {}) {
      return store.load({ seedInbounds });
    },

    listRawMaterialInbounds({ workspace, query } = {}) {
      return buildRawMaterialInboundListResponse(workspace?.rawMaterialInbounds, query);
    },

    getRawMaterialInbound({ workspace, inboundId }) {
      return findRawMaterialInbound(workspace, inboundId);
    },

    createRawMaterialInboundDraft({ workspace, inbound, operationLog }) {
      const safeInbound = normalizeRawMaterialInbound(inbound);
      if (!safeInbound?.id) throw Object.assign(new Error("Raw material inbound id is required"), { statusCode: 422 });
      const existing = findRawMaterialInbound(workspace, safeInbound.id);
      if (existing) {
        if (existing.ocrSourceDigest && existing.ocrSourceDigest === safeInbound.ocrSourceDigest) {
          return { inbound: existing, operationLog: null, deduplicated: true };
        }
        throw Object.assign(new Error(`Raw material inbound already exists: ${safeInbound.id}`), {
          statusCode: 409,
          code: "RAW_MATERIAL_INBOUND_ALREADY_EXISTS",
        });
      }
      const safeOperationLog = normalizeOperationLog(operationLog);
      workspace.rawMaterialInbounds = [safeInbound, ...normalizeRawMaterialInbounds(workspace.rawMaterialInbounds)];
      store.save(workspace.rawMaterialInbounds);
      return { inbound: safeInbound, operationLog: safeOperationLog, deduplicated: false };
    },

    recordRawMaterialInboundAction(input = {}) {
      const replay = readLocalRawMaterialActionReplay(input);
      if (replay) return replay;
      const { workspace, inboundId, action, body = {}, operatorName, operatorId, serverNow } = input;
      const result = applyRawMaterialInboundAction({
        workspace,
        inbounds: workspace?.rawMaterialInbounds,
        inboundId,
        action,
        body,
        operatorId,
        operatorName,
        serverNow,
      });
      if (!result.inbound) {
        throw Object.assign(new Error(`Raw material inbound not found: ${inboundId}`), { statusCode: 404 });
      }
      workspace.rawMaterialInbounds = result.inbounds;
      recordLocalRawMaterialActionResult(input, result);
      store.save(workspace.rawMaterialInbounds);
      return {
        inbound: result.inbound,
        operationLog: result.operationLog,
      };
    },
  };
}

export function createPostgresRawMaterialInboundRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    postgresClient,
  });

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListRawMaterialInboundPayloadsQuery({});
      return {
        rawMaterialInbounds: normalizeRawMaterialInbounds(await queryJson(builtQuery.text, builtQuery.values)),
      };
    },

    async listRawMaterialInbounds({ query } = {}) {
      const builtQuery = buildListRawMaterialInboundPayloadsQuery({ query });
      return buildRawMaterialInboundListResponse(await queryJson(builtQuery.text, builtQuery.values), query);
    },

    async getRawMaterialInbound({ inboundId }) {
      const builtQuery = buildFindRawMaterialInboundPayloadQuery(inboundId);
      return normalizeRawMaterialInbound(await queryJson(builtQuery.text, builtQuery.values));
    },

    async createRawMaterialInboundDraft(input = {}) {
      const safeInbound = normalizeRawMaterialInbound(input.inbound);
      if (!safeInbound?.id) throw Object.assign(new Error("Raw material inbound id is required"), { statusCode: 422 });
      const existing = normalizeRawMaterialInbounds(input.workspace?.rawMaterialInbounds).find(
        (item) => item.id === safeInbound.id,
      );
      if (existing?.ocrSourceDigest && existing.ocrSourceDigest === safeInbound.ocrSourceDigest) {
        return { inbound: existing, operationLog: null, operationLogId: "", deduplicated: true };
      }
      const operationLog = normalizeOperationLog(input.operationLog);
      const builtQuery = buildInsertRawMaterialInboundDraftTransactionQuery(safeInbound, operationLog);
      const saved = normalizeRawMaterialInboundActionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `raw-material.ocr.create.${safeInbound.id}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, operationLog?.id ?? safeInbound.id),
            payload: input.idempotencyPayload ?? { inboundId: safeInbound.id, ocrSourceDigest: safeInbound.ocrSourceDigest },
            operatorId: input.operatorId,
            targetType: "raw_material_inbound",
            targetId: safeInbound.id,
            resourceLocks: [`raw-material:${safeInbound.id}`],
            query: builtQuery,
          }),
        ),
      );
      const savedInbound = saved.inbound ?? safeInbound;
      input.workspace.rawMaterialInbounds = [
        savedInbound,
        ...normalizeRawMaterialInbounds(input.workspace.rawMaterialInbounds).filter((item) => item.id !== savedInbound.id),
      ];
      return {
        inbound: savedInbound,
        operationLog: saved.operationLogId === operationLog?.id ? operationLog : null,
        operationLogId: saved.operationLogId,
        deduplicated: false,
      };
    },

    async recordRawMaterialInboundAction(input = {}) {
      const scope = buildRawMaterialActionIdempotencyScope(input);
      const replay = await readPostgresIdempotencyReplay({
        queryJson,
        scope,
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload ?? input.body ?? {},
      });
      if (replay) {
        const savedReplay = normalizeRawMaterialInboundActionResult(replay);
        if (savedReplay.inbound) {
          input.workspace.rawMaterialInbounds = normalizeRawMaterialInbounds(input.workspace.rawMaterialInbounds).map((item) =>
            item.id === savedReplay.inbound.id ? savedReplay.inbound : item,
          );
        }
        return { ...savedReplay, replayed: true };
      }
      const result = applyRawMaterialInboundAction({
        workspace: input.workspace,
        inbounds: input.workspace?.rawMaterialInbounds,
        inboundId: input.inboundId,
        action: input.action,
        body: input.body,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
        serverNow: input.serverNow,
      });
      if (!result.inbound) {
        throw Object.assign(new Error(`Raw material inbound not found: ${input.inboundId}`), { statusCode: 404 });
      }
      const builtQuery = buildUpsertRawMaterialInboundPayloadTransactionQuery(
        { ...result.inbound, revision: result.expectedRevision },
        result.operationLog,
      );
      const saved = normalizeRawMaterialInboundActionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope,
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, result.operationLog?.id),
            payload: input.idempotencyPayload ?? input.body ?? {},
            operatorId: input.operatorId,
            targetType: "raw_material_inbound",
            targetId: input.inboundId,
            resourceLocks: [`raw-material:${input.inboundId}`],
            query: builtQuery,
          }),
        ),
      );
      const savedInbound = saved.inbound ?? result.inbound;
      input.workspace.rawMaterialInbounds = result.inbounds.map((item) =>
        item.id === savedInbound.id ? savedInbound : item,
      );
      return {
        inbound: savedInbound,
        operationLog: saved.operationLogId === result.operationLog?.id ? result.operationLog : null,
        operationLogId: saved.operationLogId,
      };
    },
  };
}

export function applyRawMaterialInboundAction(input = {}) {
  const workspace = input.workspace ?? {};
  const inbounds = normalizeRawMaterialInbounds(input.inbounds ?? workspace.rawMaterialInbounds);
  const inboundId = cleanText(input.inboundId);
  const index = inbounds.findIndex((item) => item.id === inboundId);
  if (index < 0) return { inbounds, inbound: null, operationLog: null };

  const action = normalizeAction(input.action);
  const before = inbounds[index];
  const expectedRevision = Number(input.body?.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw Object.assign(new Error("expectedRevision 必须是当前原材料入库单的正整数版本号。"), {
      statusCode: 422,
      code: "EXPECTED_REVISION_REQUIRED",
    });
  }
  if (expectedRevision !== Number(before.revision ?? 1)) {
    throw rawMaterialWriteConflict(before.revision);
  }
  const now = cleanText(input.serverNow) || new Date().toISOString();
  // Authentication owns the operator identity. Request fields may describe the physical check, never the system operator.
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName ?? operatorId ?? "U-OFFICE-A");
  let after = before;

  if (action === "reparse_ocr") {
    after = applyRawMaterialOcrReparse({ before, reparsedInbound: input.body?.reparsedInbound });
  }

  if (action === "review") {
    after = applyRawMaterialOcrReview({
      before,
      reviewFields: input.body?.reviewFields,
      lineReviews: input.body?.lineReviews,
      operatorName,
      operatorId,
      now,
    });
  }

  if (action === "print_labels") {
    if (before.status !== "已复核待打印标签") {
      throw Object.assign(new Error("送货单必须先完成办公室人工复核，才能打印一卷一标。"), {
        statusCode: 409, code: "RAW_MATERIAL_LABEL_PRINT_REQUIRES_REVIEW",
      });
    }
    after = {
      ...before,
      status: "已打印待贴标",
      labelPrintedBy: operatorName,
      labelPrintedByUserId: operatorId,
      labelPrintedAt: now,
      nextStep: "逐卷将标签贴到实物后，人工核对重量、颜色、规格和库位并确认。",
      rolls: (before.rolls ?? []).map((roll) => ({
        ...roll,
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
        labelVersion: roll.inventoryStatus === "可用" ? roll.labelVersion : nextRawMaterialLabelVersion(roll),
        labelPrintedAt: roll.inventoryStatus === "可用" ? roll.labelPrintedAt : now,
        labelPrintedBy: roll.inventoryStatus === "可用" ? roll.labelPrintedBy : operatorName,
        labelPrintedByUserId: roll.inventoryStatus === "可用" ? roll.labelPrintedByUserId : operatorId,
      })),
    };
  }

  if (action === "attach_confirm") {
    const rollId = cleanText(input.body?.rollId);
    if (!rollId) {
      throw Object.assign(new Error("每次贴标确认必须明确选择一卷或一件原材料。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ATTACH_ROLL_REQUIRED",
      });
    }
    const targetRoll = (before.rolls ?? []).find((roll) => roll.id === rollId);
    if (!targetRoll) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), {
        statusCode: 404,
        code: "RAW_MATERIAL_ROLL_NOT_FOUND",
      });
    }
    if (targetRoll.inventoryStatus === "可用") {
      throw Object.assign(new Error("该卷/件已经是可用库存，不能重复确认贴标。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ROLL_ALREADY_AVAILABLE",
      });
    }
    if (action === "void_label" && targetRoll.labelStatus !== "标签或实物不符/待确认") {
      throw Object.assign(new Error("只有标签或实物不符的异常卷/件可以作废当前标签。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LABEL_VOID_REQUIRES_MISMATCH",
      });
    }
    if (action === "reprint_label" && targetRoll.labelStatus !== "标签已作废/待重打") {
      throw Object.assign(new Error("请先作废当前异常标签，再重打该卷/件标签。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LABEL_REPRINT_REQUIRES_VOIDED_LABEL",
      });
    }
    if (targetRoll.labelStatus !== "已打印待贴标") {
      throw Object.assign(new Error("该卷/件必须先完成当前标签打印，才能进行贴标核对。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ATTACH_REQUIRES_CURRENT_LABEL",
      });
    }
    const matchResult = normalizeRawMaterialLabelMatchResult(input.body?.matchResult);
    if (!matchResult) {
      throw Object.assign(new Error("请明确选择标签与实物是否匹配。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LABEL_MATCH_RESULT_REQUIRED",
      });
    }
    const verification = buildRawMaterialLabelVerification({
      inbound: before,
      roll: targetRoll,
      body: input.body,
      matchResult,
      operatorId,
      operatorName,
      now,
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (roll.id !== rollId) return roll;
      if (matchResult === "matched") {
        return {
          ...roll,
          labelStatus: "已贴标/可用库存",
          inventoryStatus: "可用",
          labelVerification: verification,
          labelVerifiedAt: now,
          labelVerifiedBy: operatorName,
          labelVerifiedByUserId: operatorId,
          location: verification.location,
        };
      }
      return {
        ...roll,
        labelStatus: "标签或实物不符/待确认",
        inventoryStatus: "待确认",
        labelVerification: verification,
        labelVerifiedAt: now,
        labelVerifiedBy: operatorName,
        labelVerifiedByUserId: operatorId,
        location: verification.location || "原料隔离区",
      };
    });
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const nextStatus = buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount });
    after = {
      ...before,
      status: nextStatus,
      confirmedBy: operatorName,
      confirmedByUserId: operatorId,
      confirmedAt: now,
      labelVerificationSummary: {
        availableRollCount: availableCount,
        mismatchRollCount: mismatchCount,
        lastVerifiedRollId: rollId,
        lastMatchResult: matchResult,
      },
      nextStep:
        mismatchCount > 0
          ? "异常卷已隔离；可单独作废或重打该卷标签后重新核对，不影响已确认可用卷。"
          : availableCount === nextRolls.length
            ? "可领料；后续进入供应商月结对账。"
            : "继续逐卷核对剩余标签和实物。",
      rolls: nextRolls,
    };
  }

  if (action === "void_label" || action === "reprint_label") {
    const rollId = cleanText(input.body?.rollId);
    if (!rollId) {
      throw Object.assign(new Error("作废或重打标签必须明确选择一卷或一件原材料。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LABEL_ROLL_REQUIRED",
      });
    }
    const targetRoll = (before.rolls ?? []).find((roll) => roll.id === rollId);
    if (!targetRoll) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), {
        statusCode: 404,
        code: "RAW_MATERIAL_ROLL_NOT_FOUND",
      });
    }
    if (targetRoll.inventoryStatus === "可用") {
      throw Object.assign(new Error("已确认可用的卷/件不能通过标签作废或重打直接改变库存状态。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_AVAILABLE_ROLL_LABEL_CHANGE_BLOCKED",
      });
    }
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (roll.id !== rollId) return roll;
      if (action === "void_label") {
        return {
          ...roll,
          labelStatus: "标签已作废/待重打",
          inventoryStatus: "待确认",
          labelVoidedAt: now,
          labelVoidedBy: operatorName,
          labelVoidedByUserId: operatorId,
          labelVoidReason: cleanText(input.body?.reason) || "标签或实物不符",
        };
      }
      return {
        ...roll,
        labelStatus: "已打印待贴标",
        inventoryStatus: "待贴标",
        labelVersion: nextRawMaterialLabelVersion(roll),
        labelPrintedAt: now,
        labelPrintedBy: operatorName,
        labelPrintedByUserId: operatorId,
        labelVerification: null,
      };
    });
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    after = {
      ...before,
      status: buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount }),
      nextStep:
        action === "void_label"
          ? "该异常卷标签已作废；确认后可单独重打并重新核对。"
          : "新标签已生成待贴标；请将其贴到本卷/件并重新人工核对。",
      rolls: nextRolls,
    };
  }

  if (action === "issue_to_machine") {
    const rollId = cleanText(input.body?.rollId);
    const machineId = cleanText(input.body?.machineId);
    const productionTaskId = cleanText(input.body?.productionTaskId);
    if (!rollId) {
      throw Object.assign(new Error("机边领料必须选择已确认可用的单卷/件。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ISSUE_ROLL_REQUIRED",
      });
    }
    if (!machineId) {
      throw Object.assign(new Error("扫码出库必须填写领用机台或区域。"), {
        statusCode: 422, code: "RAW_MATERIAL_ISSUE_MACHINE_REQUIRED",
      });
    }
    const productionTaskMatch = resolveRawMaterialProductionTaskMatch({
      workspace,
      inbound: before,
      machineId,
      productionTaskId,
    });
    const issuePurpose = cleanText(input.body?.issuePurpose) || "生产领料";
    const requestedWeightKg = Number(input.body?.issuedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.issuedQuantity ?? input.body?.quantity);
    const availableRolls = (before.rolls ?? []).filter((roll) =>
      roll.inventoryStatus === "可用" && String(roll.labelStatus || "").includes("已贴标"));
    const targetAvailableRolls = rollId ? availableRolls.filter((roll) => roll.id === rollId) : availableRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetAvailableRolls.length) {
      throw Object.assign(new Error("Only available labeled raw-material rolls/pieces can be issued to machine side"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ISSUE_REQUIRES_AVAILABLE_ROLL",
      });
    }
    if (!rollId && (Number.isFinite(requestedWeightKg) || Number.isFinite(requestedQuantity))) {
      throw Object.assign(new Error("Measured raw-material issue requires a single rollId"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ISSUE_MEASURE_REQUIRES_ROLL",
      });
    }
    if (rollId && Number.isFinite(requestedWeightKg) && requestedWeightKg > 0 && targetAvailableRolls[0]?.weightKg > 0) {
      const fullWeight = Number(targetAvailableRolls[0].weightKg) || 0;
      if (requestedWeightKg - fullWeight > 0.001) {
        throw Object.assign(new Error("Issued raw-material weight cannot exceed available roll weight"), {
          statusCode: 422,
          code: "RAW_MATERIAL_ISSUE_WEIGHT_EXCEEDS_AVAILABLE",
        });
      }
    }
    if (rollId && Number.isFinite(requestedQuantity) && requestedQuantity > 0 && requestedQuantity !== 1) {
      throw Object.assign(new Error("V1 only supports full-piece raw-material issue; partial quantity issue requires a later workflow"), {
        statusCode: 422,
        code: "RAW_MATERIAL_PARTIAL_QUANTITY_ISSUE_NOT_SUPPORTED",
      });
    }
    const issueRecordId = `RMI-ISS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const splitRecordId = `RMI-SPLIT-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const issuedSourceRollIds = new Set(targetAvailableRolls.map((roll) => roll.id));
    const splitRecords = [];
    const issueRecords = targetAvailableRolls.map((roll, rollIndex) => {
      const fullWeightKg = Number(roll.weightKg) || 0;
      const isPartialWeightIssue =
        rollId === roll.id &&
        fullWeightKg > 0 &&
        Number.isFinite(requestedWeightKg) &&
        requestedWeightKg > 0 &&
        fullWeightKg - requestedWeightKg > 0.001;
      const issuedRollId = isPartialWeightIssue ? buildRawMaterialSplitRollId(before.rolls, roll.id) : roll.id;
      const issuedWeightKg = isPartialWeightIssue ? roundWeight(requestedWeightKg) : fullWeightKg;
      const remainingWeightKg = isPartialWeightIssue ? roundWeight(fullWeightKg - requestedWeightKg) : 0;
      const currentSplitRecordId = isPartialWeightIssue ? `${splitRecordId}-${String(splitRecords.length + 1).padStart(2, "0")}` : "";
      if (isPartialWeightIssue) {
        splitRecords.push({
          splitRecordId: currentSplitRecordId,
          inboundId: before.id,
          sourceRollId: roll.id,
          issuedRollId,
          supplierRollNo: roll.supplierRollNo,
          materialType: before.materialType,
          productName: before.productName,
          spec: before.spec,
          factoryColor: before.factoryColor,
          sourceWeightKg: fullWeightKg,
          issuedWeightKg,
          remainingWeightKg,
          unit: before.unit || "kg",
          splitMode: "部分领料/拆卷",
          machineId,
          productionTaskId,
          productionTaskMatchStatus: productionTaskMatch.status,
          productionTaskMatchReason: productionTaskMatch.reason,
          productionTaskOrderLineId: productionTaskMatch.orderLineId,
          productionTaskMachineId: productionTaskMatch.machineId,
          productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
          splitBy: operatorName,
          splitByUserId: operatorId,
          splitAt: now,
          note: cleanText(input.body?.note) || "V1 记录拆卷领料和剩余可用重量；仍不做成本分摊或损耗校准。",
        });
      }
      return {
        issueRecordId: `${issueRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        rollId: issuedRollId,
        sourceRollId: isPartialWeightIssue ? roll.id : "",
        splitRecordId: currentSplitRecordId,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        issuedWeightKg,
        issuedQuantity: fullWeightKg > 0 ? 0 : 1,
        sourceWeightKg: fullWeightKg,
        remainingWeightKg,
        unit: before.unit || (fullWeightKg > 0 ? "kg" : "件"),
        machineId,
        productionTaskId,
        productionTaskMatchStatus: productionTaskMatch.status,
        productionTaskMatchReason: productionTaskMatch.reason,
        productionTaskOrderLineId: productionTaskMatch.orderLineId,
        productionTaskMachineId: productionTaskMatch.machineId,
        productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
        issuePurpose,
        issueMode: isPartialWeightIssue ? "部分领料/拆卷" : "整卷/整件领料",
        consumptionStatus: "待生产消耗确认",
        issuedBy: operatorName,
        issuedByUserId: operatorId,
        issuedAt: now,
        note: cleanText(input.body?.note) || (isPartialWeightIssue
          ? "V1 记录拆卷机边领料，剩余重量保留可用；不生成成品数量或成本分摊。"
          : "V1 记录整卷/整件机边领料，不生成成品数量，不做成本分摊。"),
      };
    });
    const nextRolls = (before.rolls ?? []).flatMap((roll) => {
      if (!issuedSourceRollIds.has(roll.id)) return [roll];
      const splitRecord = splitRecords.find((item) => item.sourceRollId === roll.id);
      if (splitRecord) {
        const issueRecord = issueRecords.find((item) => item.rollId === splitRecord.issuedRollId);
        const sourceRoll = {
          ...roll,
          weightKg: splitRecord.remainingWeightKg,
          inventoryStatus: "可用",
          location: roll.location || "原料库-可用区",
          splitRecordId: splitRecord.splitRecordId,
          splitStatus: "已拆卷/部分领料",
          splitAt: now,
          splitBy: operatorName,
          splitByUserId: operatorId,
          originalWeightKg: splitRecord.sourceWeightKg,
          splitIssuedWeightKg: splitRecord.issuedWeightKg,
          splitRemainingWeightKg: splitRecord.remainingWeightKg,
        };
        const issuedRoll = {
          ...roll,
          id: splitRecord.issuedRollId,
          supplierRollNo: roll.supplierRollNo ? `${roll.supplierRollNo}/拆1` : `${roll.id}/拆1`,
          weightKg: splitRecord.issuedWeightKg,
          parentRollId: roll.id,
          sourceRollId: roll.id,
          splitRecordId: splitRecord.splitRecordId,
          splitStatus: "拆出机边领料",
          inventoryStatus: "机边领用",
          location: machineId === "机边待分配" ? "机边待消耗区" : `机边-${machineId}`,
          issueRecordId: issueRecord.issueRecordId,
          issuedAt: now,
          issuedBy: operatorName,
          issuedByUserId: operatorId,
          machineId,
          productionTaskId,
          productionTaskMatchStatus: productionTaskMatch.status,
          productionTaskMatchReason: productionTaskMatch.reason,
          productionTaskOrderLineId: productionTaskMatch.orderLineId,
          productionTaskMachineId: productionTaskMatch.machineId,
          productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
          issuePurpose,
          consumptionStatus: "待生产消耗确认",
        };
        return [sourceRoll, issuedRoll];
      }
      const record = issueRecords.find((item) => item.rollId === roll.id);
      return [{
        ...roll,
        inventoryStatus: "机边领用",
        location: machineId === "机边待分配" ? "机边待消耗区" : `机边-${machineId}`,
        issueRecordId: record.issueRecordId,
        issuedAt: now,
        issuedBy: operatorName,
        issuedByUserId: operatorId,
        machineId,
        productionTaskId,
        productionTaskMatchStatus: productionTaskMatch.status,
        productionTaskMatchReason: productionTaskMatch.reason,
        productionTaskOrderLineId: productionTaskMatch.orderLineId,
        productionTaskMachineId: productionTaskMatch.machineId,
        productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
        issuePurpose,
        consumptionStatus: "待生产消耗确认",
      }];
    });
    const issuedCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = nextRolls.length > 0 && issuedCount === nextRolls.length ? "已领料/机边" : "部分领料/机边";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      issuedBy: operatorName,
      issuedByUserId: operatorId,
      issuedAt: now,
      machineId,
      productionTaskId,
      productionTaskMatchStatus: productionTaskMatch.status,
      productionTaskMatchReason: productionTaskMatch.reason,
      productionTaskOrderLineId: productionTaskMatch.orderLineId,
      productionTaskMachineId: productionTaskMatch.machineId,
      productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
      nextStep: productionTaskId ? "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。"
        : "已扫码出库并记录机台、颜色、规格、宽幅和重量；首发阶段暂不关联订单或生产任务。",
      rawMaterialIssueRecords: [
        ...normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords),
        ...issueRecords,
      ],
      rawMaterialSplitRecords: [
        ...normalizeRawMaterialSplitRecords(before.rawMaterialSplitRecords),
        ...splitRecords,
      ],
      rolls: nextRolls,
    };
  }

  if (action === "confirm_consumption") {
    const rollId = cleanText(input.body?.rollId);
    const requestedWeightKg = Number(input.body?.consumedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.consumedQuantity ?? input.body?.quantity);
    const machineSideRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用");
    const targetMachineSideRolls = rollId ? machineSideRolls.filter((roll) => roll.id === rollId) : machineSideRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetMachineSideRolls.length) {
      throw Object.assign(new Error("Only machine-side raw-material rolls/pieces can be confirmed as consumed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_CONSUMPTION_REQUIRES_MACHINE_SIDE_ROLL",
      });
    }
    if (targetMachineSideRolls.length > 1 && (Number.isFinite(requestedWeightKg) || Number.isFinite(requestedQuantity))) {
      throw Object.assign(new Error("Measured raw-material consumption requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_CONSUMPTION_MEASURE_REQUIRES_ROLL",
      });
    }

    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    for (const roll of targetMachineSideRolls) {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const fullWeightKg = Number(roll.weightKg) || Number(issueRecord?.issuedWeightKg) || 0;
      if (Number.isFinite(requestedWeightKg) && requestedWeightKg > 0 && fullWeightKg > 0 && Math.abs(requestedWeightKg - fullWeightKg) > 0.001) {
        if (requestedWeightKg - fullWeightKg > 0.001) {
          throw Object.assign(new Error("Consumed raw-material weight cannot exceed machine-side weight"), {
            statusCode: 422,
            code: "RAW_MATERIAL_CONSUMPTION_WEIGHT_EXCEEDS_MACHINE_SIDE",
          });
        }
      }
      if (Number.isFinite(requestedQuantity) && requestedQuantity > 0 && requestedQuantity !== 1) {
        throw Object.assign(new Error("V1 consumption confirmation only supports full-piece consumption; partial quantity requires return-leftover workflow"), {
          statusCode: 422,
          code: "RAW_MATERIAL_PARTIAL_QUANTITY_CONSUMPTION_NOT_SUPPORTED",
        });
      }
    }

    const consumptionRecordId = `RMI-CONS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const consumedRollIds = new Set(targetMachineSideRolls.map((roll) => roll.id));
    const consumptionRecords = targetMachineSideRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const machineSideWeightKg =
        Number(roll.weightKg) ||
        Number(issueRecord?.remainingMachineSideWeightKg) ||
        Number(issueRecord?.remainingWeightKg) ||
        Number(issueRecord?.issuedWeightKg) ||
        0;
      const isPartialWeightConsumption =
        machineSideWeightKg > 0 &&
        Number.isFinite(requestedWeightKg) &&
        requestedWeightKg > 0 &&
        machineSideWeightKg - requestedWeightKg > 0.001;
      const consumedWeightKg = isPartialWeightConsumption ? roundWeight(requestedWeightKg) : machineSideWeightKg;
      const remainingMachineSideWeightKg = isPartialWeightConsumption ? roundWeight(machineSideWeightKg - requestedWeightKg) : 0;
      const consumedQuantity = consumedWeightKg > 0 ? 0 : 1;
      return {
        consumptionRecordId: `${consumptionRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        consumedWeightKg,
        consumedQuantity,
        consumedFromWeightKg: machineSideWeightKg,
        remainingMachineSideWeightKg,
        partialConsumption: isPartialWeightConsumption,
        unit: before.unit || (consumedWeightKg > 0 ? "kg" : "件"),
        machineId: cleanText(input.body?.machineId) || roll.machineId || issueRecord?.machineId || "机边待分配",
        productionTaskId: cleanText(input.body?.productionTaskId) || roll.productionTaskId || issueRecord?.productionTaskId || "",
        machineCount: cleanText(input.body?.machineCount),
        qualifiedOutputQuantity: Number(input.body?.qualifiedOutputQuantity) || 0,
        consumptionStatus: isPartialWeightConsumption ? "部分消耗/机边" : "已确认消耗",
        confirmedBy: operatorName,
        confirmedByUserId: operatorId,
        confirmedAt: now,
        note: cleanText(input.body?.note) || (isPartialWeightConsumption
          ? "V1 记录机边部分消耗，剩余重量仍在机边；机台计数不等于合格成品数量，不做成本分摊。"
          : "V1 仅确认整卷/整件已消耗；机台计数不等于合格成品数量，不做成本分摊。"),
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!consumedRollIds.has(roll.id)) return roll;
      const record = consumptionRecords.find((item) => item.rollId === roll.id);
      if (record?.partialConsumption) {
        return {
          ...roll,
          weightKg: record.remainingMachineSideWeightKg,
          inventoryStatus: "机边领用",
          location: roll.location || (record.machineId === "机边待分配" ? "机边待消耗区" : `机边-${record.machineId}`),
          consumptionStatus: "部分消耗/机边",
          consumptionRecordId: record.consumptionRecordId,
          consumedAt: now,
          consumedBy: operatorName,
          consumedByUserId: operatorId,
          lastConsumedWeightKg: record.consumedWeightKg,
          remainingMachineSideWeightKg: record.remainingMachineSideWeightKg,
        };
      }
      return {
        ...roll,
        inventoryStatus: "已消耗",
        location: "已消耗归档",
        consumptionStatus: "已确认消耗",
        consumptionRecordId: record.consumptionRecordId,
        consumedAt: now,
        consumedBy: operatorName,
        consumedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      consumedRollIds.has(record.rollId)
        ? (() => {
            const consumptionRecord = consumptionRecords.find((item) => item.rollId === record.rollId);
            const previousConsumedWeightKg = Number(record.consumedWeightKg) || 0;
            return {
              ...record,
              consumptionStatus: consumptionRecord?.partialConsumption ? "部分消耗/机边" : "已确认消耗",
              consumptionRecordId: consumptionRecord?.consumptionRecordId || "",
              consumedWeightKg: roundWeight(previousConsumedWeightKg + (Number(consumptionRecord?.consumedWeightKg) || 0)),
              remainingMachineSideWeightKg: Number(consumptionRecord?.remainingMachineSideWeightKg) || 0,
              consumedAt: now,
              consumedBy: operatorName,
              consumedByUserId: operatorId,
            };
          })()
        : record,
    );
    const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = machineSideCount ? "部分消耗确认" : consumedCount === nextRolls.length ? "已消耗确认" : "部分消耗确认";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      consumedBy: operatorName,
      consumedByUserId: operatorId,
      consumedAt: now,
      nextStep: "已形成原材料消耗留痕；后续成本分摊、损耗校准和毛利报表仍需独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: [
        ...normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords),
        ...consumptionRecords,
      ],
      rolls: nextRolls,
    };
  }

  if (action === "return_leftover") {
    const rollId = cleanText(input.body?.rollId);
    const machineSideRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用");
    const targetMachineSideRolls = rollId ? machineSideRolls.filter((roll) => roll.id === rollId) : machineSideRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetMachineSideRolls.length) {
      throw Object.assign(new Error("Only machine-side raw-material rolls/pieces can be returned as leftovers"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LEFTOVER_RETURN_REQUIRES_MACHINE_SIDE_ROLL",
      });
    }
    if (targetMachineSideRolls.length > 1 && (Number.isFinite(Number(input.body?.leftoverWeightKg)) || Number.isFinite(Number(input.body?.leftoverQuantity)))) {
      throw Object.assign(new Error("Measured raw-material leftover return requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LEFTOVER_MEASURE_REQUIRES_ROLL",
      });
    }

    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const returnRecordId = `RMI-RET-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const returnedRollIds = new Set(targetMachineSideRolls.map((roll) => roll.id));
    const returnLocation = cleanText(input.body?.returnLocation) || "余料区";
    const returnRecords = targetMachineSideRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const issuedWeightKg = Number(issueRecord?.issuedWeightKg) || Number(roll.weightKg) || 0;
      const machineSideWeightKg =
        Number(roll.weightKg) ||
        Number(issueRecord?.remainingMachineSideWeightKg) ||
        Number(issueRecord?.remainingWeightKg) ||
        issuedWeightKg;
      const requestedLeftoverWeightKg = Number(input.body?.leftoverWeightKg);
      const requestedLeftoverQuantity = Number(input.body?.leftoverQuantity);
      const leftoverWeightKg = machineSideWeightKg > 0
        ? (Number.isFinite(requestedLeftoverWeightKg) && requestedLeftoverWeightKg > 0 ? Math.min(requestedLeftoverWeightKg, machineSideWeightKg) : machineSideWeightKg)
        : 0;
      const leftoverQuantity = machineSideWeightKg > 0
        ? 0
        : (Number.isFinite(requestedLeftoverQuantity) && requestedLeftoverQuantity > 0 ? requestedLeftoverQuantity : 1);
      return {
        leftoverReturnRecordId: `${returnRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        issuedWeightKg,
        machineSideWeightKg,
        leftoverWeightKg,
        leftoverQuantity,
        unit: before.unit || (issuedWeightKg > 0 ? "kg" : "件"),
        machineId: cleanText(input.body?.machineId) || roll.machineId || issueRecord?.machineId || "机边待分配",
        productionTaskId: cleanText(input.body?.productionTaskId) || roll.productionTaskId || issueRecord?.productionTaskId || "",
        returnLocation,
        returnReason: cleanText(input.body?.reason) || "机边余料退回",
        consumptionStatus: "已退回余料/待复核",
        returnedBy: operatorName,
        returnedByUserId: operatorId,
        returnedAt: now,
        note: cleanText(input.body?.note) || "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!returnedRollIds.has(roll.id)) return roll;
      const record = returnRecords.find((item) => item.rollId === roll.id);
      return {
        ...roll,
        inventoryStatus: "余料待复核",
        location: returnLocation,
        consumptionStatus: "已退回余料/待复核",
        leftoverReturnRecordId: record.leftoverReturnRecordId,
        leftoverWeightKg: record.leftoverWeightKg,
        leftoverQuantity: record.leftoverQuantity,
        returnedAt: now,
        returnedBy: operatorName,
        returnedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      returnedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "已退回余料/待复核",
            leftoverReturnRecordId: returnRecords.find((item) => item.rollId === record.rollId)?.leftoverReturnRecordId || "",
            returnedAt: now,
            returnedBy: operatorName,
            returnedByUserId: operatorId,
          }
        : record,
    );
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = machineSideCount ? "部分余料退回" : "余料待复核";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      leftoverReturnedBy: operatorName,
      leftoverReturnedByUserId: operatorId,
      leftoverReturnedAt: now,
      nextStep: "余料已退回待复核；需重新称重 / 贴标确认后，后续版本才能再次转可用或参与成本分摊。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialLeftoverReturnRecords: [
        ...normalizeRawMaterialLeftoverReturnRecords(before.rawMaterialLeftoverReturnRecords),
        ...returnRecords,
      ],
      rolls: nextRolls,
    };
  }

  if (action === "review_leftover") {
    const rollId = cleanText(input.body?.rollId);
    const pendingLeftoverRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核");
    const targetLeftoverRolls = rollId ? pendingLeftoverRolls.filter((roll) => roll.id === rollId) : pendingLeftoverRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetLeftoverRolls.length) {
      throw Object.assign(new Error("Only pending leftover raw-material rolls/pieces can be reviewed back to available inventory"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LEFTOVER_REVIEW_REQUIRES_PENDING_LEFTOVER",
      });
    }
    const requestedReviewedWeightKg = Number(input.body?.reviewedWeightKg ?? input.body?.leftoverWeightKg ?? input.body?.weightKg);
    const requestedReviewedQuantity = Number(input.body?.reviewedQuantity ?? input.body?.leftoverQuantity ?? input.body?.quantity);
    if (targetLeftoverRolls.length > 1 && (Number.isFinite(requestedReviewedWeightKg) || Number.isFinite(requestedReviewedQuantity))) {
      throw Object.assign(new Error("Measured raw-material leftover review requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LEFTOVER_REVIEW_MEASURE_REQUIRES_ROLL",
      });
    }

    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingReturnRecords = normalizeRawMaterialLeftoverReturnRecords(before.rawMaterialLeftoverReturnRecords);
    const reviewRecordId = `RMI-LREV-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const reviewedRollIds = new Set(targetLeftoverRolls.map((roll) => roll.id));
    const reviewLocation = cleanText(input.body?.reviewLocation ?? input.body?.returnLocation) || "原料库-余料可用区";
    const reviewRecords = targetLeftoverRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const returnRecord = existingReturnRecords.find((record) => record.rollId === roll.id && !record.leftoverReviewRecordId)
        ?? existingReturnRecords.find((record) => record.rollId === roll.id);
      const returnedWeightKg = Number(roll.leftoverWeightKg) || Number(returnRecord?.leftoverWeightKg) || 0;
      const returnedQuantity = Number(roll.leftoverQuantity) || Number(returnRecord?.leftoverQuantity) || (returnedWeightKg > 0 ? 0 : 1);
      const reviewedWeightKg = returnedWeightKg > 0
        ? (Number.isFinite(requestedReviewedWeightKg) && requestedReviewedWeightKg > 0 ? requestedReviewedWeightKg : returnedWeightKg)
        : 0;
      const reviewedQuantity = returnedWeightKg > 0
        ? 0
        : (Number.isFinite(requestedReviewedQuantity) && requestedReviewedQuantity > 0 ? requestedReviewedQuantity : returnedQuantity);
      if (returnedWeightKg > 0 && reviewedWeightKg - returnedWeightKg > 0.001) {
        throw Object.assign(new Error("Reviewed leftover weight cannot exceed returned leftover weight in V1"), {
          statusCode: 422,
          code: "RAW_MATERIAL_LEFTOVER_REVIEW_WEIGHT_EXCEEDS_RETURNED",
        });
      }
      if (returnedQuantity > 0 && reviewedQuantity > returnedQuantity) {
        throw Object.assign(new Error("Reviewed leftover quantity cannot exceed returned leftover quantity in V1"), {
          statusCode: 422,
          code: "RAW_MATERIAL_LEFTOVER_REVIEW_QUANTITY_EXCEEDS_RETURNED",
        });
      }
      return {
        leftoverReviewRecordId: `${reviewRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        leftoverReturnRecordId: roll.leftoverReturnRecordId || returnRecord?.leftoverReturnRecordId || "",
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || returnRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        returnedWeightKg,
        returnedQuantity,
        reviewedWeightKg,
        reviewedQuantity,
        unit: before.unit || (returnedWeightKg > 0 ? "kg" : "件"),
        reviewLocation,
        reviewStatus: "复核通过/可用",
        reviewedBy: operatorName,
        reviewedByUserId: operatorId,
        reviewedAt: now,
        note: cleanText(input.body?.note) || "V1 余料复核只把已退回余料转回可用原材料库存，不做成本分摊或毛利计算。",
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!reviewedRollIds.has(roll.id)) return roll;
      const record = reviewRecords.find((item) => item.rollId === roll.id);
      return {
        ...roll,
        weightKg: record.reviewedWeightKg > 0 ? record.reviewedWeightKg : roll.weightKg,
          labelStatus: "已贴标/可用库存",
        inventoryStatus: "可用",
        location: reviewLocation,
        signedNoteStatus: "余料复核已扫码/签单",
        consumptionStatus: "余料已复核/可用",
        leftoverReviewRecordId: record.leftoverReviewRecordId,
        leftoverReviewedWeightKg: record.reviewedWeightKg,
        leftoverReviewedQuantity: record.reviewedQuantity,
        leftoverReviewedAt: now,
        leftoverReviewedBy: operatorName,
        leftoverReviewedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      reviewedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "余料已复核/可用",
            leftoverReviewRecordId: reviewRecords.find((item) => item.rollId === record.rollId)?.leftoverReviewRecordId || "",
            leftoverReviewedAt: now,
            leftoverReviewedBy: operatorName,
            leftoverReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextReturnRecords = existingReturnRecords.map((record) =>
      reviewedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "余料已复核/可用",
            leftoverReviewRecordId: reviewRecords.find((item) => item.rollId === record.rollId)?.leftoverReviewRecordId || "",
            reviewStatus: "复核通过/可用",
            reviewedAt: now,
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
          }
        : record,
    );
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const leftoverPendingCount = nextRolls.filter((roll) => roll.inventoryStatus === "余料待复核").length;
    const nextStatus = leftoverPendingCount
      ? "部分余料复核"
      : machineSideCount
        ? "部分领料/机边"
        : availableCount === nextRolls.length
          ? "余料已复核/可用"
          : availableCount + consumedCount === nextRolls.length
            ? "部分消耗确认"
            : "部分余料复核";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      leftoverReviewedBy: operatorName,
      leftoverReviewedByUserId: operatorId,
      leftoverReviewedAt: now,
      nextStep: "余料复核通过，已回到可用原材料库存；成本分摊、损耗校准和毛利仍需独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialLeftoverReturnRecords: nextReturnRecords,
      rawMaterialLeftoverReviewRecords: [
        ...normalizeRawMaterialLeftoverReviewRecords(before.rawMaterialLeftoverReviewRecords),
        ...reviewRecords,
      ],
      rolls: nextRolls,
    };
  }

  if (action === "generate_cost_draft") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const result = rawMaterialCostMarginBuilder.buildCostAllocationDrafts({
      workspace,
      inbound: before,
      issueRecords: existingIssueRecords,
      consumptionRecords: existingConsumptionRecords,
      existingCostDrafts,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    if (!result.drafts.length) {
      throw Object.assign(
        new Error(result.blockedReason || "No eligible raw-material consumption records can generate cost allocation draft"),
        {
          statusCode: 422,
          code: result.blockedCode || "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION",
        },
      );
    }
    const nextIssueRecords = existingIssueRecords.map((record) => {
      const draft = result.drafts.find((item) => item.issueRecordId === record.issueRecordId);
      return draft
        ? {
            ...record,
            costAllocationStatus: "成本草稿待复核",
            costAllocationDraftId: draft.costAllocationDraftId,
            allocatedCostAmount: draft.allocatedCostAmount,
            allocatedWeightKg: draft.allocatedWeightKg,
            allocatedQuantity: draft.allocatedQuantity,
          }
        : record;
    });
    const nextConsumptionRecords = existingConsumptionRecords.map((record) => {
      const draft = result.drafts.find((item) => item.consumptionRecordId === record.consumptionRecordId);
      return draft
        ? {
            ...record,
            costAllocationStatus: "成本草稿待复核",
            costAllocationDraftId: draft.costAllocationDraftId,
            allocatedCostAmount: draft.allocatedCostAmount,
            allocatedWeightKg: draft.allocatedWeightKg,
            allocatedQuantity: draft.allocatedQuantity,
          }
        : record;
    });
    after = {
      ...before,
      costAllocationStatus: "成本草稿待复核",
      costAllocationDraftedBy: operatorName,
      costAllocationDraftedByUserId: operatorId,
      costAllocationDraftedAt: now,
      costAllocationDraftCount: existingCostDrafts.length + result.drafts.length,
      costAllocationDraftAmount: roundMoney(
        existingCostDrafts.reduce((sum, item) => sum + Number(item.allocatedCostAmount || 0), 0) +
          result.drafts.reduce((sum, item) => sum + Number(item.allocatedCostAmount || 0), 0),
      ),
      costAllocationReviewStatus: "待成本复核",
      nextStep: "已生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: [...existingCostDrafts, ...result.drafts],
      rawMaterialCostAllocationWarnings: result.warnings,
    };
  }

  if (action === "confirm_cost_draft") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    if (!existingCostDrafts.length) {
      throw Object.assign(new Error("Cost allocation draft is required before confirmation"), {
        statusCode: 422,
        code: "RAW_MATERIAL_COST_CONFIRM_REQUIRES_DRAFT",
      });
    }
    const confirmableDrafts = existingCostDrafts.filter((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
    if (!confirmableDrafts.length) {
      throw Object.assign(new Error("Raw-material cost allocation drafts are already confirmed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_COST_CONFIRM_ALREADY_CONFIRMED",
      });
    }
    const confirmation = rawMaterialCostMarginBuilder.buildCostAllocationConfirmation({
      inbound: before,
      drafts: confirmableDrafts,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    const confirmedDraftIds = new Set(confirmableDrafts.map((record) => record.costAllocationDraftId));
    const confirmedIssueRecordIds = new Set(confirmableDrafts.map((record) => record.issueRecordId).filter(Boolean));
    const confirmedConsumptionRecordIds = new Set(confirmableDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
    const nextCostDrafts = existingCostDrafts.map((record) =>
      confirmedDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "已复核/待损耗校准",
            costEffect: "confirmed_material_cost_snapshot",
            marginEffect: "none",
            lossCalibrationStatus: "待损耗校准",
            confirmedCostAmount: record.allocatedCostAmount,
            confirmedBy: operatorName,
            confirmedByUserId: operatorId,
            confirmedAt: now,
            costConfirmationId: confirmation.costConfirmationId,
            reviewNote: cleanText(input.body?.note) || "V1 成本草稿复核确认；损耗校准和毛利报表仍需独立流程。",
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      confirmedIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "成本已复核待损耗校准",
            costConfirmationId: confirmation.costConfirmationId,
            confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
            costConfirmedAt: now,
            costConfirmedBy: operatorName,
            costConfirmedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      confirmedConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "成本已复核待损耗校准",
            costConfirmationId: confirmation.costConfirmationId,
            confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
            costConfirmedAt: now,
            costConfirmedBy: operatorName,
            costConfirmedByUserId: operatorId,
          }
        : record,
    );
    const allConfirmedCostDrafts = nextCostDrafts.filter((record) => record.allocationStatus === "已复核/待损耗校准");
    after = {
      ...before,
      costAllocationStatus: "成本已复核待损耗校准",
      costAllocationReviewStatus: "已复核/待损耗校准",
      costAllocationConfirmedBy: operatorName,
      costAllocationConfirmedByUserId: operatorId,
      costAllocationConfirmedAt: now,
      costAllocationConfirmedCount: allConfirmedCostDrafts.length,
      costAllocationConfirmedAmount: roundMoney(allConfirmedCostDrafts.reduce((sum, item) => sum + Number(item.confirmedCostAmount || item.allocatedCostAmount || 0), 0)),
      costAllocationConfirmationId: confirmation.costConfirmationId,
      nextStep: "成本草稿已复核为原材料成本快照；仍需损耗校准和订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: [
        ...normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations),
        confirmation,
      ],
    };
  }

  if (action === "calibrate_loss") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    if (!existingConfirmations.length) {
      throw Object.assign(new Error("Cost confirmation is required before loss calibration"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LOSS_CALIBRATION_REQUIRES_COST_CONFIRMATION",
      });
    }
    const calibratedConfirmationIds = new Set(
      existingCalibrations
        .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
        .filter(Boolean),
    );
    const calibratableConfirmations = existingConfirmations.filter(
      (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
    );
    if (!calibratableConfirmations.length) {
      throw Object.assign(new Error("Raw-material cost confirmations are already loss-calibrated"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LOSS_CALIBRATION_ALREADY_DONE",
      });
    }
    const calibration = rawMaterialCostMarginBuilder.buildCostLossCalibration({
      inbound: before,
      confirmations: calibratableConfirmations,
      drafts: existingCostDrafts,
      body: input.body,
      operatorId,
      operatorName,
      now,
    });
    const calibratedConfirmationIdSet = new Set(calibratableConfirmations.map((record) => record.costConfirmationId));
    const calibratedDraftIds = new Set(calibration.costAllocationDraftIds);
    const calibratedIssueRecordIds = new Set(calibration.issueRecordIds);
    const calibratedConsumptionRecordIds = new Set(calibration.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      calibratedDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "已校准/待毛利确认",
            costEffect: "loss_calibrated_material_cost_snapshot",
            marginEffect: "pending_margin_snapshot",
            lossCalibrationStatus: "已校准/待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            calibratedCostAmount: record.confirmedCostAmount || record.allocatedCostAmount,
            calibratedBy: operatorName,
            calibratedByUserId: operatorId,
            calibratedAt: now,
          }
        : record,
    );
    const nextConfirmations = existingConfirmations.map((record) =>
      calibratedConfirmationIdSet.has(record.costConfirmationId)
        ? {
            ...record,
            reviewStatus: "已校准/待毛利确认",
            costEffect: "loss_calibrated_material_cost_snapshot",
            marginEffect: "pending_margin_snapshot",
            lossCalibrationStatus: "已校准/待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            calibratedBy: operatorName,
            calibratedByUserId: operatorId,
            calibratedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      calibratedIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "损耗已校准待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            lossCalibratedAt: now,
            lossCalibratedBy: operatorName,
            lossCalibratedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      calibratedConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "损耗已校准待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            lossCalibratedAt: now,
            lossCalibratedBy: operatorName,
            lossCalibratedByUserId: operatorId,
          }
        : record,
    );
    const nextCalibrations = [...existingCalibrations, calibration];
    after = {
      ...before,
      costAllocationStatus: "损耗已校准待毛利确认",
      costAllocationReviewStatus: "已校准/待毛利确认",
      lossCalibrationStatus: "已校准/待毛利确认",
      lossCalibratedBy: operatorName,
      lossCalibratedByUserId: operatorId,
      lossCalibratedAt: now,
      lossCalibrationCount: nextCalibrations.length,
      lossCalibrationId: calibration.lossCalibrationId,
      lossCalibrationRatePercent: calibration.lossRatePercent,
      lossCalibrationActualOutputQuantity: calibration.actualQualifiedOutputQuantity,
      lossCalibrationExpectedOutputQuantity: calibration.expectedOutputQuantity,
      lossCalibrationAmount: calibration.confirmedCostAmount,
      nextStep: "损耗已校准为原材料成本校准快照；仍需订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
    };
  }

  if (action === "generate_margin_snapshot") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    const existingMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(before.rawMaterialOrderMarginSnapshots);
    if (!existingCalibrations.length) {
      throw Object.assign(new Error("Loss calibration is required before generating margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_REQUIRES_LOSS_CALIBRATION",
      });
    }
    const snapshottedCalibrationIds = new Set(
      existingMarginSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
    );
    const eligibleCalibrations = existingCalibrations.filter(
      (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
    );
    if (!eligibleCalibrations.length) {
      throw Object.assign(new Error("Raw-material margin snapshot is already generated"), {
        statusCode: 409,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_ALREADY_GENERATED",
      });
    }
    const snapshot = rawMaterialCostMarginBuilder.buildOrderMarginSnapshot({
      workspace,
      inbound: before,
      calibrations: eligibleCalibrations,
      drafts: existingCostDrafts,
      confirmations: existingConfirmations,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    if (!snapshot.lineItems.length) {
      throw Object.assign(new Error("Order line is required before generating margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_REQUIRES_ORDER_LINE",
      });
    }
    const snapshotCalibrationIds = new Set(snapshot.lossCalibrationIds);
    const snapshotDraftIds = new Set(snapshot.costAllocationDraftIds);
    const snapshotConfirmationIds = new Set(snapshot.costConfirmationIds);
    const snapshotIssueRecordIds = new Set(snapshot.issueRecordIds);
    const snapshotConsumptionRecordIds = new Set(snapshot.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      snapshotDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "毛利快照待复核",
            marginEffect: "margin_snapshot_pending_review",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotStatus: "已生成/待财务复核",
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
            marginSnapshotGeneratedAt: now,
          }
        : record,
    );
    const nextConfirmations = existingConfirmations.map((record) =>
      snapshotConfirmationIds.has(record.costConfirmationId)
        ? {
            ...record,
            reviewStatus: "毛利快照待复核",
            marginEffect: "margin_snapshot_pending_review",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotStatus: "已生成/待财务复核",
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
            marginSnapshotGeneratedAt: now,
          }
        : record,
    );
    const nextCalibrations = existingCalibrations.map((record) =>
      snapshotCalibrationIds.has(record.lossCalibrationId)
        ? {
            ...record,
            calibrationStatus: "已生成毛利快照/待复核",
            marginEffect: "margin_snapshot_pending_review",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotStatus: "已生成/待财务复核",
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
            marginSnapshotGeneratedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      snapshotIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利快照待复核",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotGeneratedAt: now,
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      snapshotConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利快照待复核",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotGeneratedAt: now,
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
          }
        : record,
    );
    const nextMarginSnapshots = [...existingMarginSnapshots, snapshot];
    after = {
      ...before,
      costAllocationStatus: "毛利快照待复核",
      costAllocationReviewStatus: "毛利快照待复核",
      marginSnapshotStatus: "已生成/待财务复核",
      marginSnapshotCount: nextMarginSnapshots.length,
      marginSnapshotId: snapshot.marginSnapshotId,
      marginSnapshotTotalSalesAmount: snapshot.totalSalesAmount,
      marginSnapshotMaterialCostAmount: snapshot.totalMaterialCostAmount,
      marginSnapshotGrossProfitAmount: snapshot.grossProfitAmount,
      marginSnapshotGrossMarginRatePercent: snapshot.grossMarginRatePercent,
      marginSnapshotGeneratedBy: operatorName,
      marginSnapshotGeneratedByUserId: operatorId,
      marginSnapshotGeneratedAt: now,
      nextStep: "已生成订单毛利快照，等待财务复核；不自动写客户对账或最终财务结算。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
      rawMaterialOrderMarginSnapshots: nextMarginSnapshots,
      rawMaterialCostAllocationWarnings: [
        ...normalizeRawMaterialCostAllocationWarnings(before.rawMaterialCostAllocationWarnings),
        ...snapshot.warnings,
      ],
    };
  }

  if (action === "review_margin_snapshot") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    const existingMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(before.rawMaterialOrderMarginSnapshots);
    const existingMarginReports = normalizeRawMaterialOrderMarginReports(before.rawMaterialOrderMarginReports);
    if (!existingMarginSnapshots.length) {
      throw Object.assign(new Error("Margin snapshot is required before finance review"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_REVIEW_REQUIRES_SNAPSHOT",
      });
    }
    const reportedSnapshotIds = new Set(
      existingMarginReports.flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean),
    );
    const reviewableSnapshots = existingMarginSnapshots.filter(
      (record) =>
        !reportedSnapshotIds.has(record.marginSnapshotId) &&
        record.marginEffect !== "reviewed_margin_report_snapshot" &&
        record.reviewStatus !== "已财务复核/报表可用",
    );
    if (!reviewableSnapshots.length) {
      throw Object.assign(new Error("Raw-material margin snapshot is already reviewed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_MARGIN_REVIEW_ALREADY_DONE",
      });
    }
    const missingRevenue = reviewableSnapshots.some(
      (record) =>
        (record.lineItems ?? []).some((line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入") ||
        (record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额")),
    );
    if (missingRevenue) {
      throw Object.assign(new Error("Order revenue is required before reviewing margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_REVIEW_REQUIRES_ORDER_REVENUE",
      });
    }
    const report = rawMaterialCostMarginBuilder.buildOrderMarginReport({
      inbound: before,
      snapshots: reviewableSnapshots,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    const reportSnapshotIds = new Set(report.marginSnapshotIds);
    const reportDraftIds = new Set(report.costAllocationDraftIds);
    const reportConfirmationIds = new Set(report.costConfirmationIds);
    const reportCalibrationIds = new Set(report.lossCalibrationIds);
    const reportIssueRecordIds = new Set(report.issueRecordIds);
    const reportConsumptionRecordIds = new Set(report.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      reportDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextConfirmations = existingConfirmations.map((record) =>
      reportConfirmationIds.has(record.costConfirmationId)
        ? {
            ...record,
            reviewStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextCalibrations = existingCalibrations.map((record) =>
      reportCalibrationIds.has(record.lossCalibrationId)
        ? {
            ...record,
            calibrationStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      reportIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利已复核/报表可用",
            marginReportId: report.marginReportId,
            marginReviewedAt: now,
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      reportConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利已复核/报表可用",
            marginReportId: report.marginReportId,
            marginReviewedAt: now,
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextMarginSnapshots = existingMarginSnapshots.map((record) =>
      reportSnapshotIds.has(record.marginSnapshotId)
        ? {
            ...record,
            reviewStatus: "已财务复核/报表可用",
            reportStatus: "已生成内部毛利报表",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
            reviewedAt: now,
            lineItems: (record.lineItems ?? []).map((line) => ({
              ...line,
              marginStatus: "已财务复核/报表可用",
            })),
          }
        : record,
    );
    const nextMarginReports = [...existingMarginReports, report];
    after = {
      ...before,
      costAllocationStatus: "毛利已复核/报表可用",
      costAllocationReviewStatus: "毛利已复核/报表可用",
      marginSnapshotStatus: "已财务复核/报表可用",
      marginReportStatus: "已生成内部毛利报表",
      marginReportCount: nextMarginReports.length,
      marginReportId: report.marginReportId,
      marginReportTotalSalesAmount: report.totalSalesAmount,
      marginReportMaterialCostAmount: report.totalMaterialCostAmount,
      marginReportGrossProfitAmount: report.grossProfitAmount,
      marginReportGrossMarginRatePercent: report.grossMarginRatePercent,
      marginReviewedBy: operatorName,
      marginReviewedByUserId: operatorId,
      marginReviewedAt: now,
      nextStep: "毛利快照已财务复核，已形成内部毛利报表；客户对账和最终收款结算仍走独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
      rawMaterialOrderMarginSnapshots: nextMarginSnapshots,
      rawMaterialOrderMarginReports: nextMarginReports,
    };
  }

  if (action === "exception") {
    const reason = cleanText(input.body?.reason) || "现场标记异常，待补充。";
    after = {
      ...before,
      status: "入库异常/待确认",
      exceptionBy: operatorName,
      exceptionByUserId: operatorId,
      exceptionAt: now,
      nextStep: "补照片 / 补重量 / 供应商确认后重新复核。",
      note: `${before.note || ""} 入库异常：${reason}`.trim(),
    };
  }

  if (after === before) {
    throw Object.assign(new Error(`Unsupported raw material inbound action: ${input.action}`), { statusCode: 400 });
  }

  after = {
    ...after,
    revision: expectedRevision + 1,
    updatedAt: now,
  };

  const operationLog = {
    id: `RMI-LOG-${Date.now().toString(36).toUpperCase()}`,
    targetType: "raw_material_inbound",
    targetId: inboundId,
    action,
    before: summarizeRawMaterialInbound(before),
    after: summarizeRawMaterialInbound(after),
    reason: cleanText(input.body?.reason) || getRawMaterialActionReason(action),
    operatorId,
    operatorName,
    pageKey: "rawMaterials",
    occurredAt: now,
    createdAt: now,
  };

  const nextInbounds = [...inbounds];
  nextInbounds[index] = after;
  return {
    inbounds: nextInbounds,
    inbound: after,
    expectedRevision,
    operationLog,
  };
}

function findRawMaterialInbound(workspace, inboundId) {
  const safeInboundId = cleanText(inboundId);
  return normalizeRawMaterialInbounds(workspace?.rawMaterialInbounds).find((item) => item.id === safeInboundId) ?? null;
}

function normalizeRawMaterialLabelMatchResult(value) {
  const normalized = cleanText(value).toLowerCase();
  if (["matched", "match", "一致", "匹配"].includes(normalized)) return "matched";
  if (["mismatched", "mismatch", "不一致", "不匹配"].includes(normalized)) return "mismatched";
  return "";
}

function buildRawMaterialLabelVerification({ inbound, roll, body, matchResult, operatorId, operatorName, now }) {
  const expectedWeightKg = finiteRawMaterialNumber(roll.weightKg);
  const checkedWeightKg = finiteRawMaterialNumber(body?.checkedWeightKg ?? body?.actualWeightKg ?? expectedWeightKg);
  const expectedColor = cleanText(roll.factoryColor ?? inbound.factoryColor ?? inbound.supplierColor);
  const expectedSpec = cleanText(roll.spec ?? inbound.spec);
  const location = cleanText(body?.location) || (matchResult === "matched" ? "原料库-可用区" : "原料隔离区");
  return {
    result: matchResult === "matched" ? "匹配" : "不匹配",
    resultCode: matchResult,
    labelVersion: currentRawMaterialLabelVersion(roll),
    expected: {
      weightKg: expectedWeightKg,
      color: expectedColor,
      spec: expectedSpec,
    },
    checked: {
      weightKg: checkedWeightKg,
      color: cleanText(body?.checkedColor ?? body?.actualColor) || expectedColor,
      spec: cleanText(body?.checkedSpec ?? body?.actualSpec) || expectedSpec,
    },
    location,
    note: cleanText(body?.verificationNote ?? body?.note),
    verifiedBy: operatorName,
    verifiedByUserId: operatorId,
    verifiedAt: now,
  };
}

function buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount }) {
  if (mismatchCount > 0) return `部分入库，${mismatchCount}卷异常`;
  if (nextRolls.length > 0 && availableCount === nextRolls.length) return "已贴标/可用库存";
  if (availableCount > 0) return "部分贴标";
  return "已打印待贴标";
}

function nextRawMaterialLabelVersion(roll = {}) {
  return Math.max(0, Math.trunc(Number(roll.labelVersion) || 0)) + 1;
}

function currentRawMaterialLabelVersion(roll = {}) { return Math.max(1, Math.trunc(Number(roll.labelVersion) || 1)); }

function finiteRawMaterialNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

function normalizeAction(action) {
  const value = cleanText(action);
  const actionMap = new Map([
    ["reparse_ocr", "reparse_ocr"],
    ["复核送货单", "review"],
    ["review", "review"],
    ["打印卷标", "print_labels"],
    ["print_labels", "print_labels"],
    ["print-labels", "print_labels"],
    ["确认贴标入库", "attach_confirm"],
    ["attach_confirm", "attach_confirm"],
    ["attach-confirm", "attach_confirm"],
    ["作废卷标", "void_label"],
    ["void_label", "void_label"],
    ["void-label", "void_label"],
    ["重打卷标", "reprint_label"],
    ["reprint_label", "reprint_label"],
    ["reprint-label", "reprint_label"],
    ["机边领料", "issue_to_machine"],
    ["扫码出库", "issue_to_machine"],
    ["issue_to_machine", "issue_to_machine"],
    ["issue-to-machine", "issue_to_machine"],
    ["确认消耗", "confirm_consumption"],
    ["confirm_consumption", "confirm_consumption"],
    ["confirm-consumption", "confirm_consumption"],
    ["余料退回", "return_leftover"],
    ["return_leftover", "return_leftover"],
    ["return-leftover", "return_leftover"],
    ["复核余料可用", "review_leftover"],
    ["review_leftover", "review_leftover"],
    ["review-leftover", "review_leftover"],
    ["生成成本草稿", "generate_cost_draft"],
    ["generate_cost_draft", "generate_cost_draft"],
    ["generate-cost-draft", "generate_cost_draft"],
    ["确认成本草稿", "confirm_cost_draft"],
    ["confirm_cost_draft", "confirm_cost_draft"],
    ["confirm-cost-draft", "confirm_cost_draft"],
    ["校准损耗", "calibrate_loss"],
    ["损耗校准", "calibrate_loss"],
    ["calibrate_loss", "calibrate_loss"],
    ["calibrate-loss", "calibrate_loss"],
    ["生成毛利快照", "generate_margin_snapshot"],
    ["毛利快照", "generate_margin_snapshot"],
    ["generate_margin_snapshot", "generate_margin_snapshot"],
    ["generate-margin-snapshot", "generate_margin_snapshot"],
    ["复核毛利快照", "review_margin_snapshot"],
    ["确认毛利快照", "review_margin_snapshot"],
    ["毛利报表", "review_margin_snapshot"],
    ["review_margin_snapshot", "review_margin_snapshot"],
    ["review-margin-snapshot", "review_margin_snapshot"],
    ["标记异常", "exception"],
    ["exception", "exception"],
  ]);
  return actionMap.get(value) ?? value;
}

function getRawMaterialActionReason(action) {
  if (action === "reparse_ocr") return "使用已保存的 OCR 表格升级解析结果，未再次请求云端 OCR";
  if (action === "review") return "人工复核原材料送货单、OCR 字段和实物原标签";
  if (action === "print_labels") return "打印一卷一标，等待逐卷贴标和人工核对";
  if (action === "attach_confirm") return "逐卷人工核对标签、实物重量、颜色、规格和库位";
  if (action === "void_label") return "单独作废异常卷/件的旧标签，不影响其他已确认卷/件";
  if (action === "reprint_label") return "单独重打异常卷/件标签，等待重新贴标和人工核对";
  if (action === "issue_to_machine") return "按卷码扫码出库并记录机台；生产任务可在后续阶段关联";
  if (action === "confirm_consumption") return "确认整卷/整件或部分原材料已被生产消耗，不生成成品数量或成本分摊";
  if (action === "return_leftover") return "机边余料退回待复核，不自动转可用库存";
  if (action === "review_leftover") return "余料复核通过后转回可用原材料库存，不做成本分摊";
  if (action === "generate_cost_draft") return "按已确认消耗和已匹配生产任务生成原材料成本分摊草稿";
  if (action === "confirm_cost_draft") return "复核确认原材料成本草稿为成本快照，损耗和毛利仍需独立流程";
  if (action === "calibrate_loss") return "校准已确认原材料成本快照的损耗，毛利报表仍需独立确认";
  if (action === "generate_margin_snapshot") return "生成待财务复核的订单毛利快照，不写最终结算";
  if (action === "review_margin_snapshot") return "财务复核订单毛利快照并生成内部毛利报表，不写客户对账";
  if (action === "exception") return "原材料入库异常，等待补充证据或供应商确认";
  return "原材料入库动作";
}

function summarizeRawMaterialInbound(item = {}) {
  return {
    inboundId: item.id,
    deliveryNoteNo: item.deliveryNoteNo,
    status: item.status,
    signedNoteStatus: item.signedNoteStatus,
    availableRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用").length,
    machineSideRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用").length,
    consumedRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "已消耗").length,
    leftoverPendingRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核").length,
    leftoverReviewedRollCount: (item.rolls ?? []).filter((roll) => roll.leftoverReviewRecordId).length,
    splitRollCount: (item.rawMaterialSplitRecords ?? []).length,
    costAllocationDraftCount: (item.rawMaterialCostAllocationDrafts ?? []).length,
    costAllocationConfirmedCount: (item.rawMaterialCostAllocationConfirmations ?? []).length,
    lossCalibrationCount: (item.rawMaterialCostLossCalibrations ?? []).length,
    marginSnapshotCount: (item.rawMaterialOrderMarginSnapshots ?? []).length,
    marginReportCount: (item.rawMaterialOrderMarginReports ?? []).length,
    rollCount: (item.rolls ?? []).length,
    ocrParserVersion: Number(item.ocrParserVersion) || 0,
    ocrLineCount: (item.ocrLines ?? []).length,
    ocrReviewedLineCount: (item.ocrLines ?? []).filter((line) => line.reviewedAt).length,
    ocrModifiedLineCount: (item.ocrLines ?? []).filter((line) => line.reviewStatus === "人工修改").length,
  };
}

function buildRawMaterialSplitRollId(rolls = [], sourceRollId = "") {
  const safeSourceRollId = cleanText(sourceRollId);
  const existingIds = new Set((Array.isArray(rolls) ? rolls : []).map((roll) => cleanText(roll.id)));
  for (let index = 1; index < 100; index += 1) {
    const candidate = `${safeSourceRollId}-S${String(index).padStart(2, "0")}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${safeSourceRollId}-S${Date.now().toString(36).toUpperCase()}`;
}

function roundWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}
function cleanText(value) {
  return String(value ?? "").trim();
}
