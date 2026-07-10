import assert from "node:assert/strict";
import {
  buildUpsertDriverDeliveryDispatchTransactionQuery,
  buildUpsertDriverDeliveryDispatchTransactionSql,
  createLocalDriverDeliveryDispatchRepository,
  createPostgresDriverDeliveryDispatchRepository,
  normalizeDriverDeliveryDispatchRecord,
  normalizeDriverDeliveryDispatchTransactionResult,
} from "../server/driverDeliveryDispatchRepository.mjs";

const workspace = {
  driverDeliveryDispatches: [],
  operationLogs: [],
};
const dispatch = {
  dispatchId: "DDIS-F010",
  fulfillmentId: "F010",
  driverId: "U-DRIVER-A",
  routeDate: "2026-07-02",
  routeNo: "虎门线-A",
  routeSequence: 3,
  dispatchStatus: "已派单",
  plannedDepartureAt: "2026-07-02T08:30:00.000Z",
  assignedBy: "U-OFFICE-A",
  assignedAt: "2026-07-02T08:00:00.000Z",
  remark: "O'Brien 先送客户仓",
};
const operationLog = {
  id: "LOG-DISPATCH-001",
  targetType: "fulfillment",
  targetId: "F010",
  action: "update_driver_dispatch",
  before: null,
  after: { dispatch },
  reason: "O'Brien 先送客户仓",
  operatorId: "U-OFFICE-A",
  pageKey: "api",
  occurredAt: "2026-07-02T08:00:01.000Z",
  createdAt: "2026-07-02T08:00:01.000Z",
};

const localRepository = createLocalDriverDeliveryDispatchRepository();
const localResult = await localRepository.upsertDriverDeliveryDispatch({ workspace, dispatch, operationLog });
assert.equal(localRepository.kind, "local_memory");
assert.equal(localResult.dispatch.routeNo, "虎门线-A");
assert.equal(localResult.dispatch.stopSequence, 3);
assert.equal(localResult.operationLogId, "LOG-DISPATCH-001");
assert.equal(workspace.driverDeliveryDispatches.length, 1);
assert.equal(workspace.operationLogs.length, 1);

await localRepository.upsertDriverDeliveryDispatch({
  workspace,
  dispatch: {
    ...dispatch,
    routeSequence: 4,
    stopSequence: 4,
    remark: "改为第 4 站",
  },
  operationLog: {
    ...operationLog,
    id: "LOG-DISPATCH-002",
  },
});
assert.equal(workspace.driverDeliveryDispatches.length, 1, "same dispatch id should be updated, not duplicated");
assert.equal(workspace.driverDeliveryDispatches[0].routeSequence, 4);
assert.equal(workspace.operationLogs.length, 2);

const normalized = normalizeDriverDeliveryDispatchRecord({
  id: "DDIS-PG-001",
  biz_no: "DDIS-PG-001",
  fulfillment_id: "F-PG-001",
  driver_id: "U-DRIVER-A",
  route_date: "2026-07-03",
  route_batch_no: "南山线-B",
  stop_sequence: 5,
  dispatch_status: "已派单",
  planned_departure_at: "2026-07-03 09:00:00+00",
  assigned_by: "U-OFFICE-A",
  assigned_at: "2026-07-03 08:00:00+00",
  remark: "二次派单",
});
assert.equal(normalized.dispatchId, "DDIS-PG-001");
assert.equal(normalized.routeNo, "南山线-B");
assert.equal(normalized.routeSequence, 5);

const normalizedResult = normalizeDriverDeliveryDispatchTransactionResult({
  dispatch: normalized,
  operationLogId: "LOG-PG-001",
});
assert.equal(normalizedResult.dispatch.fulfillmentId, "F-PG-001");
assert.equal(normalizedResult.operationLogId, "LOG-PG-001");

const postgresCalls = [];
const postgresRepository = createPostgresDriverDeliveryDispatchRepository({
  queryJson(text, values) {
    postgresCalls.push({ text, values });
    return {
      dispatch: normalized,
      operationLogId: "LOG-PG-001",
    };
  },
});
const postgresResult = await postgresRepository.upsertDriverDeliveryDispatch({
  workspace,
  dispatch: normalized,
  operationLog: {
    ...operationLog,
    id: "LOG-PG-001",
    targetId: "F-PG-001",
  },
});
assert.equal(postgresRepository.kind, "postgres");
assert.equal(postgresResult.dispatch.routeNo, "南山线-B");
assert.equal(postgresCalls.length, 1);

const sql = buildUpsertDriverDeliveryDispatchTransactionSql({ dispatch, operationLog });
assert.match(sql, /INSERT INTO driver_delivery_dispatches/);
assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET/);
assert.match(sql, /INSERT INTO operation_logs/);
assert.match(sql, /\$5::text::date/);
assert.match(sql, /\$9::timestamptz/);
assert.match(sql, /\$19::jsonb/);
assert.ok(!sql.includes("O'Brien 先送客户仓"));
assert.match(sql, /COMMIT;/);
const builtQuery = buildUpsertDriverDeliveryDispatchTransactionQuery({ dispatch, operationLog });
assert.deepEqual(builtQuery.values.slice(0, 12), [
  "DDIS-F010",
  "DDIS-F010",
  "F010",
  "U-DRIVER-A",
  "2026-07-02",
  "虎门线-A",
  3,
  "已派单",
  "2026-07-02T08:30:00.000Z",
  "U-OFFICE-A",
  "2026-07-02T08:00:00.000Z",
  "O'Brien 先送客户仓",
]);
assert.equal(typeof builtQuery.values[12], "string");
assert.equal(typeof builtQuery.values[13], "string");
assert.deepEqual(builtQuery.values.slice(14), [
  "LOG-DISPATCH-001",
  "fulfillment",
  "F010",
  "update_driver_dispatch",
  "{}",
  JSON.stringify({ dispatch }),
  "O'Brien 先送客户仓",
  "U-OFFICE-A",
  "api",
  "2026-07-02T08:00:01.000Z",
  "2026-07-02T08:00:01.000Z",
]);
assert.deepEqual(postgresCalls[0].values.slice(0, 3), ["DDIS-PG-001", "DDIS-PG-001", "F-PG-001"]);

console.log("Driver delivery dispatch repository check passed.");
