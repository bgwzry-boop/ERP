import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildPostgresIdempotencyRequest,
  readPostgresIdempotencyReplay,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";
import {
  buildRawMaterialActionIdempotencyScope,
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
import {
  normalizeOperationLog,
  normalizeRawMaterialInbound,
  normalizeRawMaterialInboundActionResult,
  normalizeRawMaterialInbounds,
} from "./rawMaterialInboundRecordService.mjs";
import { findRawMaterialInbound } from "./services/rawMaterialInboundCommandService.mjs";
import { resolveStoreMode } from "./storeMode.mjs";

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

export function createRawMaterialInboundRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_RAW_MATERIAL_INBOUND_STORE", "ERP_RAW_MATERIAL_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
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

    applyInboundAction(input = {}) {
      const replay = readLocalRawMaterialActionReplay(input);
      if (replay) return replay;
      const { workspace, inboundId } = input;
      const result = requireInboundDecision(input)({ workspace, inbounds: workspace?.rawMaterialInbounds });
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

    async applyInboundAction(input = {}) {
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
      const result = requireInboundDecision(input)({
        workspace: input.workspace,
        inbounds: input.workspace?.rawMaterialInbounds,
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

function requireInboundDecision(input) {
  if (typeof input.decide !== "function") {
    throw new TypeError("Raw material inbound action requires a service decision.");
  }
  return input.decide;
}
