import assert from "node:assert/strict";
import {
  canRevokeEmployeePassword,
  formatCompactDateTime,
  getEmployeePasswordStatusLabel,
  getEmployeeReviewRowTone,
  getMasterDataExecutionFailedRows,
  getMasterDataExecutionTone,
  getMasterDataFailedRowFields,
  getMasterDataFailedRowKey,
  getMasterDataPrecheckTone,
  hasCommittedMasterDataImportExecution,
  normalizeMasterDataFailedRowValues,
  upsertMasterDataEmployeeAccountReview,
  upsertMasterDataImportExecution,
  upsertMasterDataImportReviewDraft,
} from "../src/state/officeMasterDataState.js";

const failedRows = getMasterDataExecutionFailedRows({
  importPayload: {
    failedRows: [
      { sheetKey: " customers ", worksheetName: " 客户 ", rowNumber: "2", reason: " 名称缺失 ", values: { name: "", ignored: null } },
      { sheetKey: "inventory", rowNumber: 0, values: { size: "30*40" } },
    ],
  },
});
assert.deepEqual(failedRows, [{
  sheetKey: "customers",
  worksheetName: "客户",
  rowNumber: 2,
  reason: "名称缺失",
  values: { name: "", ignored: "" },
}]);
assert.equal(getMasterDataFailedRowKey(failedRows[0]), "customers|2");
assert.equal(getMasterDataFailedRowKey({ sheetKey: "customers", rowNumber: 0 }), "");
assert.deepEqual(normalizeMasterDataFailedRowValues({ " name ": 7, "": "ignored" }), { name: "7" });
assert.deepEqual(getMasterDataFailedRowFields(failedRows[0]), [{ field: "name", value: "" }, { field: "ignored", value: "" }]);

assert.equal(getMasterDataPrecheckTone("passed"), "passed");
assert.equal(getMasterDataPrecheckTone("unexpected"), "idle");
assert.equal(hasCommittedMasterDataImportExecution([{ planId: "PLAN-1", status: "committed" }], "PLAN-1"), true);
assert.equal(hasCommittedMasterDataImportExecution([{ planId: "PLAN-1", status: "review" }], "PLAN-1"), false);
assert.deepEqual(
  upsertMasterDataImportExecution([{ executionId: "EX-1" }], { executionId: "EX-1", status: "committed" }),
  [{ executionId: "EX-1", status: "committed" }],
);
assert.deepEqual(
  upsertMasterDataImportReviewDraft([{ draftId: "DR-1" }], { draftId: "DR-2" }),
  [{ draftId: "DR-2" }, { draftId: "DR-1" }],
);

const activeEmployee = { employeeId: "E-1", userId: "U-1", accountEnabled: true, passwordStatus: "active" };
assert.equal(getEmployeeReviewRowTone(activeEmployee), "committed");
assert.equal(getEmployeePasswordStatusLabel(activeEmployee), "正式密码已生效");
assert.equal(canRevokeEmployeePassword(activeEmployee), true);
assert.equal(canRevokeEmployeePassword({ ...activeEmployee, passwordStatus: "password_revoked" }), false);
assert.deepEqual(
  upsertMasterDataEmployeeAccountReview([{ employeeId: "E-1", userId: "U-OLD" }], activeEmployee),
  [activeEmployee],
);
assert.equal(formatCompactDateTime("2026-07-10T10:30:00Z"), "07-10 10:30");
assert.equal(getMasterDataExecutionTone("committed"), "committed");
assert.equal(getMasterDataExecutionTone("blocked_failed_rows_ready"), "blocked");
assert.equal(getMasterDataExecutionTone("blocked_permission"), "review");
assert.equal(getMasterDataExecutionTone("pending"), "pending");

console.log("office master-data state checks passed");
