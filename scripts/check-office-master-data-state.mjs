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
  mergeMasterDataEmployeeAccountReviews,
  normalizeMasterDataFailedRowValues,
  upsertMasterDataEmployeeAccountReview,
  upsertMasterDataImportExecution,
  upsertMasterDataImportReviewDraft,
} from "../src/state/officeMasterDataState.js";
import {
  buildMasterDataMaintenanceViewItems,
  filterMasterDataMaintenanceRecords,
  getMasterDataMaintenanceColumns,
  getMasterDataMaintenanceTableClass,
  getMasterDataSearchPlaceholder,
} from "../src/domain/masterDataMaintenanceListState.js";

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
const fullEmployeeReviews = Array.from({ length: 33 }, (_, index) => ({ employeeId: `E-${index + 1}`, accountEnabled: false }));
assert.equal(
  upsertMasterDataEmployeeAccountReview(fullEmployeeReviews, { employeeId: "E-2", accountEnabled: true }).length,
  33,
  "a single account update must not truncate the complete formal employee view",
);
const mergedEmployeeReviews = mergeMasterDataEmployeeAccountReviews(fullEmployeeReviews, [
  { employeeId: "E-2", accountEnabled: true },
  { employeeId: "E-34", accountEnabled: true },
]);
assert.equal(mergedEmployeeReviews.length, 34, "batch review merges must not truncate the formal employee list");
assert.equal(mergedEmployeeReviews.find((review) => review.employeeId === "E-2")?.accountEnabled, true);
assert.equal(formatCompactDateTime("2026-07-10T10:30:00Z"), "07-10 10:30");
assert.equal(getMasterDataExecutionTone("committed"), "committed");
assert.equal(getMasterDataExecutionTone("blocked_failed_rows_ready"), "blocked");
assert.equal(getMasterDataExecutionTone("blocked_permission"), "review");
assert.equal(getMasterDataExecutionTone("pending"), "pending");

assert.deepEqual(
  buildMasterDataMaintenanceViewItems({
    customers: [{}, {}],
    orderLines: [{}],
    inventoryRecords: [{}, {}, {}],
    employeeAccountReviews: [{ sourceType: "formal" }],
  }).map(({ key, count }) => [key, count]),
  [["客户档案", 2], ["价格表", 1], ["规格库存", 3], ["员工机台", 1]],
);
assert.deepEqual(
  filterMasterDataMaintenanceRecords([{ label: "张三服饰", searchText: "C001 张三服饰" }, { label: "李四电商" }], "c001"),
  [{ label: "张三服饰", searchText: "C001 张三服饰" }],
);
assert.deepEqual(getMasterDataMaintenanceColumns("员工机台"), ["员工", "账号", "岗位", "车间", "机台 / 安排", "状态"]);
assert.equal(getMasterDataMaintenanceTableClass("规格库存"), "stock");
assert.match(getMasterDataSearchPlaceholder("价格表"), /品名/);

console.log("office master-data state checks passed");
