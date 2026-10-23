import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildListPrinterDeviceFieldTestsQuery,
  buildListPrinterDeviceFieldTestsSql,
  buildRecordPrinterDeviceFieldTestTransactionQuery,
  buildRecordPrinterDeviceFieldTestTransactionSql,
  createLocalPrinterDeviceFieldTestRepository,
  createPostgresPrinterDeviceFieldTestRepository,
  normalizePrinterDeviceFieldTestRecord,
  filterPrinterDeviceFieldTests,
} from "../server/printerDeviceFieldTestRepository.mjs";

const record = {
  recordId: "PDQA-CHECK-PRN-LABEL-A",
  printDeviceId: "PRN-LABEL-A",
  printJobId: "PJ-CHECK-1",
  documentType: "express_ltl_label",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  checkedAt: "2026-07-02T11:15:00.000Z",
  deviceLabel: "标签机A",
  driverLabel: "Generic 203dpi Label",
  paperLabel: "80x60 热敏标签",
  summary: { label: "通过 4/6，异常 1", passedCount: 4, issueCount: 1 },
  checks: [
    { key: "sample_print", status: "passed" },
    { key: "paper_alignment", status: "passed" },
    { key: "barcode_scan", status: "failed" },
    { key: "driver_callback", status: "passed" },
  ],
  evidence: {
    samplePrintReference: "PJ-CHECK-1 样张已出纸",
    barcodeScanText: "F001-PKG-1",
    driverCallbackStatus: "spool sent",
    voidReprintReference: "",
    operatorAcceptance: "办公室A 待复测后签认",
  },
  note: "条码扫码受浓度影响，已记录待复测",
};

const operationLog = {
  id: "LOG-PDQA-CHECK-001",
  targetType: "print_device",
  targetId: "PRN-LABEL-A",
  action: "record_printer_device_field_test",
  before: null,
  after: record,
  reason: record.summary.label,
  operatorId: "U-OFFICE-A",
  pageKey: "api",
  occurredAt: "2026-07-02T11:15:01.000Z",
  createdAt: "2026-07-02T11:15:01.000Z",
};

checkLocalPrinterDeviceFieldTestRepository();
await checkPostgresPrinterDeviceFieldTestSqlBoundary();

console.log(
  "Printer device field-test repository check passed: local JSON persistence and PostgreSQL transaction/list SQL are covered.",
);

