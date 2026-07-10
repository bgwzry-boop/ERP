import assert from "node:assert/strict";
import {
  buildRecordDriverDeviceFieldTestTransactionQuery,
  buildRecordDriverDeviceFieldTestTransactionSql,
  createLocalDriverDeviceFieldTestRepository,
  createPostgresDriverDeviceFieldTestRepository,
  normalizeDriverDeviceFieldTestRecord,
} from "../server/driverDeviceFieldTestRepository.mjs";

const record = {
  recordId: "DQA-CHECK-F002",
  fulfillmentId: "F002",
  orderLineId: "ORD-0629-002-01",
  driverId: "U-DRIVER-A",
  operatorId: "U-DRIVER-A",
  operatorName: "司机A",
  checkedAt: "2026-07-02T10:15:00.000Z",
  deviceLabel: "iPhone 15 Pro",
  browserLabel: "Safari 17",
  userAgent: "Mozilla/5.0 Safari/604.1",
  language: "zh-CN",
  summary: { label: "通过 2/6，异常 2", passedCount: 2, issueCount: 2 },
  checks: [
    { key: "camera_permission", status: "passed" },
    { key: "watermark_photo", status: "passed" },
    { key: "package_label_scan", status: "failed" },
    { key: "geolocation", status: "blocked" },
  ],
  packageLabelScanSample: {
    sampleId: "DPLS-CHECK-F002-PKG-1",
    fulfillmentId: "F002",
    expectedPackageId: "PKG-F002-1",
    scannedText: "LABEL:PKG-F002-1",
    matchedPackageId: "PKG-F002-1",
    method: "scanner_wedge",
    methodLabel: "扫码枪/键盘口",
    result: "matched",
    resultLabel: "已匹配",
    tone: "success",
    message: "第 1/3 包已核对",
    checkedAt: "2026-07-02T10:14:59.000Z",
  },
  nativeBridgeDiagnostics: {
    items: [
      {
        key: "native_package_scan",
        label: "原生扫码",
        target: "包裹标签",
        supported: false,
        statusLabel: "未接入",
        tone: "warning",
        bridgeType: "",
        bridgeTypeLabel: "未发现",
        version: "p0-driver-native-bridge-v1",
      },
      {
        key: "native_navigation",
        label: "原生导航",
        target: "地图打开",
        supported: false,
        statusLabel: "未接入",
        tone: "warning",
        bridgeType: "",
        bridgeTypeLabel: "未发现",
        version: "p0-driver-native-navigation-bridge-v1",
      },
    ],
    total: 2,
    supportedCount: 0,
    issueCount: 2,
    tone: "warning",
    label: "原生 0/2",
    message: "普通浏览器未接原生壳。",
  },
  note: "扫码受光线影响，定位受限",
};

const operationLog = {
  id: "LOG-DQA-CHECK-001",
  targetType: "fulfillment",
  targetId: "F002",
  action: "driver_record_device_field_test",
  before: null,
  after: record,
  reason: record.summary.label,
  operatorId: "U-DRIVER-A",
  pageKey: "api",
  occurredAt: "2026-07-02T10:15:01.000Z",
  createdAt: "2026-07-02T10:15:01.000Z",
};

const workspace = {
  fulfillments: [
    {
      id: "F002",
      method: "送货",
      status: "待送货",
      qty: 1200,
    },
  ],
  operationLogs: [],
};

const localRepository = createLocalDriverDeviceFieldTestRepository();
const localResult = await localRepository.recordDriverDeviceFieldTest({
  workspace,
  record,
  operationLog,
});

assert.equal(localRepository.kind, "local_memory");
assert.equal(localResult.record.recordId, "DQA-CHECK-F002");
assert.equal(localResult.operationLogId, "LOG-DQA-CHECK-001");
assert.equal(workspace.driverDeviceFieldTests.length, 1);
assert.equal(workspace.driverDeviceFieldTests[0].summary.label, "通过 2/6，异常 2");
assert.equal(workspace.driverDeviceFieldTests[0].packageLabelScanSample.matchedPackageId, "PKG-F002-1");
assert.equal(workspace.driverDeviceFieldTests[0].nativeBridgeDiagnostics.label, "原生 0/2");
assert.equal(workspace.fulfillments[0].deviceFieldTestRecord.recordId, "DQA-CHECK-F002");
assert.equal(workspace.fulfillments[0].deviceFieldTestRecord.packageLabelScanSample.method, "scanner_wedge");
assert.equal(workspace.fulfillments[0].deviceFieldTestRecord.nativeBridgeDiagnostics.items.length, 2);
assert.equal(workspace.fulfillments[0].deviceFieldTestSummary.label, "通过 2/6，异常 2");
assert.equal(workspace.operationLogs[0].action, "driver_record_device_field_test");

