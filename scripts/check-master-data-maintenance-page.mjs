import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMasterDataRouteContract } from "../src/app/buildMasterDataRouteContract.js";
import {
  buildMasterDataMaintenanceRecords,
  getEmployeeAssignmentMode,
} from "../src/domain/masterDataMaintenanceRecords.js";
import {
  buildMasterDataEmployeeReviewFilterCounts,
  buildMasterDataMaintenanceViewItems,
  filterMasterDataEmployeeReviewRecords,
  filterMasterDataMaintenanceRecords,
  getMasterDataSearchPlaceholder,
  isMasterDataEmployeeEnableCandidate,
  MASTER_DATA_MAINTENANCE_TABS,
  requiresMasterDataEmployeeIdentityConfirmation,
  requiresMasterDataEmployeeMachineReview,
} from "../src/domain/masterDataMaintenanceListState.js";

const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
const apiClientSource = readFileSync(new URL("../src/services/officeMasterDataImportApiClient.js", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const featurePageSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenancePage.jsx", import.meta.url), "utf8");
const subaccountWorkbenchSource = readFileSync(new URL("../src/features/master-data/SubaccountPermissionWorkbench.jsx", import.meta.url), "utf8");
const completeReviewWorkspaceSource = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx", import.meta.url), "utf8");
const featureWorkbenchSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenanceWorkbench.jsx", import.meta.url), "utf8");
const masterDataRouteSource = readFileSync(new URL("../src/app/routes/MasterDataRoute.jsx", import.meta.url), "utf8");
const importModalSource = readFileSync(new URL("../src/app/MasterDataImportTemplateModal.jsx", import.meta.url), "utf8");
const recordProjectionSource = readFileSync(new URL("../src/domain/masterDataMaintenanceRecords.js", import.meta.url), "utf8");
const featureSource = `${featurePageSource}\n${featureWorkbenchSource}`;
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");
const masterDataStyleSource = readFileSync(new URL("../src/styles/features/master-data.css", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

assertIncludes(navigationSource, 'key: "masterData"', "navigation should expose the master-data maintenance page");
assertIncludes(navigationSource, 'label: "基础资料"', "navigation should label the master-data maintenance page");
assertIncludes(masterDataRouteSource, "<MasterDataMaintenancePage", "master-data route should render the maintenance page");
const routeActionStubs = {
  enableMasterDataEmployeeAccounts: () => {},
  openMasterDataTemplatePanel: () => {},
  saveMasterDataMaintenanceDraft: () => {},
  saveMasterDataMachine: () => {},
  updateMasterDataEmployeeAssignment: () => {},
  updateMasterDataEmployeeProfile: () => {},
  setSelectedMasterDataId: () => {},
  setMasterDataMaintenanceTab: () => {},
};
const routeContract = buildMasterDataRouteContract(routeActionStubs);
assert.equal(routeContract.actions.onSaveDraft, routeActionStubs.saveMasterDataMaintenanceDraft);
assert.equal(routeContract.actions.onUpdateEmployeeAssignment, routeActionStubs.updateMasterDataEmployeeAssignment);
assert.equal(routeContract.actions.onSaveMachine, routeActionStubs.saveMasterDataMachine);
assert.equal(routeContract.actions.onBatchEnableEmployeeAccounts, routeActionStubs.enableMasterDataEmployeeAccounts);
assertIncludes(importModalSource, "EmployeeAccountRoleSelector", "employee account review should expose role-set selection");
assertIncludes(importModalSource, "账号角色", "employee account review should label its role-set selector");
assertIncludes(importModalSource, "导入的主角色或附加角色，启用时不可删除", "imported account roles should remain locked during review");

assertIncludes(featurePageSource, "export function MasterDataMaintenancePage", "master-data feature should own the page");
assertIncludes(featureSource, "客户档案", "master-data page should include customer maintenance");
assertIncludes(featureSource, "价格表", "master-data page should include price maintenance");
assertIncludes(featureSource, "规格库存", "master-data page should include inventory specification maintenance");
assertIncludes(featureSource, "员工机台", "master-data page should include employee/machine maintenance");
assertIncludes(featurePageSource, "岗位分配", "employee maintenance should expose position-first subaccount assignment");
assertIncludes(subaccountWorkbenchSource, "系统会自动带出这个岗位需要的功能", "position assignment should explain automatic permission derivation");
assertIncludes(subaccountWorkbenchSource, "subaccount-position-scopes", "position cards should preview business scopes in plain language");
assertIncludes(subaccountWorkbenchSource, "保存岗位分配", "position assignment should expose one clear save action");
assert.equal(subaccountWorkbenchSource.includes("单项权限调整"), false, "everyday position assignment must not expose the technical permission table");
assert.equal(subaccountWorkbenchSource.includes("输入权限键"), false, "everyday position assignment must not require permission-key knowledge");
assertIncludes(completeReviewWorkspaceSource, 'get("peopleView") === "positions"', "complete review should support a direct position-assignment preview");
assertIncludes(featureSource, "车间 / 机台调配", "employee maintenance should expose manual assignment controls");
assertIncludes(featurePageSource, "suggestPayrollPosition", "employee profiles should consume the non-name payroll-position suggestion contract");
assertIncludes(featurePageSource, "系统工资岗位候选", "employee profiles should explain the suggested payroll position");
assertIncludes(featurePageSource, "采用该候选", "a responsible reviewer should be able to fill, but not auto-save, the suggested position");
assertIncludes(featurePageSource, "系统不按员工姓名猜测", "unmatched employees must remain explicit instead of being matched by name");
assertIncludes(featureSource, "车间 / 机台配置", "employee maintenance should expose machine configuration controls");
assertIncludes(featureSource, "新增机台", "machine configuration should support adding a machine");
assertIncludes(featureSource, "停用或搬迁前必须先解除正式员工绑定", "machine configuration should explain its occupancy guard");
assertIncludes(featureSource, "机台占用与修改记录", "machine configuration should expose named occupancy and audit evidence");
assertIncludes(featureSource, "当前绑定", "machine configuration should name its current employee occupancy");
assertIncludes(featureSource, "最近修改", "machine configuration should expose the latest audited change");
assertIncludes(featureSource, "搬迁或停用前先调整以上员工", "machine configuration should explain the prerequisite using visible employees");
assertIncludes(featureSource, "杂工 / 流动", "employee maintenance should support workshop-only general workers");
assertIncludes(featureSource, "暂未分配", "employee maintenance should support clearing an assignment explicitly");
assertIncludes(featureSource, "保存调配", "employee maintenance should expose a direct assignment save action");
assertIncludes(featureSource, "最近调配记录", "employee maintenance should expose the latest assignment audit summary");
assertIncludes(featureSource, "暂无人工调配记录", "employee maintenance should distinguish employees without a manual assignment audit");
assertIncludes(featureSource, "assignmentUpdatedBy", "employee assignment audit should show the authenticated operator");
assertIncludes(featureSource, "assignmentUpdatedAt", "employee assignment audit should show the server timestamp");
assertIncludes(featureSource, "assignmentNote", "employee assignment audit should show the saved reason");
assertIncludes(featureSource, "批量启用", "employee maintenance should expose filtered batch account enablement");
assertIncludes(featureSource, "batchEnableCandidates", "batch account enablement should only receive visible eligible formal reviews");
assertIncludes(featureSource, "全选当前筛选", "employee batch enablement should support explicit filtered selection");
assertIncludes(featureSource, "员工账号复核状态", "employee maintenance should expose account/machine review filters");
assertIncludes(featureSource, "请先在右侧完成真实机台复核", "unassigned workshop employees should not be selectable for enablement");
assertIncludes(featureSource, "master-data-row-selector", "each formal employee row should expose a checkbox selector");
assertIncludes(featureSource, "正式员工岗位上线就绪", "employee maintenance should expose authoritative eight-role readiness");
assertIncludes(featureSource, "尚未导入待启用账号", "missing formal roles should remain explicit");
assertIncludes(featureSource, "待复核启用", "imported but disabled employee accounts should remain distinct from missing accounts");
assertIncludes(featureSource, "员工账号来源", "employee maintenance should separate formal and seed views");
assertIncludes(featureSource, "演示账号只读", "seed accounts should be isolated behind an explicit read-only view");
assertIncludes(featureSource, "尚未导入正式员工账号", "formal employee view should have an explicit empty state");
assertIncludes(featureSource, "正式员工账号状态待同步", "formal employee view should distinguish an unavailable projection from a true empty import");
assertIncludes(featureSource, "失败或无权限时不展示旧投影", "employee readiness should explain the fail-closed projection boundary");
assertIncludes(featureSource, "维护草稿不直接写库", "page should clearly state maintenance drafts are non-writing");
assertIncludes(featureSource, "保存维护草稿", "page should expose draft-save action");
assertIncludes(featureSource, "打开导入模板", "page should link back to the import-template flow");
assertIncludes(featurePageSource, "buildMasterDataMaintenanceRecords", "page should consume the tested record projection");
assert.equal(featurePageSource.includes("DEFAULT_WORKSHOPS"), false, "React must not restore hard-coded workshop options");
assert.equal(workspaceSource.includes('workshops: ["1号车间", "2号车间", "3号车间"]'), false, "workspace state must start from authoritative machine data");
assert.match(apiClientSource, /function normalizeEmployeeAssignmentOptions[\s\S]*?: \[\];/, "API fallback must not fabricate workshop options");
assert.equal(featurePageSource.includes("function buildMasterDataCustomerRecords"), false, "React page should not own pure master-data record builders");
assertIncludes(recordProjectionSource, "export function buildMasterDataMaintenanceRecords", "record projection should be independently testable");
assert.match(featurePageSource, /function changeTab\(tab\)[\s\S]*?setKeyword\(""\)/, "switching master-data tabs should clear the prior tab query");
assert.match(featurePageSource, /function changeEmployeeView\(nextView\)[\s\S]*?setEmployeeReviewFilter\([\s\S]*?setKeyword\(""\)[\s\S]*?setBatchSelectedEmployeeIds\(\[\]\)/, "switching employee source should clear review/search/selection state");
assert.match(featurePageSource, /function changeEmployeeReviewFilter\(nextFilter\)[\s\S]*?setBatchSelectedEmployeeIds\(\[\]\)/, "changing employee review status should clear an earlier batch selection");
assert.match(featurePageSource, /setBatchSelectedEmployeeIds\(\(current\) => \{[\s\S]*?return next\.length === current\.length \? current : next;/, "batch-selection cleanup must preserve state identity when no selected employee is removed");

const searchFixtures = {
  customers: [{
    id: "C-SEARCH-1",
    name: "白鲸自营店",
    cycle: "7天一结",
    contact: "店铺客服",
    phone: "17700001160",
    address: "虎门镇人民路8号",
    tags: ["定制多", "快运"],
    debt: 200,
    receivable: 500,
    lastStatement: "07-14",
  }],
  statements: [{ customerId: "C-SEARCH-1", variance: 20 }],
  orderLines: [{
    id: "OL-SEARCH-1",
    orderNo: "ORD-SEARCH-001",
    customerId: "C-SEARCH-1",
    product: "白鲸活动袋",
    size: "35*27*10",
    color: "白色",
    handle: "黑色提手",
    qty: 1500,
    amount: 585,
    print: "是",
    orderType: "定制印刷",
  }],
  inventoryRecords: [{
    id: "INV-SEARCH-1",
    size: "35*27*10",
    color: "白色",
    handle: "黑色提手",
    style: "空白袋",
    zone: "A-03库区",
    state: "缺货",
    estimated: true,
    inStock: 100,
    reserved: 80,
    locked: 20,
    pending: 5,
  }],
  employeeAccountReviews: [
    {
      employeeId: "EMP-SEARCH-42",
      name: "高彦芹",
      loginName: "emp.erp.0042",
      roleName: "车间报工",
      recommendedRoleKey: "workshop",
      defaultWorkshop: "2号车间",
      defaultMachineId: "MACH-SEARCH-6",
      configuredMachineId: "MACH-SEARCH-6",
      configuredMachineLabel: "6号制袋机",
      machineConfigurationStatus: "active",
      machineConfigurationStatusLabel: "机台已配置",
      assignmentMode: "fixed_machine",
      assignmentUpdatedBy: "U-MANAGER-A",
      assignmentUpdatedAt: "2026-07-15T08:30:00.000Z",
      assignmentNote: "调整到2号车间6号机",
      accountEnabled: false,
    },
    {
      employeeId: "EMP-MACHINE-PENDING",
      name: "任靖云",
      loginName: "emp.erp.0043",
      roleName: "车间报工",
      recommendedRoleKey: "workshop",
      defaultWorkshop: "",
      defaultMachineId: "MISSING-01",
      assignmentMode: "fixed_machine",
      machineConfigurationStatus: "not_configured",
      machineConfigurationStatusLabel: "机台资料不存在",
      accountEnabled: false,
    },
    {
      employeeId: "EMP-OFFICE-READY",
      name: "郝蒙蒙",
      loginName: "emp.erp.0044",
      roleName: "办公室",
      recommendedRoleKey: "office",
      defaultWorkshop: "",
      defaultMachineId: "",
      assignmentMode: "unassigned",
      machineConfigurationStatus: "not_required",
      accountEnabled: false,
    },
    {
      employeeId: "EMP-DRIVER-ENABLED",
      name: "朱江斌",
      loginName: "emp.erp.0045",
      roleName: "司机",
      recommendedRoleKey: "driver",
      defaultWorkshop: "",
      defaultMachineId: "",
      assignmentMode: "unassigned",
      machineConfigurationStatus: "not_required",
      accountEnabled: true,
      passwordStatus: "active",
    },
    {
      employeeId: "ERP-0001",
      name: "负责人",
      loginName: "emp.erp.0001",
      roleName: "管理；财务 / 对账",
      recommendedRoleKey: "management",
      recommendedRoleKeys: ["management", "finance"],
      machineConfigurationStatus: "not_required",
      accountEnabled: false,
      identityConfirmationRequired: true,
      identityConfirmed: false,
      accountActivationBlocked: true,
      accountActivationBlockerLabel: "负责人身份和正式显示名待确认",
    },
    {
      employeeId: "ERP-DEPARTED",
      name: "已离职员工",
      roleName: "打包",
      recommendedRoleKey: "packing",
      machineConfigurationStatus: "not_required",
      profileStatus: "departed",
      status: "departed",
      accountEnabled: false,
    },
  ],
  seedUserOptions: [{
    userId: "U-SEED-SEARCH",
    displayName: "办公室演示A",
    roleLabel: "录单 / 对账",
    defaultRole: "office",
    defaultMachineId: "",
  }],
  helpers: {
    getLineColorSpecLabel: () => "白印黑 / 白袋黑提",
    getLinePrintSide: () => "双面",
    getLineRemark: () => "加长提",
    getStockStateGroup: (stock) => stock.state,
    getStockStateTone: () => "danger",
    getStockTrustLabel: () => "估算/待复核",
    money: (value) => `¥${Number(value).toFixed(2)}`,
  },
};
const recordsByTab = Object.fromEntries(MASTER_DATA_MAINTENANCE_TABS.map((tab) => [
  tab,
  buildMasterDataMaintenanceRecords({ ...searchFixtures, tab }),
]));
assert.deepEqual(
  buildMasterDataMaintenanceViewItems(searchFixtures).map((item) => [item.key, item.count]),
  [["客户档案", 1], ["价格表", 1], ["规格库存", 1], ["员工机台", 5]],
  "view counts should not include seed employees",
);
assert.equal(getMasterDataSearchPlaceholder("客户档案"), "搜索客户 / 联系人 / 手机 / 地址 / 标签");
assert.equal(getMasterDataSearchPlaceholder("价格表"), "搜索品名 / 尺寸 / 颜色 / 客户 / 订单");
assert.equal(getMasterDataSearchPlaceholder("规格库存"), "搜索尺寸 / 颜色 / 款式 / 库区 / 状态");
assert.equal(getMasterDataSearchPlaceholder("员工机台"), "搜索员工 / 员工编号 / 账号 / 岗位 / 车间 / 机台");
for (const query of ["白鲸自营店", "店铺客服", "17700001160", "人民路8号", "定制多"]) {
  assert.equal(filterMasterDataMaintenanceRecords(recordsByTab.客户档案, query)[0]?.id, "C-SEARCH-1", `customer search should match ${query}`);
}
for (const query of ["白鲸活动袋", "35*27*10", "白印黑", "白袋黑提", "白鲸自营店", "ord-search-001"]) {
  assert.equal(filterMasterDataMaintenanceRecords(recordsByTab.价格表, query)[0]?.id, "PRICE-OL-SEARCH-1", `price search should match ${query}`);
}
for (const query of ["35*27*10", "白色", "空白袋", "A-03库区", "缺货", "估算/待复核"]) {
  assert.equal(filterMasterDataMaintenanceRecords(recordsByTab.规格库存, query)[0]?.id, "STOCK-INV-SEARCH-1", `inventory search should match ${query}`);
}
for (const query of ["高彦芹", "EMP.ERP.0042", "车间报工", "2号车间", "mach-search-6"]) {
  assert.equal(filterMasterDataMaintenanceRecords(recordsByTab.员工机台, query)[0]?.id, "EMP-EMP-SEARCH-42", `employee search should match ${query}`);
}
const formalEmployeeRecords = recordsByTab.员工机台.filter((record) => record.sourceType === "formal");
assert.deepEqual(recordsByTab.员工机台.map((record) => record.sourceType), ["formal", "formal", "formal", "formal", "formal", "formal", "seed"]);
assert.deepEqual(buildMasterDataEmployeeReviewFilterCounts(recordsByTab.员工机台), {
  在职: 5,
  可启用: 2,
  待身份: 1,
  待机台: 1,
  已启用: 1,
  已离职: 1,
});
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "在职").map((record) => record.label), ["高彦芹", "任靖云", "郝蒙蒙", "朱江斌", "负责人"]);
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "已离职").map((record) => record.label), ["已离职员工"]);
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "可启用").map((record) => record.label), ["高彦芹", "郝蒙蒙"]);
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "待机台").map((record) => record.label), ["任靖云"]);
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "待身份").map((record) => record.label), ["负责人"]);
assert.deepEqual(filterMasterDataEmployeeReviewRecords(formalEmployeeRecords, "已启用").map((record) => record.label), ["朱江斌"]);
assert.equal(requiresMasterDataEmployeeMachineReview(formalEmployeeRecords[1]), true);
assert.equal(isMasterDataEmployeeEnableCandidate(formalEmployeeRecords[1]), false);
assert.equal(isMasterDataEmployeeEnableCandidate(formalEmployeeRecords[2]), true);
assert.equal(isMasterDataEmployeeEnableCandidate(formalEmployeeRecords[3]), false);
assert.equal(isMasterDataEmployeeEnableCandidate(formalEmployeeRecords[4]), false);
assert.equal(isMasterDataEmployeeEnableCandidate(formalEmployeeRecords[5]), false, "departed employees must never re-enter account enablement");
assert.equal(requiresMasterDataEmployeeIdentityConfirmation(formalEmployeeRecords[4]), true);
assert.equal(requiresMasterDataEmployeeMachineReview({
  recommendedRoleKey: "management",
  recommendedRoleKeys: ["management", "workshop"],
  machineConfigurationStatus: "missing",
}), true, "a secondary workshop role must retain the machine gate in the batch UI");
assert.equal(formalEmployeeRecords[0].employeeReview.assignmentUpdatedBy, "U-MANAGER-A");
assert.equal(formalEmployeeRecords[0].employeeReview.assignmentNote, "调整到2号车间6号机");
assert.equal(getEmployeeAssignmentMode({ defaultMachineId: "M-1" }), "fixed_machine");
assert.equal(getEmployeeAssignmentMode({ defaultWorkshop: "1号车间" }), "general_worker");
assert.equal(getEmployeeAssignmentMode({}), "unassigned");
assert.deepEqual(filterMasterDataMaintenanceRecords(recordsByTab.员工机台, "不存在字段"), []);

