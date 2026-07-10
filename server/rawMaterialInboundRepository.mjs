import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const rawMaterialInboundStoreKey = "metadata/raw-material-inbounds.json";

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
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState({ seedInbounds = [] } = {}) {
      return loadPersistentRawMaterialInboundState(storageRoot, seedInbounds);
    },

    listRawMaterialInbounds({ workspace, query } = {}) {
      return buildRawMaterialInboundListResponse(workspace?.rawMaterialInbounds, query);
    },

    getRawMaterialInbound({ workspace, inboundId }) {
      return findRawMaterialInbound(workspace, inboundId);
    },

    recordRawMaterialInboundAction(input = {}) {
      const { workspace, inboundId, action, body = {}, operatorName, operatorId } = input;
      const result = applyRawMaterialInboundAction({
        workspace,
        inbounds: workspace?.rawMaterialInbounds,
        inboundId,
        action,
        body,
        operatorId,
        operatorName,
      });
      if (!result.inbound) {
        throw Object.assign(new Error(`Raw material inbound not found: ${inboundId}`), { statusCode: 404 });
      }
      workspace.rawMaterialInbounds = result.inbounds;
      persistRawMaterialInboundState(storageRoot, workspace.rawMaterialInbounds);
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

    async recordRawMaterialInboundAction(input = {}) {
      const result = applyRawMaterialInboundAction({
        workspace: input.workspace,
        inbounds: input.workspace?.rawMaterialInbounds,
        inboundId: input.inboundId,
        action: input.action,
        body: input.body,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
      });
      if (!result.inbound) {
        throw Object.assign(new Error(`Raw material inbound not found: ${input.inboundId}`), { statusCode: 404 });
      }
      const builtQuery = buildUpsertRawMaterialInboundPayloadTransactionQuery(result.inbound, result.operationLog);
      const saved = normalizeRawMaterialInboundActionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `raw-material.${normalizeAction(input.action)}.${cleanText(input.inboundId)}`,
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

export function buildListRawMaterialInboundPayloadsSql({ query } = {}) {
  return buildListRawMaterialInboundPayloadsQuery({ query }).text;
}

export function buildListRawMaterialInboundPayloadsQuery({ query } = {}) {
  const filters = normalizeQuery(query);
  const parameters = createPostgresParameterBinder();
  const where = [];
  if (filters.status && filters.status !== "全部") {
    where.push(`status = ${parameters.text(filters.status)}`);
  }
  if (filters.keyword) {
    where.push(`payload_json::text ILIKE ${parameters.text(`%${filters.keyword}%`)}`);
  }
  return {
    text: `
SELECT COALESCE(
  json_agg(payload_json || jsonb_build_object('revision', revision) ORDER BY updated_at DESC, id DESC),
  '[]'::json
) AS result
FROM raw_material_inbounds
${where.length ? `WHERE ${where.join(" AND ")}` : ""};
`.trim(),
    values: parameters.values,
  };
}

export function buildFindRawMaterialInboundPayloadSql(inboundId) {
  return buildFindRawMaterialInboundPayloadQuery(inboundId).text;
}

export function buildFindRawMaterialInboundPayloadQuery(inboundId) {
  const safeInboundId = cleanText(inboundId);
  if (!safeInboundId) throw new Error("raw material inbound id is required");
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT payload_json || jsonb_build_object('revision', revision) AS result
FROM raw_material_inbounds
WHERE id = ${parameters.text(safeInboundId)}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildUpsertRawMaterialInboundPayloadTransactionSql(inbound, operationLog = null) {
  return buildUpsertRawMaterialInboundPayloadTransactionQuery(inbound, operationLog).text;
}

export function buildUpsertRawMaterialInboundPayloadTransactionQuery(inbound, operationLog = null) {
  const safeInbound = normalizeRawMaterialInbound(inbound);
  if (!safeInbound?.id) throw new Error("raw material inbound id is required");
  const safeOperationLog = normalizeOperationLog(operationLog);
  const expectedRevision = Math.max(1, Number(safeInbound.revision) || 1);
  const nextInbound = { ...safeInbound, revision: expectedRevision + 1 };
  const parameters = createPostgresParameterBinder();
  const operationLogSql = safeOperationLog ? buildInsertOperationLogSql(safeOperationLog, parameters) : "";
  return {
    text: `
BEGIN;
WITH locked_inbound AS MATERIALIZED (
  SELECT id, revision
  FROM raw_material_inbounds
  WHERE id = ${parameters.text(safeInbound.id)}
  FOR UPDATE
),
updated_inbound AS (
  UPDATE raw_material_inbounds
  SET
    delivery_note_no = ${parameters.text(safeInbound.deliveryNoteNo)},
    supplier_name = ${parameters.text(safeInbound.supplierName)},
    status = ${parameters.text(safeInbound.status)},
    payload_json = ${parameters.json(nextInbound)},
    revision = raw_material_inbounds.revision + 1,
    updated_at = now()
  FROM locked_inbound AS locked
  WHERE raw_material_inbounds.id = locked.id
    AND locked.revision = ${parameters.integer(expectedRevision)}
  RETURNING payload_json || jsonb_build_object('revision', revision) AS result
),
inbound_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_inbound) = 1,
    'ERP_RAW_MATERIAL_INBOUND_CONCURRENCY_CONFLICT'
  ) AS ok
)
${safeOperationLog ? `, inserted_operation_log AS (${operationLogSql})` : ""}
SELECT json_build_object(
  'inbound', (SELECT result FROM updated_inbound),
  'operationLogId', ${safeOperationLog ? "(SELECT id FROM inserted_operation_log)" : "NULL"},
  'writeGuard', (SELECT ok FROM inbound_write_guard)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
) VALUES (
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO NOTHING
RETURNING id`;
}

export function buildRawMaterialInboundListResponse(inbounds = [], query = new URLSearchParams()) {
  const filters = normalizeQuery(query);
  let items = normalizeRawMaterialInbounds(inbounds);
  if (filters.status && filters.status !== "全部") {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    items = items.filter((item) =>
      [
        item.id,
        item.supplierName,
        item.deliveryNoteNo,
        item.materialType,
        item.productName,
        item.supplierColor,
        item.factoryColor,
        item.spec,
        item.status,
        item.location,
        item.statementStatus,
        ...(item.rolls ?? []).flatMap((roll) => [roll.id, roll.supplierRollNo, roll.labelStatus, roll.inventoryStatus]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }
  items = items.sort((left, right) => compareDateDesc(left.receivedAt, right.receivedAt) || String(right.id).localeCompare(String(left.id)));
  const total = items.length;
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(filters.pageSize) || 50));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    metrics: buildRawMaterialInboundMetrics(inbounds),
  };
}

export function applyRawMaterialInboundAction(input = {}) {
  const workspace = input.workspace ?? {};
  const inbounds = normalizeRawMaterialInbounds(input.inbounds);
  const inboundId = cleanText(input.inboundId);
  const index = inbounds.findIndex((item) => item.id === inboundId);
  if (index < 0) return { inbounds, inbound: null, operationLog: null };

  const action = normalizeAction(input.action);
  const before = inbounds[index];
  const now = cleanText(input.body?.now ?? input.body?.actedAt) || new Date().toISOString();
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? input.operatorId ?? "U-OFFICE-A");
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId ?? "");
  let after = before;

  if (action === "review") {
    after = {
      ...before,
      status: "已复核待打印标签",
      ocrStatus: "人工复核已通过",
      reviewedBy: operatorName,
      reviewedByUserId: operatorId,
      reviewedAt: now,
      nextStep: "打印系统卷标；标签打印后仍需贴标扫码才算可用原料。",
      rolls: (before.rolls ?? []).map((roll) => ({
        ...roll,
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "待打印标签",
      })),
    };
  }

  if (action === "print_labels") {
    after = {
      ...before,
      status: "已打印待贴标",
      labelPrintedBy: operatorName,
      labelPrintedByUserId: operatorId,
      labelPrintedAt: now,
      nextStep: "把标签贴到对应卷料，手机扫码并上传签单信息后再入库可用。",
      rolls: (before.rolls ?? []).map((roll) => ({
        ...roll,
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
      })),
    };
  }

  if (action === "attach_confirm") {
    const rollId = cleanText(input.body?.rollId);
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (rollId && roll.id !== rollId) return roll;
      if (roll.inventoryStatus === "可用") return roll;
      return {
        ...roll,
        labelStatus: "已贴标入库/可用",
        inventoryStatus: "可用",
        signedNoteStatus: "已扫码/签单",
        scannedAt: now,
        scannedBy: operatorName,
        scannedByUserId: operatorId,
        location: cleanText(roll.location).includes("待") ? "原料库-可用区" : roll.location,
      };
    });
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const nextStatus = nextRolls.length > 0 && availableCount === nextRolls.length ? "已贴标入库/可用" : "部分贴标";
    after = {
      ...before,
      status: nextStatus,
      signedNoteStatus: nextStatus === "已贴标入库/可用" ? "已扫码/签单" : "部分签单已上传",
      confirmedBy: operatorName,
      confirmedByUserId: operatorId,
      confirmedAt: now,
      nextStep: nextStatus === "已贴标入库/可用" ? "可领料；后续进入供应商月结对账。" : "继续贴标扫码剩余卷/件。",
      rolls: nextRolls,
    };
  }

  if (action === "issue_to_machine") {
    const rollId = cleanText(input.body?.rollId);
    const machineId = cleanText(input.body?.machineId) || "机边待分配";
    const productionTaskId = cleanText(input.body?.productionTaskId);
    const productionTaskMatch = resolveRawMaterialProductionTaskMatch({
      workspace,
      inbound: before,
      machineId,
      productionTaskId,
    });
    const issuePurpose = cleanText(input.body?.issuePurpose) || "生产领料";
    const requestedWeightKg = Number(input.body?.issuedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.issuedQuantity ?? input.body?.quantity);
    const availableRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用");
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
      nextStep: "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。",
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
        labelStatus: "已贴标入库/可用",
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
    const result = buildRawMaterialCostAllocationDrafts({
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
    const confirmation = buildRawMaterialCostAllocationConfirmation({
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
    const calibration = buildRawMaterialCostLossCalibration({
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
    const snapshot = buildRawMaterialOrderMarginSnapshot({
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
    const report = buildRawMaterialOrderMarginReport({
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
    operationLog,
  };
}

function resolveRawMaterialProductionTaskMatch(input = {}) {
  const workspace = input.workspace ?? {};
  const inbound = input.inbound ?? {};
  const productionTaskId = cleanText(input.productionTaskId);
  const issueMachineId = cleanText(input.machineId);
  if (!productionTaskId) {
    return {
      status: "未关联生产任务",
      reason: "V1 允许先领到机边，但后续成本分摊前必须补关联生产任务。",
      orderLineId: "",
      machineId: "",
      goodsSpec: "",
    };
  }

  const productionTask = findRawMaterialProductionTask(workspace, productionTaskId);
  if (!productionTask) {
    throw Object.assign(new Error(`Raw-material issue production task not found: ${productionTaskId}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_PRODUCTION_TASK_NOT_FOUND",
    });
  }

  const taskMachineId = cleanText(productionTask.machineId ?? productionTask.machine_id);
  if (
    issueMachineId &&
    taskMachineId &&
    normalizeRawMaterialMachineId(issueMachineId) !== normalizeRawMaterialMachineId(taskMachineId)
  ) {
    throw Object.assign(
      new Error(`Raw-material issue machine ${issueMachineId} does not match production task machine ${taskMachineId}`),
      {
        statusCode: 422,
        code: "RAW_MATERIAL_PRODUCTION_TASK_MACHINE_MISMATCH",
      },
    );
  }

  const orderLineId = cleanText(productionTask.orderLineId ?? productionTask.order_line_id ?? productionTask.lineId);
  const orderLine = findRawMaterialOrderLine(workspace, orderLineId);
  if (!orderLineId || !orderLine) {
    throw Object.assign(new Error(`Raw-material issue production task has no order line: ${productionTaskId}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_PRODUCTION_TASK_ORDER_LINE_NOT_FOUND",
    });
  }

  const materialType = cleanText(inbound.materialType);
  const productName = cleanText(inbound.productName);
  const factoryColor = cleanText(inbound.factoryColor ?? inbound.supplierColor);
  const taskBagColor = cleanText(orderLine.bagColor ?? orderLine.bag_color ?? orderLine.color);
  const materialColorKey = normalizeRawMaterialColorKey(factoryColor);
  const taskBagColorKey = normalizeRawMaterialColorKey(taskBagColor);
  const goodsSpec = buildRawMaterialProductionTaskGoodsSpec(productionTask, orderLine);

  if (
    isRawMaterialBagBodyMaterial(materialType, productName) &&
    materialColorKey &&
    taskBagColorKey &&
    materialColorKey !== taskBagColorKey
  ) {
    throw Object.assign(
      new Error(`Raw-material color ${factoryColor} does not match production task bag color ${taskBagColor}`),
      {
        statusCode: 422,
        code: "RAW_MATERIAL_PRODUCTION_TASK_COLOR_MISMATCH",
      },
    );
  }

  if (isRawMaterialHandleMaterial(materialType, productName)) {
    return {
      status: "需复核",
      reason: "生产任务已关联；提手颜色和提手类型仍需按现场实物或订单备注人工复核。",
      orderLineId,
      machineId: taskMachineId,
      goodsSpec,
    };
  }

  return {
    status: "已匹配",
    reason: "生产任务存在，机台一致，布料颜色与订单袋色一致；仍不生成成品数量或成本分摊。",
    orderLineId,
    machineId: taskMachineId,
    goodsSpec,
  };
}

function findRawMaterialProductionTask(workspace = {}, productionTaskId = "") {
  const id = cleanText(productionTaskId);
  if (!id) return null;
  return (
    (workspace.productionTasks ?? []).find((task) => {
      const taskId = cleanText(task?.productionTaskId ?? task?.production_task_id ?? task?.id);
      return taskId === id;
    }) ?? null
  );
}

function findRawMaterialOrderLine(workspace = {}, orderLineId = "") {
  const id = cleanText(orderLineId);
  if (!id) return null;
  return (
    (workspace.orderLines ?? []).find((line) => {
      const lineId = cleanText(line?.orderLineId ?? line?.order_line_id ?? line?.id);
      return lineId === id;
    }) ?? null
  );
}

function normalizeRawMaterialMachineId(value) {
  const text = cleanText(value).toUpperCase();
  if (!text) return "";
  if (text === "制袋机-01" || text === "制袋-01" || text === "1号制袋机") return "BAG-01";
  if (text === "丝印机-01" || text === "丝印-01" || text === "1号丝印机") return "PRINT-01";
  return text;
}

function isRawMaterialBagBodyMaterial(materialType, productName) {
  const text = `${cleanText(materialType)} ${cleanText(productName)}`;
  return text.includes("布") || text.includes("无纺") || text.includes("卷料");
}

function isRawMaterialHandleMaterial(materialType, productName) {
  const text = `${cleanText(materialType)} ${cleanText(productName)}`;
  return text.includes("提手");
}

function normalizeRawMaterialColorKey(value) {
  const text = cleanText(value)
    .replace(/本白/g, "白")
    .replace(/大红/g, "红")
    .replace(/浅黄/g, "黄")
    .replace(/深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  if (!text) return "";
  const colorMap = [
    ["白", "白"],
    ["黑", "黑"],
    ["红", "红"],
    ["黄", "黄"],
    ["蓝", "蓝"],
    ["绿", "绿"],
    ["灰", "灰"],
    ["粉", "粉"],
    ["紫", "紫"],
    ["橙", "橙"],
  ];
  const found = colorMap.find(([token]) => text.includes(token));
  return found ? found[1] : text;
}

function buildRawMaterialProductionTaskGoodsSpec(productionTask = {}, orderLine = {}) {
  const productName = cleanText(orderLine.productName ?? orderLine.product_name ?? orderLine.product) || "生产任务";
  const size = cleanText(orderLine.size);
  const color = cleanText(orderLine.bagColor ?? orderLine.bag_color ?? orderLine.color);
  const qty = Number(productionTask.plannedQty ?? productionTask.planned_qty ?? productionTask.qty ?? orderLine.qty ?? orderLine.originalQty ?? 0) || 0;
  return [productName, size, color, qty ? `${qty}个` : ""].filter(Boolean).join(" ");
}

function buildRawMaterialCostAllocationDrafts(input = {}) {
  const inbound = input.inbound ?? {};
  const issueRecords = normalizeRawMaterialIssueRecords(input.issueRecords);
  const consumptionRecords = normalizeRawMaterialConsumptionRecords(input.consumptionRecords);
  const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(input.existingCostDrafts);
  const existingConsumptionIds = new Set(existingCostDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
  const unitPrice = Number(inbound.unitPrice ?? inbound.unit_price ?? 0) || 0;
  const warnings = [];
  const skipped = [];
  if (!unitPrice) {
    return {
      drafts: [],
      warnings,
      blockedCode: "RAW_MATERIAL_COST_DRAFT_REQUIRES_UNIT_PRICE",
      blockedReason: "Raw-material unit price is required before generating a cost allocation draft",
    };
  }
  const baseId = `RMCA-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
  const drafts = [];
  for (const record of consumptionRecords) {
    if (existingConsumptionIds.has(record.consumptionRecordId)) {
      skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "已生成成本草稿" });
      continue;
    }
    const issueRecord =
      issueRecords.find((item) => item.issueRecordId === record.issueRecordId) ??
      issueRecords.find((item) => item.rollId === record.rollId);
    if (!issueRecord) {
      skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "缺少领料记录" });
      continue;
    }
    const productionTaskId = cleanText(record.productionTaskId || issueRecord.productionTaskId);
    const matchStatus = cleanText(issueRecord.productionTaskMatchStatus);
    if (!productionTaskId || matchStatus !== "已匹配") {
      skipped.push({
        consumptionRecordId: record.consumptionRecordId,
        reason: productionTaskId ? `生产任务匹配状态为 ${matchStatus || "未确认"}` : "未关联生产任务",
      });
      continue;
    }
    const orderLineId = cleanText(issueRecord.productionTaskOrderLineId);
    const productionTask = findRawMaterialProductionTask(input.workspace, productionTaskId);
    const orderLine = findRawMaterialOrderLine(input.workspace, orderLineId);
    const allocatedWeightKg = roundWeight(record.consumedWeightKg || 0);
    const allocatedQuantity = allocatedWeightKg > 0 ? 0 : Number(record.consumedQuantity || 0) || 1;
    if (allocatedWeightKg <= 0 && allocatedQuantity <= 0) {
      skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "缺少已消耗重量或件数" });
      continue;
    }
    const allocatedCostAmount = roundMoney((allocatedWeightKg > 0 ? allocatedWeightKg : allocatedQuantity) * unitPrice);
    const goodsSpec =
      cleanText(issueRecord.productionTaskGoodsSpec) ||
      buildRawMaterialProductionTaskGoodsSpec(productionTask ?? {}, orderLine ?? {});
    const unit = record.unit || inbound.unit || (allocatedWeightKg > 0 ? "kg" : "件");
    const draftIndex = drafts.length + 1;
    drafts.push({
      costAllocationDraftId: `${baseId}-${String(draftIndex).padStart(2, "0")}`,
      inboundId: inbound.id,
      consumptionRecordId: record.consumptionRecordId,
      issueRecordId: issueRecord.issueRecordId,
      rollId: record.rollId,
      sourceRollId: issueRecord.sourceRollId,
      splitRecordId: issueRecord.splitRecordId,
      supplierName: inbound.supplierName,
      deliveryNoteNo: inbound.deliveryNoteNo,
      materialType: inbound.materialType,
      productName: inbound.productName,
      spec: inbound.spec,
      factoryColor: inbound.factoryColor,
      unit,
      unitPrice,
      allocatedWeightKg,
      allocatedQuantity,
      allocatedCostAmount,
      productionTaskId,
      orderLineId,
      productionTaskMachineId: cleanText(issueRecord.productionTaskMachineId || issueRecord.machineId),
      productionTaskGoodsSpec: goodsSpec,
      allocationBasis:
        allocatedWeightKg > 0
          ? `${allocatedWeightKg}kg * ${unitPrice}元/kg`
          : `${allocatedQuantity}${unit} * ${unitPrice}元/${unit}`,
      allocationStatus: "草稿/待成本复核",
      costEffect: "draft_only",
      marginEffect: "none",
      lossCalibrationStatus: "待损耗校准",
      generatedBy: input.operatorName,
      generatedByUserId: input.operatorId,
      generatedAt: input.now,
      note: cleanText(input.note) || "V1 原材料成本分摊草稿；不直接确认订单毛利，需成本/管理复核。",
    });
  }
  if (skipped.length) {
    warnings.push(...skipped.map((item) => `${item.consumptionRecordId || "消耗记录"}：${item.reason}`));
  }
  return {
    drafts,
    warnings,
    blockedCode: consumptionRecords.length
      ? "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION"
      : "RAW_MATERIAL_COST_DRAFT_REQUIRES_CONSUMPTION",
    blockedReason: consumptionRecords.length
      ? "No matched raw-material consumption records are eligible for cost allocation draft"
      : "Raw-material consumption confirmation is required before generating a cost allocation draft",
  };
}

function buildRawMaterialCostAllocationConfirmation(input = {}) {
  const inbound = input.inbound ?? {};
  const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts);
  const confirmedAmount = roundMoney(drafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0));
  const confirmedWeightKg = roundWeight(drafts.reduce((sum, record) => sum + Number(record.allocatedWeightKg || 0), 0));
  const confirmedQuantity = drafts.reduce((sum, record) => sum + Number(record.allocatedQuantity || 0), 0);
  return {
    costConfirmationId: `RMCC-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
    inboundId: inbound.id,
    supplierName: inbound.supplierName,
    deliveryNoteNo: inbound.deliveryNoteNo,
    costAllocationDraftIds: drafts.map((record) => record.costAllocationDraftId).filter(Boolean),
    consumptionRecordIds: drafts.map((record) => record.consumptionRecordId).filter(Boolean),
    issueRecordIds: drafts.map((record) => record.issueRecordId).filter(Boolean),
    productionTaskIds: [...new Set(drafts.map((record) => record.productionTaskId).filter(Boolean))],
    orderLineIds: [...new Set(drafts.map((record) => record.orderLineId).filter(Boolean))],
    confirmedCount: drafts.length,
    confirmedWeightKg,
    confirmedQuantity,
    confirmedCostAmount: confirmedAmount,
    reviewStatus: "已复核/待损耗校准",
    costEffect: "confirmed_material_cost_snapshot",
    marginEffect: "none",
    lossCalibrationStatus: "待损耗校准",
    confirmedBy: input.operatorName,
    confirmedByUserId: input.operatorId,
    confirmedAt: input.now,
    note: cleanText(input.note) || "V1 成本草稿复核确认；只形成原材料成本快照，不自动更新订单毛利。",
  };
}

function buildRawMaterialCostLossCalibration(input = {}) {
  const inbound = input.inbound ?? {};
  const confirmations = normalizeRawMaterialCostAllocationConfirmations(input.confirmations);
  const draftIds = new Set(confirmations.flatMap((record) => record.costAllocationDraftIds ?? []));
  const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts).filter((record) =>
    draftIds.has(record.costAllocationDraftId),
  );
  const confirmedAmount = roundMoney(confirmations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0));
  const confirmedWeightKg = roundWeight(confirmations.reduce((sum, record) => sum + Number(record.confirmedWeightKg || 0), 0));
  const confirmedQuantity = confirmations.reduce((sum, record) => sum + Number(record.confirmedQuantity || 0), 0);
  const body = input.body ?? {};
  const actualQualifiedOutputQuantity =
    Number(body.actualQualifiedOutputQuantity ?? body.actualOutputQuantity ?? body.qualifiedOutputQuantity ?? 0) || 0;
  const expectedOutputQuantity =
    Number(body.expectedOutputQuantity ?? body.plannedOutputQuantity ?? body.estimatedOutputQuantity ?? 0) || 0;
  const explicitLossQuantity = Number(body.lossQuantity ?? body.lossOutputQuantity ?? 0) || 0;
  const lossQuantity =
    explicitLossQuantity > 0
      ? explicitLossQuantity
      : expectedOutputQuantity > 0 && actualQualifiedOutputQuantity >= 0
        ? Math.max(0, expectedOutputQuantity - actualQualifiedOutputQuantity)
        : 0;
  const lossRatePercent =
    expectedOutputQuantity > 0
      ? Math.round((lossQuantity / expectedOutputQuantity) * 10000) / 100
      : 0;
  return {
    lossCalibrationId: `RMCL-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
    inboundId: inbound.id,
    supplierName: inbound.supplierName,
    deliveryNoteNo: inbound.deliveryNoteNo,
    costConfirmationId: confirmations[0]?.costConfirmationId || "",
    costConfirmationIds: confirmations.map((record) => record.costConfirmationId).filter(Boolean),
    costAllocationDraftIds: confirmations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean),
    consumptionRecordIds: confirmations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean),
    issueRecordIds: confirmations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean),
    productionTaskIds: [...new Set(confirmations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
    orderLineIds: [...new Set(confirmations.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
    confirmedCount: confirmations.reduce((sum, record) => sum + Number(record.confirmedCount || 0), 0),
    confirmedWeightKg,
    confirmedQuantity,
    confirmedCostAmount: confirmedAmount || roundMoney(drafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0)),
    expectedOutputQuantity,
    actualQualifiedOutputQuantity,
    lossQuantity,
    lossRatePercent,
    calibrationBasis:
      expectedOutputQuantity > 0
        ? `${actualQualifiedOutputQuantity}/${expectedOutputQuantity} 合格产量，损耗 ${lossQuantity}，损耗率 ${lossRatePercent}%`
        : "V1 手工损耗校准；现场尚未提供预计合格产量，先记录成本快照待毛利确认。",
    calibrationStatus: "已校准/待毛利确认",
    costEffect: "loss_calibrated_material_cost_snapshot",
    marginEffect: "pending_margin_snapshot",
    calibratedBy: input.operatorName,
    calibratedByUserId: input.operatorId,
    calibratedAt: input.now,
    note: cleanText(body.note) || "V1 损耗校准第一版；只形成待毛利确认的成本校准快照。",
  };
}

function buildRawMaterialOrderMarginSnapshot(input = {}) {
  const inbound = input.inbound ?? {};
  const calibrations = normalizeRawMaterialCostLossCalibrations(input.calibrations);
  const calibrationIds = new Set(calibrations.map((record) => record.lossCalibrationId).filter(Boolean));
  const draftIds = new Set(calibrations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
  const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts).filter((record) =>
    draftIds.has(record.costAllocationDraftId),
  );
  const confirmations = normalizeRawMaterialCostAllocationConfirmations(input.confirmations).filter((record) =>
    calibrations.some((calibration) => (calibration.costConfirmationIds ?? []).includes(record.costConfirmationId)),
  );
  const orderLineIds = [
    ...new Set(
      [
        ...calibrations.flatMap((record) => record.orderLineIds ?? []),
        ...drafts.map((record) => record.orderLineId),
      ].filter(Boolean),
    ),
  ];
  const totalCalibratedCostAmount = roundMoney(
    calibrations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0) ||
      drafts.reduce((sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
  );
  const warnings = [];
  const lineItems = orderLineIds.map((orderLineId) => {
    const orderLine = findRawMaterialOrderLine(input.workspace, orderLineId) ?? {};
    const customer = findRawMaterialCustomer(input.workspace, orderLine.customerId ?? orderLine.customer_id);
    const lineDrafts = drafts.filter((record) => record.orderLineId === orderLineId);
    const lineMaterialCostAmount = roundMoney(
      lineDrafts.reduce(
        (sum, record) =>
          sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0),
        0,
      ) || (orderLineIds.length ? totalCalibratedCostAmount / orderLineIds.length : totalCalibratedCostAmount),
    );
    const salesAmount = roundMoney(
      Number(
        orderLine.amount ??
          orderLine.finalAmount ??
          orderLine.totalAmount ??
          orderLine.priceSnapshot?.finalAmount ??
          orderLine.priceSnapshot?.amount ??
          0,
      ) || 0,
    );
    const grossProfitAmount = salesAmount > 0 ? roundMoney(salesAmount - lineMaterialCostAmount) : 0;
    const grossMarginRatePercent = salesAmount > 0 ? Math.round((grossProfitAmount / salesAmount) * 10000) / 100 : 0;
    if (!salesAmount) warnings.push(`${orderLineId}：缺少订单销售金额，毛利率待补订单收入后复核`);
    return {
      orderLineId,
      orderNo: cleanText(orderLine.orderNo ?? orderLine.order_no),
      customerId: cleanText(orderLine.customerId ?? orderLine.customer_id),
      customerName: cleanText(customer?.name ?? customer?.customerName ?? orderLine.customerName),
      productName: cleanText(orderLine.productName ?? orderLine.product_name ?? orderLine.product),
      goodsSpec: buildRawMaterialProductionTaskGoodsSpec({}, orderLine),
      quantity: Number(orderLine.qty ?? orderLine.quantity ?? orderLine.originalQty ?? 0) || 0,
      salesAmount,
      materialCostAmount: lineMaterialCostAmount,
      grossProfitAmount,
      grossMarginRatePercent,
      marginStatus: salesAmount > 0 ? "已生成/待财务复核" : "需补订单收入",
      costAllocationDraftIds: lineDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
      productionTaskIds: [...new Set(lineDrafts.map((record) => record.productionTaskId).filter(Boolean))],
    };
  });
  const totalSalesAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
  const totalMaterialCostAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
  const grossProfitAmount = totalSalesAmount > 0 ? roundMoney(totalSalesAmount - totalMaterialCostAmount) : 0;
  const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
  return {
    marginSnapshotId: `RMMG-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
    inboundId: inbound.id,
    supplierName: inbound.supplierName,
    deliveryNoteNo: inbound.deliveryNoteNo,
    lossCalibrationIds: [...calibrationIds],
    costConfirmationIds: confirmations.map((record) => record.costConfirmationId).filter(Boolean),
    costAllocationDraftIds: [...draftIds],
    consumptionRecordIds: [...new Set(calibrations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
    issueRecordIds: [...new Set(calibrations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
    productionTaskIds: [...new Set(calibrations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
    orderLineIds,
    lineItems,
    totalSalesAmount,
    totalMaterialCostAmount,
    grossProfitAmount,
    grossMarginRatePercent,
    reviewStatus: "已生成/待财务复核",
    costEffect: "loss_calibrated_material_cost_snapshot",
    marginEffect: "margin_snapshot_pending_review",
    generatedBy: input.operatorName,
    generatedByUserId: input.operatorId,
    generatedAt: input.now,
    note: cleanText(input.note) || "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
    warnings,
  };
}

function buildRawMaterialOrderMarginReport(input = {}) {
  const inbound = input.inbound ?? {};
  const snapshots = normalizeRawMaterialOrderMarginSnapshots(input.snapshots);
  const lineItems = snapshots.flatMap((snapshot) =>
    (snapshot.lineItems ?? []).map((line) => ({
      ...line,
      marginSnapshotId: snapshot.marginSnapshotId,
      marginStatus: "已财务复核/报表可用",
    })),
  );
  const totalSalesAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
  const totalMaterialCostAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
  const grossProfitAmount = roundMoney(totalSalesAmount - totalMaterialCostAmount);
  const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
  return {
    marginReportId: `RMMR-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
    inboundId: inbound.id,
    supplierName: inbound.supplierName,
    deliveryNoteNo: inbound.deliveryNoteNo,
    marginSnapshotIds: snapshots.map((record) => record.marginSnapshotId).filter(Boolean),
    lossCalibrationIds: [...new Set(snapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean))],
    costConfirmationIds: [...new Set(snapshots.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
    costAllocationDraftIds: [...new Set(snapshots.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean))],
    consumptionRecordIds: [...new Set(snapshots.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
    issueRecordIds: [...new Set(snapshots.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
    productionTaskIds: [...new Set(snapshots.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
    orderLineIds: [...new Set(snapshots.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
    lineItems,
    totalSalesAmount,
    totalMaterialCostAmount,
    grossProfitAmount,
    grossMarginRatePercent,
    reviewStatus: "已财务复核/报表可用",
    reportStatus: "已生成内部毛利报表",
    costEffect: "loss_calibrated_material_cost_snapshot",
    marginEffect: "reviewed_margin_report_snapshot",
    reviewedBy: input.operatorName,
    reviewedByUserId: input.operatorId,
    reviewedAt: input.now,
    note: cleanText(input.note) || "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
    warnings: [],
  };
}

function findRawMaterialCustomer(workspace = {}, customerId = "") {
  const id = cleanText(customerId);
  if (!id) return null;
  return (
    (workspace.customers ?? []).find((customer) => {
      const customerRecordId = cleanText(customer?.id ?? customer?.customerId ?? customer?.customer_id);
      return customerRecordId === id;
    }) ?? null
  );
}

export function normalizeRawMaterialInbounds(inbounds = []) {
  return (Array.isArray(inbounds) ? inbounds : [])
    .map(normalizeRawMaterialInbound)
    .filter((item) => item?.id);
}

function normalizeRawMaterialInbound(input = {}) {
  if (!input || typeof input !== "object") return null;
  const item = { ...input };
  item.id = cleanText(item.id);
  item.revision = Math.max(1, Number(item.revision) || 1);
  item.supplierName = cleanText(item.supplierName);
  item.deliveryNoteNo = cleanText(item.deliveryNoteNo);
  item.status = cleanText(item.status) || "已识别待复核";
  item.issueStatus = cleanText(item.issueStatus);
  item.machineId = cleanText(item.machineId);
  item.productionTaskId = cleanText(item.productionTaskId);
  item.productionTaskMatchStatus = cleanText(item.productionTaskMatchStatus);
  item.productionTaskMatchReason = cleanText(item.productionTaskMatchReason);
  item.productionTaskOrderLineId = cleanText(item.productionTaskOrderLineId);
  item.productionTaskMachineId = cleanText(item.productionTaskMachineId);
  item.productionTaskGoodsSpec = cleanText(item.productionTaskGoodsSpec);
  item.costAllocationStatus = cleanText(item.costAllocationStatus);
  item.costAllocationDraftedBy = cleanText(item.costAllocationDraftedBy);
  item.costAllocationDraftedByUserId = cleanText(item.costAllocationDraftedByUserId);
  item.costAllocationDraftedAt = cleanText(item.costAllocationDraftedAt);
  item.costAllocationDraftCount = Number(item.costAllocationDraftCount) || 0;
  item.costAllocationDraftAmount = Number(item.costAllocationDraftAmount) || 0;
  item.costAllocationReviewStatus = cleanText(item.costAllocationReviewStatus);
  item.costAllocationConfirmedBy = cleanText(item.costAllocationConfirmedBy);
  item.costAllocationConfirmedByUserId = cleanText(item.costAllocationConfirmedByUserId);
  item.costAllocationConfirmedAt = cleanText(item.costAllocationConfirmedAt);
  item.costAllocationConfirmedCount = Number(item.costAllocationConfirmedCount) || 0;
  item.costAllocationConfirmedAmount = Number(item.costAllocationConfirmedAmount) || 0;
  item.costAllocationConfirmationId = cleanText(item.costAllocationConfirmationId);
  item.lossCalibrationStatus = cleanText(item.lossCalibrationStatus);
  item.lossCalibratedBy = cleanText(item.lossCalibratedBy);
  item.lossCalibratedByUserId = cleanText(item.lossCalibratedByUserId);
  item.lossCalibratedAt = cleanText(item.lossCalibratedAt);
  item.lossCalibrationCount = Number(item.lossCalibrationCount) || 0;
  item.lossCalibrationId = cleanText(item.lossCalibrationId);
  item.lossCalibrationRatePercent = Number(item.lossCalibrationRatePercent) || 0;
  item.lossCalibrationActualOutputQuantity = Number(item.lossCalibrationActualOutputQuantity) || 0;
  item.lossCalibrationExpectedOutputQuantity = Number(item.lossCalibrationExpectedOutputQuantity) || 0;
  item.lossCalibrationAmount = Number(item.lossCalibrationAmount) || 0;
  item.marginSnapshotStatus = cleanText(item.marginSnapshotStatus);
  item.marginSnapshotCount = Number(item.marginSnapshotCount) || 0;
  item.marginSnapshotId = cleanText(item.marginSnapshotId);
  item.marginSnapshotTotalSalesAmount = Number(item.marginSnapshotTotalSalesAmount) || 0;
  item.marginSnapshotMaterialCostAmount = Number(item.marginSnapshotMaterialCostAmount) || 0;
  item.marginSnapshotGrossProfitAmount = Number(item.marginSnapshotGrossProfitAmount) || 0;
  item.marginSnapshotGrossMarginRatePercent = Number(item.marginSnapshotGrossMarginRatePercent) || 0;
  item.marginSnapshotGeneratedBy = cleanText(item.marginSnapshotGeneratedBy);
  item.marginSnapshotGeneratedByUserId = cleanText(item.marginSnapshotGeneratedByUserId);
  item.marginSnapshotGeneratedAt = cleanText(item.marginSnapshotGeneratedAt);
  item.marginReportStatus = cleanText(item.marginReportStatus);
  item.marginReportCount = Number(item.marginReportCount) || 0;
  item.marginReportId = cleanText(item.marginReportId);
  item.marginReportTotalSalesAmount = Number(item.marginReportTotalSalesAmount) || 0;
  item.marginReportMaterialCostAmount = Number(item.marginReportMaterialCostAmount) || 0;
  item.marginReportGrossProfitAmount = Number(item.marginReportGrossProfitAmount) || 0;
  item.marginReportGrossMarginRatePercent = Number(item.marginReportGrossMarginRatePercent) || 0;
  item.marginReviewedBy = cleanText(item.marginReviewedBy);
  item.marginReviewedByUserId = cleanText(item.marginReviewedByUserId);
  item.marginReviewedAt = cleanText(item.marginReviewedAt);
  item.rawMaterialCostAllocationWarnings = normalizeRawMaterialCostAllocationWarnings(item.rawMaterialCostAllocationWarnings);
  item.rolls = (Array.isArray(item.rolls) ? item.rolls : []).map((roll) => ({
    ...roll,
    id: cleanText(roll.id),
    supplierRollNo: cleanText(roll.supplierRollNo),
    weightKg: Number(roll.weightKg) || 0,
    originalWeightKg: Number(roll.originalWeightKg) || 0,
    labelStatus: cleanText(roll.labelStatus) || "待生成标签",
    inventoryStatus: cleanText(roll.inventoryStatus) || "不可用",
    location: cleanText(roll.location),
    scannedAt: cleanText(roll.scannedAt),
    signedNoteStatus: cleanText(roll.signedNoteStatus) || (roll.scannedAt ? "已扫码/签单" : "待扫码/签单"),
    parentRollId: cleanText(roll.parentRollId),
    sourceRollId: cleanText(roll.sourceRollId),
    splitRecordId: cleanText(roll.splitRecordId),
    splitStatus: cleanText(roll.splitStatus),
    splitAt: cleanText(roll.splitAt),
    splitBy: cleanText(roll.splitBy),
    splitByUserId: cleanText(roll.splitByUserId),
    splitIssuedWeightKg: Number(roll.splitIssuedWeightKg) || 0,
    splitRemainingWeightKg: Number(roll.splitRemainingWeightKg) || 0,
    issueRecordId: cleanText(roll.issueRecordId),
    issuedAt: cleanText(roll.issuedAt),
    issuedBy: cleanText(roll.issuedBy),
    issuedByUserId: cleanText(roll.issuedByUserId),
    machineId: cleanText(roll.machineId),
    productionTaskId: cleanText(roll.productionTaskId),
    productionTaskMatchStatus: cleanText(roll.productionTaskMatchStatus),
    productionTaskMatchReason: cleanText(roll.productionTaskMatchReason),
    productionTaskOrderLineId: cleanText(roll.productionTaskOrderLineId),
    productionTaskMachineId: cleanText(roll.productionTaskMachineId),
    productionTaskGoodsSpec: cleanText(roll.productionTaskGoodsSpec),
    issuePurpose: cleanText(roll.issuePurpose),
    consumptionStatus: cleanText(roll.consumptionStatus),
    consumptionRecordId: cleanText(roll.consumptionRecordId),
    consumedAt: cleanText(roll.consumedAt),
    consumedBy: cleanText(roll.consumedBy),
    consumedByUserId: cleanText(roll.consumedByUserId),
    lastConsumedWeightKg: Number(roll.lastConsumedWeightKg) || 0,
    remainingMachineSideWeightKg: Number(roll.remainingMachineSideWeightKg) || 0,
    leftoverReturnRecordId: cleanText(roll.leftoverReturnRecordId),
    leftoverWeightKg: Number(roll.leftoverWeightKg) || 0,
    leftoverQuantity: Number(roll.leftoverQuantity) || 0,
    returnedAt: cleanText(roll.returnedAt),
    returnedBy: cleanText(roll.returnedBy),
    returnedByUserId: cleanText(roll.returnedByUserId),
    leftoverReviewRecordId: cleanText(roll.leftoverReviewRecordId),
    leftoverReviewedWeightKg: Number(roll.leftoverReviewedWeightKg) || 0,
    leftoverReviewedQuantity: Number(roll.leftoverReviewedQuantity) || 0,
    leftoverReviewedAt: cleanText(roll.leftoverReviewedAt),
    leftoverReviewedBy: cleanText(roll.leftoverReviewedBy),
    leftoverReviewedByUserId: cleanText(roll.leftoverReviewedByUserId),
  }));
  item.rawMaterialIssueRecords = normalizeRawMaterialIssueRecords(item.rawMaterialIssueRecords);
  item.rawMaterialConsumptionRecords = normalizeRawMaterialConsumptionRecords(item.rawMaterialConsumptionRecords);
  item.rawMaterialLeftoverReturnRecords = normalizeRawMaterialLeftoverReturnRecords(item.rawMaterialLeftoverReturnRecords);
  item.rawMaterialLeftoverReviewRecords = normalizeRawMaterialLeftoverReviewRecords(item.rawMaterialLeftoverReviewRecords);
  item.rawMaterialSplitRecords = normalizeRawMaterialSplitRecords(item.rawMaterialSplitRecords);
  item.rawMaterialCostAllocationDrafts = normalizeRawMaterialCostAllocationDrafts(item.rawMaterialCostAllocationDrafts);
  item.rawMaterialCostAllocationConfirmations = normalizeRawMaterialCostAllocationConfirmations(item.rawMaterialCostAllocationConfirmations);
  item.rawMaterialCostLossCalibrations = normalizeRawMaterialCostLossCalibrations(item.rawMaterialCostLossCalibrations);
  item.rawMaterialOrderMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(item.rawMaterialOrderMarginSnapshots);
  item.rawMaterialOrderMarginReports = normalizeRawMaterialOrderMarginReports(item.rawMaterialOrderMarginReports);
  return item;
}

function normalizeRawMaterialInboundActionResult(value) {
  if (!value || typeof value !== "object") return { inbound: null, operationLogId: "" };
  return {
    inbound: normalizeRawMaterialInbound(value.inbound),
    operationLogId: cleanText(value.operationLogId),
  };
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType),
    targetId: cleanText(value.targetId),
    action: cleanText(value.action),
    before: value.before ?? {},
    after: value.after ?? {},
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId),
    pageKey: cleanText(value.pageKey) || "rawMaterials",
    occurredAt: cleanText(value.occurredAt),
    createdAt: cleanText(value.createdAt),
  };
}

function findRawMaterialInbound(workspace, inboundId) {
  const safeInboundId = cleanText(inboundId);
  return normalizeRawMaterialInbounds(workspace?.rawMaterialInbounds).find((item) => item.id === safeInboundId) ?? null;
}

function buildRawMaterialInboundMetrics(inbounds = []) {
  const items = normalizeRawMaterialInbounds(inbounds);
  return {
    totalCount: items.length,
    pendingReviewCount: items.filter((item) => item.status.includes("待复核")).length,
    pendingLabelCount: items.filter((item) => item.status.includes("待打印") || item.status.includes("待贴标")).length,
    partiallyLabeledCount: items.filter((item) => item.status === "部分贴标").length,
    availableCount: items.filter((item) => item.status === "已贴标入库/可用").length,
    issuedCount: items.filter((item) => item.status.includes("领料/机边")).length,
    consumptionConfirmedCount: items.filter((item) => item.status.includes("消耗确认")).length,
    leftoverPendingCount: items.filter((item) => item.status.includes("余料")).length,
    leftoverReviewedCount: items.filter((item) => item.status.includes("余料已复核")).length,
    splitRollCount: items.reduce((sum, item) => sum + (item.rawMaterialSplitRecords ?? []).length, 0),
    costAllocationDraftCount: items.reduce((sum, item) => sum + (item.rawMaterialCostAllocationDrafts ?? []).length, 0),
    costAllocationConfirmedCount: items.reduce((sum, item) => sum + (item.rawMaterialCostAllocationConfirmations ?? []).length, 0),
    lossCalibrationCount: items.reduce((sum, item) => sum + (item.rawMaterialCostLossCalibrations ?? []).length, 0),
    marginSnapshotCount: items.reduce((sum, item) => sum + (item.rawMaterialOrderMarginSnapshots ?? []).length, 0),
    marginReportCount: items.reduce((sum, item) => sum + (item.rawMaterialOrderMarginReports ?? []).length, 0),
    exceptionCount: items.filter((item) => item.status.includes("异常")).length,
    availableRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用").length,
      0,
    ),
    machineSideRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用").length,
      0,
    ),
    consumedRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "已消耗").length,
      0,
    ),
    leftoverPendingRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核").length,
      0,
    ),
    leftoverReviewedRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.leftoverReviewRecordId).length,
      0,
    ),
    unavailableRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用").length,
      0,
    ),
  };
}

function normalizeAction(action) {
  const value = cleanText(action);
  const actionMap = new Map([
    ["复核送货单", "review"],
    ["review", "review"],
    ["打印卷标", "print_labels"],
    ["print_labels", "print_labels"],
    ["print-labels", "print_labels"],
    ["确认贴标入库", "attach_confirm"],
    ["attach_confirm", "attach_confirm"],
    ["attach-confirm", "attach_confirm"],
    ["机边领料", "issue_to_machine"],
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
  if (action === "review") return "人工复核原材料送货单、OCR 字段和实物原标签";
  if (action === "print_labels") return "打印一卷一标，等待贴到对应卷/件";
  if (action === "attach_confirm") return "手机扫码确认标签已贴到对应卷/件，并上传签单信息";
  if (action === "issue_to_machine") return "整卷/整件或拆卷机边领料，等待生产报工确认消耗";
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
  };
}

function normalizeRawMaterialIssueRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      issueRecordId: cleanText(record.issueRecordId ?? record.id),
      inboundId: cleanText(record.inboundId),
      rollId: cleanText(record.rollId),
      sourceRollId: cleanText(record.sourceRollId),
      splitRecordId: cleanText(record.splitRecordId),
      supplierRollNo: cleanText(record.supplierRollNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      issuedWeightKg: Number(record.issuedWeightKg) || 0,
      issuedQuantity: Number(record.issuedQuantity) || 0,
      sourceWeightKg: Number(record.sourceWeightKg) || 0,
      remainingWeightKg: Number(record.remainingWeightKg) || 0,
      remainingMachineSideWeightKg: Number(record.remainingMachineSideWeightKg) || 0,
      unit: cleanText(record.unit),
      machineId: cleanText(record.machineId),
      productionTaskId: cleanText(record.productionTaskId),
      productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
      productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
      productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
      productionTaskMachineId: cleanText(record.productionTaskMachineId),
      productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
      issuePurpose: cleanText(record.issuePurpose) || "生产领料",
      issueMode: cleanText(record.issueMode) || "整卷/整件领料",
      consumptionStatus: cleanText(record.consumptionStatus) || "待生产消耗确认",
      issuedBy: cleanText(record.issuedBy),
      issuedByUserId: cleanText(record.issuedByUserId),
      issuedAt: cleanText(record.issuedAt),
      consumptionRecordId: cleanText(record.consumptionRecordId),
      consumedWeightKg: Number(record.consumedWeightKg) || 0,
      consumedAt: cleanText(record.consumedAt),
      consumedBy: cleanText(record.consumedBy),
      consumedByUserId: cleanText(record.consumedByUserId),
      leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
      returnedAt: cleanText(record.returnedAt),
      returnedBy: cleanText(record.returnedBy),
      returnedByUserId: cleanText(record.returnedByUserId),
      leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
      leftoverReviewedAt: cleanText(record.leftoverReviewedAt),
      leftoverReviewedBy: cleanText(record.leftoverReviewedBy),
      leftoverReviewedByUserId: cleanText(record.leftoverReviewedByUserId),
      costAllocationStatus: cleanText(record.costAllocationStatus),
      costAllocationDraftId: cleanText(record.costAllocationDraftId),
      allocatedCostAmount: Number(record.allocatedCostAmount) || 0,
      allocatedWeightKg: Number(record.allocatedWeightKg) || 0,
      allocatedQuantity: Number(record.allocatedQuantity) || 0,
      costConfirmationId: cleanText(record.costConfirmationId),
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      costConfirmedAt: cleanText(record.costConfirmedAt),
      costConfirmedBy: cleanText(record.costConfirmedBy),
      costConfirmedByUserId: cleanText(record.costConfirmedByUserId),
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      lossCalibratedAt: cleanText(record.lossCalibratedAt),
      lossCalibratedBy: cleanText(record.lossCalibratedBy),
      lossCalibratedByUserId: cleanText(record.lossCalibratedByUserId),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginReportId: cleanText(record.marginReportId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      note: cleanText(record.note),
    }))
    .filter((record) => record.issueRecordId && record.rollId);
}

function normalizeRawMaterialConsumptionRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      consumptionRecordId: cleanText(record.consumptionRecordId ?? record.id),
      inboundId: cleanText(record.inboundId),
      issueRecordId: cleanText(record.issueRecordId),
      rollId: cleanText(record.rollId),
      supplierRollNo: cleanText(record.supplierRollNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      consumedWeightKg: Number(record.consumedWeightKg) || 0,
      consumedQuantity: Number(record.consumedQuantity) || 0,
      consumedFromWeightKg: Number(record.consumedFromWeightKg) || 0,
      remainingMachineSideWeightKg: Number(record.remainingMachineSideWeightKg) || 0,
      partialConsumption: Boolean(record.partialConsumption),
      unit: cleanText(record.unit),
      machineId: cleanText(record.machineId),
      productionTaskId: cleanText(record.productionTaskId),
      machineCount: cleanText(record.machineCount),
      qualifiedOutputQuantity: Number(record.qualifiedOutputQuantity) || 0,
      consumptionStatus: cleanText(record.consumptionStatus) || "已确认消耗",
      confirmedBy: cleanText(record.confirmedBy),
      confirmedByUserId: cleanText(record.confirmedByUserId),
      confirmedAt: cleanText(record.confirmedAt),
      costAllocationStatus: cleanText(record.costAllocationStatus),
      costAllocationDraftId: cleanText(record.costAllocationDraftId),
      allocatedCostAmount: Number(record.allocatedCostAmount) || 0,
      allocatedWeightKg: Number(record.allocatedWeightKg) || 0,
      allocatedQuantity: Number(record.allocatedQuantity) || 0,
      costConfirmationId: cleanText(record.costConfirmationId),
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      costConfirmedAt: cleanText(record.costConfirmedAt),
      costConfirmedBy: cleanText(record.costConfirmedBy),
      costConfirmedByUserId: cleanText(record.costConfirmedByUserId),
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      lossCalibratedAt: cleanText(record.lossCalibratedAt),
      lossCalibratedBy: cleanText(record.lossCalibratedBy),
      lossCalibratedByUserId: cleanText(record.lossCalibratedByUserId),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginReportId: cleanText(record.marginReportId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      note: cleanText(record.note),
    }))
    .filter((record) => record.consumptionRecordId && record.rollId);
}

function normalizeRawMaterialLeftoverReturnRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId ?? record.id),
      inboundId: cleanText(record.inboundId),
      issueRecordId: cleanText(record.issueRecordId),
      rollId: cleanText(record.rollId),
      supplierRollNo: cleanText(record.supplierRollNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      issuedWeightKg: Number(record.issuedWeightKg) || 0,
      machineSideWeightKg: Number(record.machineSideWeightKg) || 0,
      leftoverWeightKg: Number(record.leftoverWeightKg) || 0,
      leftoverQuantity: Number(record.leftoverQuantity) || 0,
      unit: cleanText(record.unit),
      machineId: cleanText(record.machineId),
      productionTaskId: cleanText(record.productionTaskId),
      returnLocation: cleanText(record.returnLocation) || "余料区",
      returnReason: cleanText(record.returnReason) || "机边余料退回",
      consumptionStatus: cleanText(record.consumptionStatus) || "已退回余料/待复核",
      returnedBy: cleanText(record.returnedBy),
      returnedByUserId: cleanText(record.returnedByUserId),
      returnedAt: cleanText(record.returnedAt),
      leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
      reviewStatus: cleanText(record.reviewStatus),
      reviewedAt: cleanText(record.reviewedAt),
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      note: cleanText(record.note),
    }))
    .filter((record) => record.leftoverReturnRecordId && record.rollId);
}

function normalizeRawMaterialLeftoverReviewRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId ?? record.id),
      inboundId: cleanText(record.inboundId),
      leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
      issueRecordId: cleanText(record.issueRecordId),
      rollId: cleanText(record.rollId),
      supplierRollNo: cleanText(record.supplierRollNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      returnedWeightKg: Number(record.returnedWeightKg) || 0,
      returnedQuantity: Number(record.returnedQuantity) || 0,
      reviewedWeightKg: Number(record.reviewedWeightKg) || 0,
      reviewedQuantity: Number(record.reviewedQuantity) || 0,
      unit: cleanText(record.unit),
      reviewLocation: cleanText(record.reviewLocation) || "原料库-余料可用区",
      reviewStatus: cleanText(record.reviewStatus) || "复核通过/可用",
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      reviewedAt: cleanText(record.reviewedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.leftoverReviewRecordId && record.rollId);
}

function normalizeRawMaterialSplitRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      splitRecordId: cleanText(record.splitRecordId ?? record.id),
      inboundId: cleanText(record.inboundId),
      sourceRollId: cleanText(record.sourceRollId),
      issuedRollId: cleanText(record.issuedRollId),
      supplierRollNo: cleanText(record.supplierRollNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      sourceWeightKg: Number(record.sourceWeightKg) || 0,
      issuedWeightKg: Number(record.issuedWeightKg) || 0,
      remainingWeightKg: Number(record.remainingWeightKg) || 0,
      unit: cleanText(record.unit),
      splitMode: cleanText(record.splitMode) || "部分领料/拆卷",
      machineId: cleanText(record.machineId),
      productionTaskId: cleanText(record.productionTaskId),
      productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
      productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
      productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
      productionTaskMachineId: cleanText(record.productionTaskMachineId),
      productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
      splitBy: cleanText(record.splitBy),
      splitByUserId: cleanText(record.splitByUserId),
      splitAt: cleanText(record.splitAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.splitRecordId && record.sourceRollId && record.issuedRollId);
}

function normalizeRawMaterialCostAllocationDrafts(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      costAllocationDraftId: cleanText(record.costAllocationDraftId ?? record.id),
      inboundId: cleanText(record.inboundId),
      consumptionRecordId: cleanText(record.consumptionRecordId),
      issueRecordId: cleanText(record.issueRecordId),
      rollId: cleanText(record.rollId),
      sourceRollId: cleanText(record.sourceRollId),
      splitRecordId: cleanText(record.splitRecordId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      unit: cleanText(record.unit),
      unitPrice: Number(record.unitPrice) || 0,
      allocatedWeightKg: Number(record.allocatedWeightKg) || 0,
      allocatedQuantity: Number(record.allocatedQuantity) || 0,
      allocatedCostAmount: Number(record.allocatedCostAmount) || 0,
      productionTaskId: cleanText(record.productionTaskId),
      orderLineId: cleanText(record.orderLineId),
      productionTaskMachineId: cleanText(record.productionTaskMachineId),
      productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
      allocationBasis: cleanText(record.allocationBasis),
      allocationStatus: cleanText(record.allocationStatus) || "草稿/待成本复核",
      costEffect: cleanText(record.costEffect) || "draft_only",
      marginEffect: cleanText(record.marginEffect) || "none",
      lossCalibrationStatus: cleanText(record.lossCalibrationStatus) || "待损耗校准",
      generatedBy: cleanText(record.generatedBy),
      generatedByUserId: cleanText(record.generatedByUserId),
      generatedAt: cleanText(record.generatedAt),
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      confirmedBy: cleanText(record.confirmedBy),
      confirmedByUserId: cleanText(record.confirmedByUserId),
      confirmedAt: cleanText(record.confirmedAt),
      costConfirmationId: cleanText(record.costConfirmationId),
      reviewNote: cleanText(record.reviewNote),
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibratedCostAmount: Number(record.calibratedCostAmount) || 0,
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.costAllocationDraftId && record.consumptionRecordId && record.issueRecordId);
}

function normalizeRawMaterialCostAllocationConfirmations(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      costConfirmationId: cleanText(record.costConfirmationId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds)
        ? record.costAllocationDraftIds.map(cleanText).filter(Boolean)
        : [],
      consumptionRecordIds: Array.isArray(record.consumptionRecordIds)
        ? record.consumptionRecordIds.map(cleanText).filter(Boolean)
        : [],
      issueRecordIds: Array.isArray(record.issueRecordIds)
        ? record.issueRecordIds.map(cleanText).filter(Boolean)
        : [],
      productionTaskIds: Array.isArray(record.productionTaskIds)
        ? record.productionTaskIds.map(cleanText).filter(Boolean)
        : [],
      orderLineIds: Array.isArray(record.orderLineIds)
        ? record.orderLineIds.map(cleanText).filter(Boolean)
        : [],
      confirmedCount: Number(record.confirmedCount) || 0,
      confirmedWeightKg: Number(record.confirmedWeightKg) || 0,
      confirmedQuantity: Number(record.confirmedQuantity) || 0,
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已复核/待损耗校准",
      costEffect: cleanText(record.costEffect) || "confirmed_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "none",
      lossCalibrationStatus: cleanText(record.lossCalibrationStatus) || "待损耗校准",
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      confirmedBy: cleanText(record.confirmedBy),
      confirmedByUserId: cleanText(record.confirmedByUserId),
      confirmedAt: cleanText(record.confirmedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.costConfirmationId);
}

function normalizeRawMaterialCostLossCalibrations(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      lossCalibrationId: cleanText(record.lossCalibrationId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      costConfirmationId: cleanText(record.costConfirmationId),
      costConfirmationIds: Array.isArray(record.costConfirmationIds)
        ? record.costConfirmationIds.map(cleanText).filter(Boolean)
        : [],
      costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds)
        ? record.costAllocationDraftIds.map(cleanText).filter(Boolean)
        : [],
      consumptionRecordIds: Array.isArray(record.consumptionRecordIds)
        ? record.consumptionRecordIds.map(cleanText).filter(Boolean)
        : [],
      issueRecordIds: Array.isArray(record.issueRecordIds)
        ? record.issueRecordIds.map(cleanText).filter(Boolean)
        : [],
      productionTaskIds: Array.isArray(record.productionTaskIds)
        ? record.productionTaskIds.map(cleanText).filter(Boolean)
        : [],
      orderLineIds: Array.isArray(record.orderLineIds)
        ? record.orderLineIds.map(cleanText).filter(Boolean)
        : [],
      confirmedCount: Number(record.confirmedCount) || 0,
      confirmedWeightKg: Number(record.confirmedWeightKg) || 0,
      confirmedQuantity: Number(record.confirmedQuantity) || 0,
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      expectedOutputQuantity: Number(record.expectedOutputQuantity) || 0,
      actualQualifiedOutputQuantity: Number(record.actualQualifiedOutputQuantity) || 0,
      lossQuantity: Number(record.lossQuantity) || 0,
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibrationBasis: cleanText(record.calibrationBasis),
      calibrationStatus: cleanText(record.calibrationStatus) || "已校准/待毛利确认",
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "pending_margin_snapshot",
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.lossCalibrationId);
}

function normalizeRawMaterialOrderMarginSnapshots(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      marginSnapshotId: cleanText(record.marginSnapshotId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      lossCalibrationIds: Array.isArray(record.lossCalibrationIds)
        ? record.lossCalibrationIds.map(cleanText).filter(Boolean)
        : [],
      costConfirmationIds: Array.isArray(record.costConfirmationIds)
        ? record.costConfirmationIds.map(cleanText).filter(Boolean)
        : [],
      costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds)
        ? record.costAllocationDraftIds.map(cleanText).filter(Boolean)
        : [],
      consumptionRecordIds: Array.isArray(record.consumptionRecordIds)
        ? record.consumptionRecordIds.map(cleanText).filter(Boolean)
        : [],
      issueRecordIds: Array.isArray(record.issueRecordIds)
        ? record.issueRecordIds.map(cleanText).filter(Boolean)
        : [],
      productionTaskIds: Array.isArray(record.productionTaskIds)
        ? record.productionTaskIds.map(cleanText).filter(Boolean)
        : [],
      orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
      lineItems: Array.isArray(record.lineItems)
        ? record.lineItems.map((line) => ({
            ...line,
            orderLineId: cleanText(line.orderLineId),
            orderNo: cleanText(line.orderNo),
            customerId: cleanText(line.customerId),
            customerName: cleanText(line.customerName),
            productName: cleanText(line.productName),
            goodsSpec: cleanText(line.goodsSpec),
            quantity: Number(line.quantity) || 0,
            salesAmount: Number(line.salesAmount) || 0,
            materialCostAmount: Number(line.materialCostAmount) || 0,
            grossProfitAmount: Number(line.grossProfitAmount) || 0,
            grossMarginRatePercent: Number(line.grossMarginRatePercent) || 0,
            marginStatus: cleanText(line.marginStatus) || "已生成/待财务复核",
            marginSnapshotId: cleanText(line.marginSnapshotId),
            costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds)
              ? line.costAllocationDraftIds.map(cleanText).filter(Boolean)
              : [],
            productionTaskIds: Array.isArray(line.productionTaskIds)
              ? line.productionTaskIds.map(cleanText).filter(Boolean)
              : [],
          })).filter((line) => line.orderLineId)
        : [],
      totalSalesAmount: Number(record.totalSalesAmount) || 0,
      totalMaterialCostAmount: Number(record.totalMaterialCostAmount) || 0,
      grossProfitAmount: Number(record.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(record.grossMarginRatePercent) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已生成/待财务复核",
      reportStatus: cleanText(record.reportStatus),
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "margin_snapshot_pending_review",
      marginReportId: cleanText(record.marginReportId),
      generatedBy: cleanText(record.generatedBy),
      generatedByUserId: cleanText(record.generatedByUserId),
      generatedAt: cleanText(record.generatedAt),
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      reviewedAt: cleanText(record.reviewedAt),
      note: cleanText(record.note),
      warnings: normalizeRawMaterialCostAllocationWarnings(record.warnings),
    }))
    .filter((record) => record.marginSnapshotId);
}

function normalizeRawMaterialOrderMarginReports(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      marginReportId: cleanText(record.marginReportId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      marginSnapshotIds: Array.isArray(record.marginSnapshotIds)
        ? record.marginSnapshotIds.map(cleanText).filter(Boolean)
        : [],
      lossCalibrationIds: Array.isArray(record.lossCalibrationIds)
        ? record.lossCalibrationIds.map(cleanText).filter(Boolean)
        : [],
      costConfirmationIds: Array.isArray(record.costConfirmationIds)
        ? record.costConfirmationIds.map(cleanText).filter(Boolean)
        : [],
      costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds)
        ? record.costAllocationDraftIds.map(cleanText).filter(Boolean)
        : [],
      consumptionRecordIds: Array.isArray(record.consumptionRecordIds)
        ? record.consumptionRecordIds.map(cleanText).filter(Boolean)
        : [],
      issueRecordIds: Array.isArray(record.issueRecordIds)
        ? record.issueRecordIds.map(cleanText).filter(Boolean)
        : [],
      productionTaskIds: Array.isArray(record.productionTaskIds)
        ? record.productionTaskIds.map(cleanText).filter(Boolean)
        : [],
      orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
      lineItems: Array.isArray(record.lineItems)
        ? record.lineItems.map((line) => ({
            ...line,
            marginSnapshotId: cleanText(line.marginSnapshotId),
            orderLineId: cleanText(line.orderLineId),
            orderNo: cleanText(line.orderNo),
            customerId: cleanText(line.customerId),
            customerName: cleanText(line.customerName),
            productName: cleanText(line.productName),
            goodsSpec: cleanText(line.goodsSpec),
            quantity: Number(line.quantity) || 0,
            salesAmount: Number(line.salesAmount) || 0,
            materialCostAmount: Number(line.materialCostAmount) || 0,
            grossProfitAmount: Number(line.grossProfitAmount) || 0,
            grossMarginRatePercent: Number(line.grossMarginRatePercent) || 0,
            marginStatus: cleanText(line.marginStatus) || "已财务复核/报表可用",
            costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds)
              ? line.costAllocationDraftIds.map(cleanText).filter(Boolean)
              : [],
            productionTaskIds: Array.isArray(line.productionTaskIds)
              ? line.productionTaskIds.map(cleanText).filter(Boolean)
              : [],
          })).filter((line) => line.orderLineId)
        : [],
      totalSalesAmount: Number(record.totalSalesAmount) || 0,
      totalMaterialCostAmount: Number(record.totalMaterialCostAmount) || 0,
      grossProfitAmount: Number(record.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(record.grossMarginRatePercent) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已财务复核/报表可用",
      reportStatus: cleanText(record.reportStatus) || "已生成内部毛利报表",
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "reviewed_margin_report_snapshot",
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      reviewedAt: cleanText(record.reviewedAt),
      note: cleanText(record.note),
      warnings: normalizeRawMaterialCostAllocationWarnings(record.warnings),
    }))
    .filter((record) => record.marginReportId);
}

function normalizeRawMaterialCostAllocationWarnings(warnings = []) {
  return Array.isArray(warnings) ? warnings.map(cleanText).filter(Boolean) : [];
}

function normalizeQuery(query) {
  return {
    keyword: cleanText(getQueryValue(query, "keyword")),
    status: cleanText(getQueryValue(query, "status")),
    page: Number(getQueryValue(query, "page") || 1),
    pageSize: Number(getQueryValue(query, "pageSize") || 50),
  };
}

function getQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return query.get(key) ?? "";
  return query[key] ?? "";
}

function compareDateDesc(left, right) {
  return (Date.parse(right) || 0) - (Date.parse(left) || 0);
}

function loadPersistentRawMaterialInboundState(storageRoot, seedInbounds = []) {
  const filePath = getRawMaterialInboundFilePath(storageRoot);
  if (!existsSync(filePath)) {
    const seeded = normalizeRawMaterialInbounds(seedInbounds);
    persistRawMaterialInboundState(storageRoot, seeded);
    return { rawMaterialInbounds: seeded };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const persisted = normalizeRawMaterialInbounds(parsed.rawMaterialInbounds ?? parsed.items ?? []);
    return { rawMaterialInbounds: persisted };
  } catch {
    const seeded = normalizeRawMaterialInbounds(seedInbounds);
    return { rawMaterialInbounds: seeded };
  }
}

function persistRawMaterialInboundState(storageRoot, rawMaterialInbounds = []) {
  const filePath = getRawMaterialInboundFilePath(storageRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        rawMaterialInbounds: normalizeRawMaterialInbounds(rawMaterialInbounds),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function getRawMaterialInboundFilePath(storageRoot) {
  return join(storageRoot, rawMaterialInboundStoreKey);
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR || join(process.cwd(), ".erp-local-storage");
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