const normalized = normalizeDriverDeviceFieldTestRecord({
  id: "DQA-NORMALIZED",
  fulfillment_id: "F003",
  order_line_id: "OL003",
  driver_id: "U-DRIVER-A",
  operator_id: "U-DRIVER-A",
  operator_name: "司机A",
  checked_at: "2026-07-02T11:00:00.000Z",
  checks_json: [{ key: "navigation", status: "passed" }],
  summary_json: {
    label: "通过 1/6，异常 0",
    packageLabelScanSample: {
      sampleId: "DPLS-NORMALIZED",
      fulfillmentId: "F003",
      expectedPackageId: "PKG-F003-1",
      scannedText: "PKG-F003-1",
      matchedPackageId: "PKG-F003-1",
      method: "camera",
      result: "duplicate",
      checkedAt: "2026-07-02T10:59:59.000Z",
    },
    nativeBridgeDiagnostics: {
      items: [
        {
          key: "native_navigation",
          label: "原生导航",
          supported: true,
          statusLabel: "可用",
          bridgeTypeLabel: "JS bridge",
          version: "p0-driver-native-navigation-bridge-v1",
        },
      ],
      total: 1,
      supportedCount: 1,
      issueCount: 0,
      tone: "success",
      label: "原生能力可用",
    },
  },
});
assert.equal(normalized.recordId, "DQA-NORMALIZED");
assert.equal(normalized.fulfillmentId, "F003");
assert.equal(normalized.checks[0].key, "navigation");
assert.equal(normalized.summary.label, "通过 1/6，异常 0");
assert.equal(normalized.packageLabelScanSample.method, "camera");
assert.equal(normalized.packageLabelScanSample.matchedPackageId, "PKG-F003-1");
assert.equal(normalized.nativeBridgeDiagnostics.label, "原生能力可用");

const sql = buildRecordDriverDeviceFieldTestTransactionSql({ record, operationLog });
assert.match(sql, /BEGIN;/);
assert.match(sql, /INSERT INTO operation_logs/);
assert.match(sql, /INSERT INTO driver_device_field_tests/);
assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET/);
assert.match(sql, /checks_json/);
assert.match(sql, /summary_json/);
assert.match(sql, /\$24::jsonb/);
assert.match(sql, /\$25::jsonb/);
assert.ok(!sql.includes("DQA-CHECK-F002"));
assert.ok(!sql.includes("PKG-F002-1"));
assert.ok(!sql.includes("扫码受光线影响"));
assert.match(sql, /COMMIT;/);
const builtQuery = buildRecordDriverDeviceFieldTestTransactionQuery({ record, operationLog });
assert.deepEqual(builtQuery.values.slice(0, 11), [
  "LOG-DQA-CHECK-001",
  "fulfillment",
  "F002",
  "driver_record_device_field_test",
  "{}",
  JSON.stringify(record),
  "通过 2/6，异常 2",
  "U-DRIVER-A",
  "api",
  "2026-07-02T10:15:01.000Z",
  "2026-07-02T10:15:01.000Z",
]);
assert.deepEqual(builtQuery.values.slice(11, 23), [
  "DQA-CHECK-F002",
  "DQA-CHECK-F002",
  "F002",
  "ORD-0629-002-01",
  "U-DRIVER-A",
  "U-DRIVER-A",
  "司机A",
  "2026-07-02T10:15:00.000Z",
  "iPhone 15 Pro",
  "Safari 17",
  "Mozilla/5.0 Safari/604.1",
  "zh-CN",
]);
assert.equal(builtQuery.values[23], JSON.stringify(record.checks));
assert.match(builtQuery.values[24], /packageLabelScanSample/);
assert.match(builtQuery.values[24], /nativeBridgeDiagnostics/);
assert.equal(builtQuery.values[25], "扫码受光线影响，定位受限");

const calls = [];
const postgresRepository = createPostgresDriverDeviceFieldTestRepository({
  queryJson(text, values) {
    calls.push({ text, values });
    return { record, operationLogId: operationLog.id };
  },
});
const postgresResult = await postgresRepository.recordDriverDeviceFieldTest({
  workspace: { fulfillments: [], operationLogs: [] },
  record,
  operationLog,
});
assert.equal(postgresRepository.kind, "postgres");
assert.equal(postgresResult.record.recordId, "DQA-CHECK-F002");
assert.equal(postgresResult.operationLogId, "LOG-DQA-CHECK-001");
assert.equal(calls.length, 1);
assert.match(calls[0].text, /driver_device_field_tests/);
assert.equal(calls[0].values[0], "LOG-DQA-CHECK-001");

assert.throws(
  () => buildRecordDriverDeviceFieldTestTransactionSql({ record: null, operationLog }),
  /Driver device field-test record and operation log are required/,
);

console.log("Driver device field-test repository check passed: local mutation and PostgreSQL transaction SQL are covered.");