function checkLocalPrinterDeviceFieldTestRepository() {
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-printer-device-field-test-check-"));
  try {
    const repository = createLocalPrinterDeviceFieldTestRepository({ storageRoot });
    const workspace = {
      printerDeviceFieldTests: repository.loadState().printerDeviceFieldTests,
      printDevices: [{ printDeviceId: "PRN-LABEL-A", name: "标签机A" }],
      operationLogs: [],
    };

    const result = repository.recordPrinterDeviceFieldTest({ workspace, record, operationLog });

    assert.equal(repository.kind, "local_json");
    assert.equal(result.record.recordId, "PDQA-CHECK-PRN-LABEL-A");
    assert.equal(result.operationLogId, "LOG-PDQA-CHECK-001");
    assert.equal(workspace.printerDeviceFieldTests.length, 1);
    assert.equal(workspace.printerDeviceFieldTests[0].summary.label, "通过 4/6，异常 1");
    assert.equal(workspace.printerDeviceFieldTests[0].summary.evidenceSummary.missingCount, 1);
    assert.equal(workspace.printerDeviceFieldTests[0].evidence.barcodeScanText, "F001-PKG-1");
    assert.equal(workspace.printDevices[0].latestFieldTestRecord.recordId, "PDQA-CHECK-PRN-LABEL-A");
    assert.equal(workspace.operationLogs[0].action, "record_printer_device_field_test");

    const listed = repository.listPrinterDeviceFieldTests({
      workspace,
      filters: { printDeviceId: "PRN-LABEL-A", documentType: "express_ltl_label" },
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].recordId, "PDQA-CHECK-PRN-LABEL-A");

    const storePath = join(storageRoot, "metadata", "printer-device-field-tests.json");
    assert.equal(existsSync(storePath), true);
    const savedJson = JSON.parse(readFileSync(storePath, "utf8"));
    assert.equal(savedJson.printerDeviceFieldTests[0].printJobId, "PJ-CHECK-1");
    assert.equal(savedJson.printerDeviceFieldTests[0].evidence.samplePrintReference, "PJ-CHECK-1 样张已出纸");

    const reloadedState = createLocalPrinterDeviceFieldTestRepository({ storageRoot }).loadState();
    assert.equal(reloadedState.printerDeviceFieldTests[0].paperLabel, "80x60 热敏标签");
    const beforeDuplicate=structuredClone(workspace);
    const fileBeforeDuplicate=readFileSync(storePath,'utf8');
    for (const targetWorkspace of [workspace,{...workspace,printerDeviceFieldTests:[]}]) {
      assert.throws(()=>repository.recordPrinterDeviceFieldTest({workspace:targetWorkspace,
        record:{...record,note:'Attempted overwrite'},operationLog:{...operationLog,id:'LOG-OVERWRITE'}}),
        {code:'PRINTER_DEVICE_FIELD_TEST_RECORD_EXISTS',statusCode:409});
    }
    assert.deepEqual(workspace,beforeDuplicate);
    assert.equal(readFileSync(storePath,'utf8'),fileBeforeDuplicate);

    assert.equal(reloadedState.printerDeviceFieldTests[0].summary.evidenceSummary.missingCount, 1);
    const staleWorkspace={...workspace,printerDeviceFieldTests:[]};
    repository.recordPrinterDeviceFieldTest({workspace:staleWorkspace,record:{...record,recordId:'SECOND-RECORD'},operationLog:{...operationLog,id:'LOG-SECOND'}});
    assert.deepEqual(new Set(repository.loadState().printerDeviceFieldTests.map(item=>item.recordId)),new Set([record.recordId,'SECOND-RECORD']));
    const preserved=readFileSync(storePath,'utf8');
    for (const damaged of ['{broken',JSON.stringify({printerDeviceFieldTests:null}),JSON.stringify({printerDeviceFieldTests:[{}]})]) {
      writeFileSync(storePath,damaged);
      const before=structuredClone(staleWorkspace);
      assert.throws(()=>repository.loadState(),{code:'PRINTER_DEVICE_FIELD_TEST_STORE_UNREADABLE'});
      assert.throws(()=>repository.recordPrinterDeviceFieldTest({workspace:staleWorkspace,record:{...record,recordId:'THIRD-RECORD'},operationLog}),{code:'PRINTER_DEVICE_FIELD_TEST_STORE_UNREADABLE'});
      assert.deepEqual(staleWorkspace,before);
      assert.equal(readFileSync(storePath,'utf8'),damaged);
    }
    writeFileSync(storePath,preserved);

  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
}

async function checkPostgresPrinterDeviceFieldTestSqlBoundary() {
  const calls = [];
  const idempotentCalls = [];
  const repository = createPostgresPrinterDeviceFieldTestRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      return [record];
    },
    idempotentTransactionJson(request) {
      idempotentCalls.push(request);
      return { record, operationLogId: operationLog.id };
    },
  });
  const workspace = {
    printerDeviceFieldTests: [],
    printDevices: [{ printDeviceId: "PRN-LABEL-A", name: "标签机A" }],
    operationLogs: [],
  };

  const transaction = await repository.recordPrinterDeviceFieldTest({
    workspace,
    record,
    operationLog,
    idempotencyKey: "printer-qa-check-001",
    idempotencyPayload: { recordId: record.recordId, checks: record.checks },
  });
  const listed = await repository.listPrinterDeviceFieldTests({
    filters: { printDeviceId: "PRN-LABEL-A", printJobId: "PJ-CHECK-1", documentType: "express_ltl_label" },
  });

  assert.equal(repository.kind, "postgres");
  assert.equal(transaction.record.recordId, "PDQA-CHECK-PRN-LABEL-A");
  assert.equal(transaction.operationLogId, "LOG-PDQA-CHECK-001");
  assert.equal(listed.length, 1);
  assert.equal(workspace.printerDeviceFieldTests.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  assert.equal(idempotentCalls.length, 1);
  assert.equal(idempotentCalls[0].scope, "print.device.field_test");
  assert.equal(idempotentCalls[0].idempotencyKey, "printer-qa-check-001");
  assert.equal(idempotentCalls[0].targetType, "print_device");
  assert.equal(idempotentCalls[0].targetId, "PRN-LABEL-A");
  assert.ok(idempotentCalls[0].resourceLocks.includes("print-device:PRN-LABEL-A"));
  assert.ok(idempotentCalls[0].resourceLocks.includes("printer-device-field-test:PDQA-CHECK-PRN-LABEL-A"));

  const createQuery = idempotentCalls[0];
  assert.match(createQuery.text, /^BEGIN;/);
  assert.match(createQuery.text, /INSERT INTO operation_logs/);
  assert.match(createQuery.text, /INSERT INTO printer_device_field_tests/);
  assert.match(createQuery.text, /ON CONFLICT \(id\) DO UPDATE SET/);
  const recordSql=createQuery.text.slice(createQuery.text.indexOf('INSERT INTO printer_device_field_tests'));
  assert.match(recordSql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(recordSql,/DO UPDATE SET/);
  assert.match(recordSql,/ERP_PRINTER_FIELD_TEST_RECORD_CONFLICT/);

  assert.match(createQuery.text, /checks_json/);
  assert.match(createQuery.text, /summary_json/);
  assert.match(createQuery.text, /\$23::jsonb/);
  assert.match(createQuery.text, /\$24::jsonb/);
  assert.ok(!createQuery.text.includes("samplePrintReference"));
  assert.ok(!createQuery.text.includes("条码扫码受浓度影响"));
  assert.match(createQuery.text, /COMMIT;/);

  const listQuery = calls[0];
  assert.match(listQuery.text, /FROM printer_device_field_tests/);
  assert.match(listQuery.text, /printer_device_id = \$1::text/);
  assert.match(listQuery.text, /print_job_id = \$2::text/);
  assert.deepEqual(listQuery.values, ["PRN-LABEL-A", "PJ-CHECK-1", "express_ltl_label", 200]);

  const newerRecord={...workspace.printerDeviceFieldTests[0],recordId:'QA-NEWER',checkedAt:'2026-07-03T00:00:00Z',summary:{label:'New evidence'}};
  workspace.printerDeviceFieldTests.push(newerRecord);
  workspace.printDevices[0]={...workspace.printDevices[0],latestFieldTestRecord:newerRecord,latestFieldTestSummary:newerRecord.summary,latestFieldTestCheckedAt:newerRecord.checkedAt};
  const deviceBeforeReplay=structuredClone(workspace.printDevices[0]);
  const logsBeforeReplay=structuredClone(workspace.operationLogs);
  const replay=await repository.recordPrinterDeviceFieldTest({workspace,record,
    operationLog:{...operationLog,id:'LOG-UNSAVED-RETRY'},idempotencyKey:'printer-qa-check-001',
    idempotencyPayload:{recordId:record.recordId,checks:record.checks}});
  assert.equal(replay.operationLogId,operationLog.id);
  assert.deepEqual(workspace.operationLogs,logsBeforeReplay);
  assert.deepEqual(workspace.printDevices[0],deviceBeforeReplay,"Historical replay must preserve newest device evidence");

  const normalized = normalizePrinterDeviceFieldTestRecord({
    id: "PDQA-NORMALIZED",
    printer_device_id: "PRN-DOT-A",
    print_job_id: "PJ-DOT-1",
    document_type: "pickup_note",
    operator_id: "U-OFFICE-A",
    operator_name: "办公室A",
    checked_at: "2026-07-02T12:00:00.000Z",
    checks_json: [{ key: "sample_print", status: "passed" }],
    summary_json: { label: "通过 1/6，未测 5" },
  });
  assert.equal(normalized.recordId, "PDQA-NORMALIZED");
  assert.equal(normalized.printDeviceId, "PRN-DOT-A");
  assert.equal(normalized.documentType, "pickup_note");
  assert.equal(normalized.checks[0].key, "sample_print");
  assert.equal(normalized.summary.evidenceSummary.missingCount, 5);

  const directCreateSql = buildRecordPrinterDeviceFieldTestTransactionSql({ record, operationLog });
  assert.match(directCreateSql, /printer_device_field_tests/);
  assert.ok(!directCreateSql.includes("LOG-PDQA-CHECK-001"));
  const directCreateQuery = buildRecordPrinterDeviceFieldTestTransactionQuery({ record, operationLog });
  assert.deepEqual(directCreateQuery.values.slice(0, 11), [
    "LOG-PDQA-CHECK-001",
    "print_device",
    "PRN-LABEL-A",
    "record_printer_device_field_test",
    "{}",
    JSON.stringify(record),
    "通过 4/6，异常 1",
    "U-OFFICE-A",
    "api",
    "2026-07-02T11:15:01.000Z",
    "2026-07-02T11:15:01.000Z",
  ]);

  const directListSql = buildListPrinterDeviceFieldTestsSql({ printDeviceId: "PRN-LABEL-A", limit: 10 });
  assert.match(directListSql, /LIMIT \$2::integer/);
  assert.ok(!directListSql.includes("PRN-LABEL-A"));
  assert.deepEqual(buildListPrinterDeviceFieldTestsQuery({ printDeviceId: "PRN-LABEL-A", limit: 10 }).values, [
    "PRN-LABEL-A",
    10,
  ]);

  assert.throws(
    () => buildRecordPrinterDeviceFieldTestTransactionSql({ record: null, operationLog }),
    /Printer device field-test record and operation log are required/,
  );
}

const sortedTimes=filterPrinterDeviceFieldTests([
 {...record,recordId:'EARLIER',checkedAt:'2026-09-06T09:00:00+08:00'},
 {...record,recordId:'LATER',checkedAt:'2026-09-06T02:00:00Z'},
]);
assert.deepEqual(sortedTimes.map(row=>row.recordId),['LATER','EARLIER']);
