import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/features/payroll/PayrollAttendancePage.jsx", import.meta.url), "utf8");
const mobileSource = readFileSync(new URL("../src/features/payroll/EmployeeAttendanceMobilePage.jsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../src/services/officeAttendancePayrollApiClient.js", import.meta.url), "utf8");
const openApiSource = readFileSync(new URL("../docs/development/erp-api-openapi-draft.yaml", import.meta.url), "utf8");
const reviewMobileEntrySource = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/FormalMobileEntry.jsx", import.meta.url), "utf8");
const adjustmentEvidencePreviewSource = readFileSync(new URL("../qa/payroll-adjustment-evidence-preview.html", import.meta.url), "utf8");

assert.match(appSource, /renderedPage === "payroll"/);
assert.match(appSource, /<PayrollAttendancePage[\s\S]*authState=\{authState\}/);
assert.match(appSource, /renderedPage === "attendanceMobile"/);
assert.match(appSource, /<EmployeeAttendanceMobilePage[\s\S]*authState=\{authState\}/);
assert.match(navigationSource, /key: "payroll"[\s\S]*permissionPrefixes: \["payroll\."\]/);
assert.match(navigationSource, /key: "attendanceMobile"[\s\S]*permissionKeys: \["attendance\.self\.read"\]/);

assert.match(clientSource, /export function precheckOfficeAttendanceSync/);
assert.match(clientSource, /"\/attendance\/sync-precheck"/);
assert.match(pageSource, /precheckOfficeAttendanceSync/);
assert.ok(
  pageSource.indexOf("precheckOfficeAttendanceSync({") < pageSource.indexOf("syncOfficeAttendance({"),
  "the formal attendance flow must perform the read-only precheck before importing punches",
);
assert.match(pageSource, /if \(!precheck\.data\?\.ready\)/);
assert.match(pageSource, /未写入任何打卡/);
assert.match(pageSource, /syncResult\.data\?\.batch\?\.importedCount/);
assert.match(pageSource, /实际新增 \$\{importedCount\} 条/);
assert.doesNotMatch(pageSource, /新增 \$\{Number\(precheck\.data\?\.summary\?\.newRecordCount/);
assert.match(pageSource, /workbench\?\.summary\?\.draftReady !== true/);
assert.match(pageSource, /次月核对上月完整考勤后生成工资草稿/);
assert.match(pageSource, /payrollPeriodClosed === false/);
assert.match(pageSource, /attendanceCoverageComplete !== true/);
assert.match(pageSource, /整月真实考勤导入/);
assert.match(pageSource, /getOfficePayrollHistory/);
assert.match(pageSource, /createOfficePayrollExport/);
assert.match(pageSource, /updateOfficePayrollLineAdjustment/);
assert.match(pageSource, /transitionOfficePayrollRun/);
assert.match(pageSource, /会计复核通过/);
assert.match(pageSource, /锁定工资批次/);
assert.match(pageSource, /确认发薪/);
assert.match(pageSource, /历史工资/);
assert.match(pageSource, /window\.confirm\(confirmation\)/);
assert.match(pageSource, /复核后工资明细不可继续修改/);
assert.match(pageSource, /锁定后只能进入发薪确认/);
assert.match(pageSource, /该操作会写入发薪人和发薪时间/);
assert.match(pageSource, /canReviewPayroll/);
assert.match(pageSource, /canLockPayroll/);
assert.match(pageSource, /canConfirmPayment/);
assert.match(pageSource, /canExportPayroll/);
assert.match(pageSource, /latestRun\.status !== "draft"/);
assert.ok(
  pageSource.indexOf('status: "draft"') < pageSource.indexOf('status: "published"'),
  "formal payroll policy publication must persist a draft before publishing the same version",
);
assert.match(pageSource, /draftResult\.data\?\.policyVersion/);
assert.match(pageSource, /id: draft\.id/);
assert.match(clientSource, /export function createOfficePayrollExport/);
assert.match(clientSource, /method: "POST"/);
assert.match(clientSource, /evidenceAttachmentIds: input\.evidenceAttachmentIds/);
assert.match(pageSource, /createPayrollAdjustmentEvidenceAttachmentInput/);
assert.match(pageSource, /uploadOfficeAttachmentFile/);
assert.match(pageSource, /金额变化时必填/);
assert.match(pageSource, /accept="image\/\*,\.pdf,application\/pdf"/);
assert.match(pageSource, /岗位工资标准/);
assert.match(pageSource, /已读取《26年工资 \(2\)\.xlsx》的岗位与薪资构成/);
assert.match(pageSource, /制袋机-理袋女工[\s\S]*?baseRate: 10[\s\S]*?allowanceRate: 5/);
assert.match(pageSource, /送货司机[\s\S]*?mode: "daily"[\s\S]*?baseRate: 180/);
assert.match(pageSource, /工资＝日薪 × 出勤天数＋综合绩效＋工龄奖/);
assert.match(pageSource, /years: 1, amount: 30/);
assert.match(pageSource, /years: 8, amount: 135/);
assert.match(openApiSource, /operationId: getPayrollRun[\s\S]*?#\/components\/schemas\/PayrollRunDetailResponse/);
assert.match(openApiSource, /operationId: getEmployeePayrollHistory[\s\S]*?#\/components\/schemas\/PayrollHistoryResponse/);
assert.match(openApiSource, /operationId: adjustPayrollDraftLine[\s\S]*?#\/components\/schemas\/PayrollLineAdjustmentResponse/);
assert.match(openApiSource, /PayrollLineAdjustmentAudit:[\s\S]*?evidenceAttachmentIds:[\s\S]*?maxItems: 5/);
assert.match(adjustmentEvidencePreviewSource, /\.detail \{[^}]*color:var\(--ink\)/);
assert.match(adjustmentEvidencePreviewSource, /调整凭证<\/strong><span class="required">必填/);
assert.match(adjustmentEvidencePreviewSource, /金额发生变化时至少上传1份，最多5份/);
assert.match(adjustmentEvidencePreviewSource, /评审范围：仅新增“调整凭证”，其他工资页面结构不变/);

assert.match(mobileSource, /getMyOfficeAttendance/);
assert.match(mobileSource, /系统不会使用演示金额/);
assert.doesNotMatch(mobileSource, /getOfficeEmployeeAttendance/);
assert.match(mobileSource, /state\.error && !data \? <section className="attendance-mobile-blocked"/);
assert.match(mobileSource, /系统没有返回员工、打卡、工时或工资数据/);
assert.match(reviewMobileEntrySource, /src\/styles\/features\/payroll-attendance\.css/);
assert.match(reviewMobileEntrySource, /return <App signedPreviewUserId="U-MANAGER-A" \/>/);

console.log("Payroll and attendance formal-page checks passed.");
