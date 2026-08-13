import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEmployeeProfile, formatEmployeeAge, formatEmployeeTenure } from "../src/employee-profile.js";
import { assertCompleteReviewStaticIdentity } from "../../../../scripts/completeReviewPreviewIdentity.mjs";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("4174 has one immutable local preview identity", async () => {
  const identity = await assertCompleteReviewStaticIdentity();
  assert.equal(identity.appId, "bagwin-complete-review-4174");
  assert.equal(identity.port, 4174);
  assert.equal(identity.rootWorkbenchPort, 5173);
});

test("desktop workbenches consume formal APIs without fixture fallbacks", async () => {
  const [appSource, workspacesSource, adapterSource] = await Promise.all([
    readSource("../src/App.jsx"),
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/useFormalDesktopWorkspace.js"),
  ]);

  for (const source of [appSource, workspacesSource, adapterSource]) {
    assert.doesNotMatch(source, /src\/data\/fixtures/, "desktop review must not import the ERP fixture catalog");
    assert.doesNotMatch(source, /createDemo|1500米|评审原型|本地交互|本地校验/, "desktop review must not restore demo-only writes or copy");
  }

  for (const client of [
    "listOfficeTodos",
    "listOfficeDraftQueue",
    "listOfficeOrderLines",
    "listOfficeInventoryItems",
    "listOfficeRawMaterialInbounds",
    "listOfficeProductionTasks",
    "listOfficePackingTasks",
    "listOfficePrintJobs",
  ]) {
    assert.ok(adapterSource.includes(client), `formal desktop adapter should read ${client}`);
  }

  assert.match(adapterSource, /serverRequired:\s*true/, "formal reads must fail closed instead of silently using demo data");
  assert.match(adapterSource, /prepareRawMaterialDeliveryNoteFile/, "desktop OCR upload should retain source normalization and rotation evidence");
  assert.match(adapterSource, /recognizeOfficeRawMaterialDeliveryNote/, "desktop OCR upload should call the formal server action");
  assert.match(adapterSource, /updateOfficeRawMaterialInboundAction/, "raw-material review actions should persist through the formal API");
  assert.match(appSource, /function RollInventory\(\{ onOpenSource, sourceRolls = \[\] \}\)/, "roll inventory must render safely while formal data is still loading");
  assert.match(appSource, /sourceRolls\[0\]\?\.id \|\| ""/, "roll selection must not dereference an undefined legacy fixture");
  assert.doesNotMatch(appSource, /sourceRolls = rolls/, "roll inventory must not reference the removed fixture variable");
  assert.match(appSource, /selectedRoll \? <><dl>/, "the source rail must render an explicit empty state before formal rolls arrive");
});

