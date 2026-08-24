import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEmployeeProfile, formatEmployeeAge, formatEmployeeTenure } from "../src/employee-profile.js";
import { detectCompleteReviewRuntimeFamily } from "../src/review-runtime-family.js";
import { assertCompleteReviewStaticIdentity } from "../../../../scripts/completeReviewPreviewIdentity.mjs";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("4174 has one immutable local preview identity", async () => {
  const identity = await assertCompleteReviewStaticIdentity();
  assert.equal(identity.appId, "bagwin-complete-review-4174");
  assert.equal(identity.port, 4174);
  assert.equal(identity.rootWorkbenchPort, 5173);
});

test("bare root workbench navigation cannot masquerade as the 4174 review", async () => {
  const rootViteSource = await readFile(new URL("../../../../vite.config.mjs", import.meta.url), "utf8");
  assert.match(rootViteSource, /ERP_INTERNAL_WORKBENCH_EXPLICIT_ACCESS_REQUIRED/);
  assert.match(rootViteSource, /searchParams\.get\("internalWorkbench"\) === "1"/);
  assert.match(rootViteSource, /http:\/\/127\.0\.0\.1:4174\/\?source=review-guard/);
});

test("4174 mobile review uses a signed passwordless preview session", async () => {
  const [mobileEntrySource, appSource, authInitializationSource] = await Promise.all([
    readSource("../src/FormalMobileEntry.jsx"),
    readSource("../../../../src/App.jsx"),
    readSource("../../../../src/app/useRuntimeAuthInitialization.js"),
  ]);

  assert.match(mobileEntrySource, /<App signedPreviewUserId="U-MANAGER-A" \/>/, "mobile review should explicitly request the fixed signed preview identity");
  assert.match(appSource, /stagingAuthBypass:\s*true/, "the signed preview identity should bypass only the visible password boundary");
  assert.match(appSource, /createInitialAuthState\(signedPreviewAuthOptions \?\? undefined\)/, "the initial mobile state should use the same preview auth contract");
  assert.match(appSource, /signedPreviewMobilePage[\s\S]*isNavigationPageVisible\("rawMaterials", permissionContext\)[\s\S]*\? "rawMaterials"/, "the fixed preview identity should enter the formal raw-material phone route even though its desktop role is management");
  assert.match(appSource, /fixedPreviewMode=\{Boolean\(signedPreviewAuthOptions\)\}/, "the fixed preview identity should not expose the demo role switcher");
  assert.match(authInitializationSource, /initializeSeedAuth\(\{ \.\.\.\(authOptions \?\? \{\}\), serverRequired \}\)/, "mobile startup should exchange the preview identity for a backend-signed session");
});