assertIncludes(permissionSource, "生成维护草稿", "permissions should guard maintenance draft creation");
assertIncludes(permissionSource, "保存员工调配", "permissions should guard employee assignment writes");
assertIncludes(permissionSource, "保存机台配置", "permissions should guard machine configuration writes");
assertIncludes(permissionSource, "master_data.import.plan.create", "maintenance draft action should reuse the review-plan permission");

assertIncludes(styleSource, ".master-data-maintenance-table", "styles should cover the maintenance table");
assertIncludes(styleSource, ".master-data-role-readiness", "styles should cover the employee role readiness matrix");
assertIncludes(masterDataStyleSource, ".master-data-employee-identity-confirmation", "styles should cover the identity confirmation form");
assertIncludes(importModalSource, "onConfirmEmployeeIdentity", "employee review modal should expose the identity confirmation action");
assertIncludes(importModalSource, "accountActivationBlocked", "identity-blocked employees must not expose account enablement");
assertIncludes(apiClientSource, "/identity-confirmation", "the client should use the formal identity confirmation endpoint");
assertIncludes(featureWorkbenchSource, "待身份", "the employee workbench should count identity-blocked candidates separately");
assert.equal(mainSource.includes('import "./styles/features/master-data.css";'), false, "master-data styles should not load with the initial shell");
assertIncludes(masterDataRouteSource, 'import "../../styles/features/master-data.css";', "master-data route should load its styles with the workbench");
for (const selector of [
  ".master-data-template-modal",
  ".master-data-precheck-panel",
  ".master-data-review-panel",
  ".master-data-confirmation-panel",
  ".master-data-execution-panel",
  ".master-data-employee-review-panel",
  ".master-data-employee-credential",
  ".employee-assignment-audit",
  ".machine-config-workbench",
  ".machine-config-list",
]) {
  assertIncludes(masterDataStyleSource, selector, `master-data styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.match(masterDataStyleSource, /\.master-data-template-modal\s*\{[^}]*overflow-y:\s*auto;/s);
assert.match(masterDataStyleSource, /\.master-data-template-fields\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible;/s);
assert.match(masterDataStyleSource, /\.master-data-template-field-row small\s*\{[^}]*overflow:\s*visible;[^}]*white-space:\s*normal;/s);
assert.match(masterDataStyleSource, /\.master-data-template-modal > \.modal-actions\s*\{[^}]*position:\s*sticky;/s);
assert.match(masterDataStyleSource, /\.master-data-employee-review-filter-bar\s*\{[^}]*display:\s*flex;/s);
assert.match(masterDataStyleSource, /\.master-data-employee-review-filter-bar \.segmented button strong\s*\{[^}]*min-width:\s*18px;/s);

console.log("master-data maintenance page check passed: record projection, four scoped searches, employee readiness filters, safe batch selection, assignments, and workbench contracts are covered");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}