test("supplier statement identifiers use collision-resistant entropy", async () => {
  const repositorySource = await readSource("../../../../server/rawMaterialSupplierStatementReviewRepository.mjs");

  assert.match(repositorySource, /import \{ randomUUID \} from "node:crypto"/, "repository should use cryptographic UUID entropy");
  assert.match(repositorySource, /createCollisionResistantId\("RMSR"/, "review IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSRC"/, "confirmation IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSP"/, "payable IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSPAY"/, "payment IDs should use the collision-resistant builder");
});

test("employee machine list keeps account in detail and searchable metadata", async () => {
  const workspacesSource = await readSource("../src/BusinessWorkspaces.jsx");

  assert.match(workspacesSource, /columns:\s*\["序号", "员工", "岗位", "车间", "机台", "状态"\]/, "employee list should begin with a visible roster sequence and omit the login account column");
  assert.match(workspacesSource, /employees\.map\(\(employee, employeeIndex\)/, "employee sequence should follow the authoritative roster order");
  assert.match(workspacesSource, /cells:\s*\[String\(employeeIndex \+ 1\), employee\.name/, "each employee row should expose its one-based roster sequence before the name");
  assert.match(workspacesSource, /primaryCellIndex:\s*1/, "employee name should remain the row's visual primary value after adding the sequence");
  assert.match(workspacesSource, /detailTitle:\s*employee\.name/, "selected detail should keep the employee name rather than the sequence as its title");
  assert.match(workspacesSource, /searchValues:\s*\[employee\.loginName\]/, "hidden account values should remain searchable");
  assert.match(workspacesSource, /title:\s*"员工档案"/, "selected employee detail should expose a dedicated personnel profile section");
  assert.match(workspacesSource, /\["年龄", profile\.age\]/, "selected employee detail should expose a derived age");
  assert.match(workspacesSource, /\["入职时间", profile\.hireDate\]/, "selected employee detail should expose the maintained hire date");
  assert.match(workspacesSource, /\["在厂工龄", profile\.tenure\]/, "selected employee detail should expose derived factory tenure");
  assert.match(workspacesSource, /title:\s*"工作安排"/, "workshop and machine should be grouped as current work assignment");
  assert.match(workspacesSource, /title:\s*"账号信息"/, "account should be grouped in the selected employee detail");
  assert.match(workspacesSource, /\["账号", employee\.loginName \|\| "待分配"\]/, "account should remain available in the selected employee detail");
  assert.match(workspacesSource, /\.\.\.\(row\.searchValues \|\| \[\]\)/, "generic workbench search should include hidden searchable metadata");
});

test("4174 employee workbench reuses the formal audited profile editor and write API", async () => {
  const [workspacesSource, adapterSource, formalEditorSource] = await Promise.all([
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/useFormalDesktopWorkspace.js"),
    readSource("../../../../src/features/master-data/MasterDataMaintenancePage.jsx"),
  ]);

  assert.match(workspacesSource, /EmployeeProfileEditor/, "employee maintenance should reuse the formal editor instead of creating a review-only form");
  assert.match(workspacesSource, /profileMaintenance:\s*true/, "the approved employee detail should expose formal maintenance");
  assert.match(workspacesSource, /onUpdateEmployeeProfile:\s*formal\.actions\.updateEmployeeProfile/, "the employee workbench should call the formal adapter action");
  assert.match(adapterSource, /updateOfficeMasterDataEmployeeProfile/, "the adapter should persist profile changes through the formal API client");
  assert.match(adapterSource, /replaceEmployeeReview\(current\.employeeAccountReviews, result\.employeeAccountReview\)/, "a successful save should replace the authoritative employee read model");
  assert.match(formalEditorSource, /export function EmployeeProfileEditor/, "the shared formal editor should be exported for the 4174 shell");
});

test("4174 employee detail exposes the formal account activation sequence without local account state", async () => {
  const [workspacesSource, adapterSource] = await Promise.all([
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/useFormalDesktopWorkspace.js"),
  ]);

  assert.match(workspacesSource, /准备员工账号/, "employee detail should expose account preparation next to profile maintenance");
  assert.match(workspacesSource, /确认正式身份/, "identity confirmation must remain the first blocked-account step");
  assert.match(workspacesSource, /复核启用账号/, "account activation must remain an explicit administrator action");
  assert.match(workspacesSource, /临时密码只显示一次/, "temporary credentials must retain the one-time disclosure boundary");
  assert.match(workspacesSource, /离职员工保留历史记录，但不能重新启用/, "departed employees must remain visibly ineligible");
  for (const client of [
    "confirmOfficeMasterDataEmployeeIdentity",
    "enableOfficeMasterDataEmployeeAccount",
    "issueOfficeMasterDataEmployeeAccountPassword",
  ]) assert.match(adapterSource, new RegExp(client), `4174 account preparation should call ${client}`);
  assert.match(adapterSource, /replaceEmployeeReview/, "successful account actions should replace only the server-returned employee read model");
});

test("employee age and factory tenure derive from maintained dates", () => {
  const asOf = new Date("2026-08-10T08:00:00+08:00");

  assert.equal(formatEmployeeAge("1990-08-11", asOf), "35岁");
  assert.equal(formatEmployeeAge("", asOf), "未维护");
  assert.equal(formatEmployeeAge("2027-01-01", asOf), "日期待核对");
  assert.equal(formatEmployeeTenure("2020-06-15", asOf), "6年1个月");
  assert.equal(formatEmployeeTenure("", asOf), "待维护入职日期");
  assert.deepEqual(buildEmployeeProfile({ birthDate: "1990-08-11", hireDate: "2020-06-15", status: "departed" }, asOf), {
    birthDate: "1990-08-11",
    age: "35岁",
    hireDate: "2020-06-15",
    tenure: "6年1个月",
    employmentStatus: "已离职",
  });
});

test("desktop topbar gives its leading space to global search", async () => {
  const [appSource, stylesSource] = await Promise.all([
    readSource("../src/App.jsx"),
    readSource("../src/styles.css"),
  ]);

  assert.doesNotMatch(appSource, /<strong>虎门工厂<\/strong>/, "topbar should not repeat a fixed factory label before global search");
  assert.doesNotMatch(stylesSource, /\.topbar\s*>\s*strong/, "removed factory-label styling should not remain as dead CSS");
  assert.match(appSource, /<header className="topbar">\s*<label className="global-search">/, "global search should be the first topbar content control");
});

test("4174 payroll route mounts the formal payroll workbench instead of the review fixture", async () => {
  const [workspacesSource, navigationSource, payrollSource] = await Promise.all([
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/navigation.js"),
    readSource("../../../../src/features/payroll/PayrollAttendancePage.jsx"),
  ]);

  assert.match(navigationSource, /id:\s*"payroll-attendance",\s*label:\s*"工资核算"/, "finance navigation should expose an independent payroll workbench");
  assert.match(workspacesSource, /import \{ PayrollAttendancePage \} from "\.\.\/\.\.\/\.\.\/\.\.\/src\/features\/payroll\/PayrollAttendancePage\.jsx"/, "the 4174 shell must consume the formal payroll page");
  assert.match(workspacesSource, /<PayrollAttendancePage authState=\{formal\.authState\} currentUser=\{formal\.permissionContext\?\.user\} permissionContext=\{formal\.permissionContext\}/, "the formal payroll page must receive the authenticated user and permission context");
  assert.doesNotMatch(workspacesSource, /PayrollAttendanceReview/, "the review-only payroll fixture must not remain reachable from the 4174 business route");
  assert.match(payrollSource, /precheckOfficeAttendanceSync/, "formal payroll sync must perform the read-only source precheck");
  assert.match(payrollSource, /workbench\?\.summary\?\.draftReady !== true/, "formal payroll draft generation must fail closed until every readiness gate passes");
  assert.doesNotMatch(payrollSource, /界面评审示例|时间与金额非真实数据/, "formal payroll must not render illustrative attendance or wage fixtures");
});

test("4174 phone bootstrap includes the formal employee attendance styles", async () => {
  const mobileEntrySource = await readSource("../src/FormalMobileEntry.jsx");

  assert.match(mobileEntrySource, /import "\.\.\/\.\.\/\.\.\/\.\.\/src\/styles\/features\/payroll-attendance\.css"/, "the 4174 mobile bootstrap must load the same formal attendance styles as the main application");
  assert.match(mobileEntrySource, /return <App \/>/, "the 4174 phone entry must reuse the formal application instead of mounting a prototype phone page");
});