test("4174 desktop account identity is read-only instead of a fake dropdown", async () => {
  const appSource = await readSource("../src/App.jsx");

  assert.match(appSource, /aria-label=\{`当前账号：\$\{account\.displayName\}/, "the desktop shell should name the signed current account explicitly");
  assert.match(appSource, /className="account" role="status"/, "the desktop account identity should be announced as read-only status");
  assert.doesNotMatch(appSource, /<button className="account"/, "an account menu that does not exist must not be presented as a button");
});

test("staging preview refuses restored sessions from a different identity", async () => {
  const authServiceSource = await readSource("../../../../src/services/officeAuthService.js");

  assert.match(authServiceSource, /String\(storedSession\.userId \?\? ""\)\.trim\(\) !== stagingPreviewUserId/, "preview startup should reject an old session for another user");
  assert.match(authServiceSource, /json\?\.session\?\.userId \?\? json\?\.permissions\?\.user\?\.userId/, "preview startup should verify the restored server identity too");
  assert.match(authServiceSource, /return loginSeedUser\(stagingPreviewUserId, options\)/, "preview startup should replace mismatched sessions with its fixed signed identity");
});

test("4174 keeps desktop browsers on the accepted shell regardless of narrow window width", async () => {
  const [entrySource, runtimeFamilySource] = await Promise.all([
    readSource("../src/complete-review-entry.jsx"),
    readSource("../src/review-runtime-family.js"),
  ]);

  assert.match(entrySource, /detectCompleteReviewRuntimeFamily\(window\)/, "the review entry should detect the real runtime family instead of treating a narrow desktop window as a phone");
  assert.match(entrySource, /declaredViewportFamily !== expectedViewportFamily/, "a stale viewport marker should be corrected before either shell renders");
  assert.match(entrySource, /dataset\.erpRuntimeFamily = expectedViewportFamily/, "the mounted review should expose its runtime-family assertion for verification");
  assert.match(entrySource, /本地修改稿 · 未部署/, "the local review must never masquerade as a deployed release");
  assert.doesNotMatch(entrySource, /matchMedia\("\(max-width: 767px\)"\)/, "viewport width alone must never select the historical formal shell");
  assert.match(runtimeFamilySource, /userAgentData\?\.mobile/, "modern browser client hints should be the primary runtime-family signal");
  assert.match(runtimeFamilySource, /Android\.\+Mobile\|iPhone/, "real handset user agents should retain the approved formal phone flow");
});

test("runtime family distinguishes office desktops from real handsets without viewport width", () => {
  assert.equal(detectCompleteReviewRuntimeFamily({
    navigator: {
      userAgentData: { mobile: false },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0",
    },
  }), "desktop");
  assert.equal(detectCompleteReviewRuntimeFamily({
    navigator: {
      userAgentData: { mobile: true },
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/140.0 Mobile",
    },
  }), "mobile");
  assert.equal(detectCompleteReviewRuntimeFamily({
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
  }), "mobile");
  assert.equal(detectCompleteReviewRuntimeFamily({
    navigator: {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0",
      platform: "MacIntel",
      maxTouchPoints: 0,
    },
  }), "desktop");
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
  assert.match(appSource, /formatInventoryRollAmount\(roll\)/, "piece-counted handle stock must display a piece quantity instead of 0kg");
});

test("outbound delivery and supplier month-end share the complete review list-detail shell", async () => {
  const [appSource, workspacesSource, stylesSource] = await Promise.all([
    readSource("../src/App.jsx"),
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/business-workspaces.css"),
  ]);

  assert.doesNotMatch(appSource, /function StatementWorkspace/, "supplier month-end must not retain its older standalone list shell");
  assert.match(appSource, /!isRawMaterialView \? <BusinessWorkspace/, "all non-raw-material pages should route through the same complete review workbench surface");
  assert.match(workspacesSource, /navId === "outbound-delivery"\) return <FulfillmentWorkspace/, "outbound delivery should use its current-shell workspace");
  assert.match(workspacesSource, /navId === "supplier-month-end"\) return <SupplierSettlementWorkspace/, "supplier month-end should use its current-shell workspace");
  assert.match(workspacesSource, /className="business-workbench fulfillment-workbench"/, "outbound delivery should reuse the standard list-detail anatomy");
  assert.match(workspacesSource, /className="business-workbench supplier-settlement-workbench"/, "supplier month-end should reuse the standard list-detail anatomy");
  for (const label of ["订货数量", "已发数量", "本次发货", "剩余未发", "历史欠款", "本单应收", "累计待收"]) {
    assert.ok(workspacesSource.includes(label), `outbound detail should retain ${label}`);
  }
  for (const label of ["对账确认", "生成应付", "付款登记", "付款确认"]) {
    assert.ok(workspacesSource.includes(label), `supplier settlement should retain ${label}`);
  }
  assert.match(workspacesSource, /本地评审只读样例/, "the filled settlement chain should be explicitly non-writing in the local review");
  assert.match(stylesSource, /\.fulfillment-progress-facts/, "outbound progress facts should be styled inside the selected detail rail");
  assert.match(stylesSource, /\.supplier-settlement-flow/, "supplier settlement stages should be styled inside the selected detail rail");
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
  assert.match(mobileEntrySource, /return <App signedPreviewUserId="U-MANAGER-A" \/>/, "the 4174 phone entry must reuse the formal application with the signed review identity instead of mounting a prototype phone page");
});
