import assert from "node:assert/strict";
import test from "node:test";
import { getRolePermissionSet, resolvePermissionAssignment } from "../../../../shared/auth/roleCatalog.js";
import { getVisibleRoleNavigationItems } from "../../../../src/app/navigation.js";
import { handleAttendancePayrollReadRoutes } from "../../../../server/routes/attendancePayrollRoutes.mjs";
import { createRequestAuthorizationService } from "../../../../server/services/requestAuthorizationService.mjs";
import { writeActionPermissions } from "../../../../server/writeActionPermissions.mjs";
import {
  defaultPermissionContext,
  getDefaultWorkspaceView,
  getVisiblePcNavGroups,
  getVisibleRawMaterialViews,
  getVisibleWorkspaceViews,
  hasEffectivePermission,
  navViewMap,
  pcNavGroups,
} from "../src/navigation.js";
import { completedBusinessWorkspaceIds, dedicatedWorkspaceIds } from "../src/workspaceCoverage.js";

function permissionContextFor(roleKey, displayName) {
  const permissions = getRolePermissionSet([roleKey]);
  return {
    user: { userId: `TEST-${roleKey}`, displayName, defaultRole: roleKey, roleLabel: roleKey },
    ...permissions,
  };
}

function visibleItemIds(permissionContext) {
  return getVisiblePcNavGroups(permissionContext).flatMap((group) => group.items.map((item) => item.id));
}

function visibleGroup(permissionContext, groupId) {
  return getVisiblePcNavGroups(permissionContext).find((group) => group.id === groupId);
}

test("office navigation is derived from the signed-in account permission context", () => {
  const itemIds = visibleItemIds(defaultPermissionContext);
  assert(itemIds.includes("material-receiving"));
  assert(itemIds.includes("roll-inventory"));
  assert(itemIds.includes("supplier-month-end"));
  assert(!visibleGroup(defaultPermissionContext, "materials").items.some((item) => item.id === "supplier-month-end"));
  assert(visibleGroup(defaultPermissionContext, "finance").items.some((item) => item.id === "supplier-month-end"));
  assert(!itemIds.includes("overview"));
  assert(!itemIds.includes("cost-margin"));
  assert(!itemIds.includes("accounts"));
  assert(!itemIds.includes("purchase-advice"));
  assert(!itemIds.includes("finance-todos"));
  assert(!itemIds.includes("payroll-attendance"));
  assert.equal(hasEffectivePermission(defaultPermissionContext, "payroll.preview"), false);
  assert.deepEqual(getVisibleRawMaterialViews(defaultPermissionContext), ["卷料库存", "收货录入"]);
  assert.deepEqual(getVisibleWorkspaceViews(defaultPermissionContext), [
    "公共待办", "订单录入", "订单池", "收货录入", "卷料库存", "生产任务", "打包/标签",
    "打印与设备", "出库交付", "无纺布袋", "覆膜袋", "对账收款", "供应商月结", "客户档案", "成品资料",
    "员工机台",
  ]);
  assert.equal(getDefaultWorkspaceView(defaultPermissionContext), "卷料库存");
  assert.equal(hasEffectivePermission(defaultPermissionContext, "order.create"), true);
});

for (const roleKey of ["finance", "management"]) {
  test(`${roleKey} payroll navigation requires the account's effective payroll permission`, () => {
    const account = permissionContextFor(roleKey, roleKey);
    assert(account.actionPermissions.includes("payroll.preview"));
    assert(visibleItemIds(account).includes("payroll-attendance"));
    assert(getVisibleWorkspaceViews(account).includes("工资核算"));

    const denied = {
      ...account,
      ...resolvePermissionAssignment({ roles: [roleKey], denyPermissions: ["payroll.preview"] }),
    };
    assert(!visibleItemIds(denied).includes("payroll-attendance"));
    assert(!getVisibleWorkspaceViews(denied).includes("工资核算"));
    assert(getVisibleRoleNavigationItems(denied).some((item) => item.key === "attendanceMobile"));
  });
}

test("self-attendance remains available to operational roles without granting coworker attendance or payroll", async () => {
  for (const roleKey of ["office", "warehouse", "finance", "management", "technical_operations", "maintenance", "driver", "workshop", "packing"]) {
    const account = permissionContextFor(roleKey, roleKey);
    assert(getVisibleRoleNavigationItems(account).some((item) => item.key === "attendanceMobile"), `${roleKey} keeps its own attendance entry`);
    const noSelfPermission = {
      ...account,
      ...resolvePermissionAssignment({ roles: [roleKey], denyPermissions: ["attendance.self.read"] }),
    };
    assert(!getVisibleRoleNavigationItems(noSelfPermission).some((item) => item.key === "attendanceMobile"), `${roleKey} needs an effective self-attendance permission`);
    const selfOnly = {
      ...account,
      buttonPermissions: [],
      actionPermissions: ["attendance.self.read"],
    };
    assert(!visibleItemIds(selfOnly).includes("payroll-attendance"), `${roleKey} self permission cannot expose payroll`);

    for (const [path, expectedStatus] of [
      ["/api/attendance/me?employeeId=ERP-OTHER", 200],
      ["/api/attendance/employees/ERP-OTHER", 403],
      ["/api/payroll/workbench", 403],
    ]) {
      const replies = [];
      const serviceCalls = [];
      const sendJson = (_response, status, body) => replies.push({ status, body });
      const { requireActionPermission } = createRequestAuthorizationService({ sendJson });
      const runtimeUser = { userId: account.user.userId, employeeId: `ERP-${roleKey}` };
      const handled = await handleAttendancePayrollReadRoutes({
        url: new URL(path, "http://erp.test"),
        response: {},
        workspace: { users: [runtimeUser] },
        permissionContext: selfOnly,
        authContext: { userId: runtimeUser.userId },
        writeActionPermissions,
        requireActionPermission,
        attendancePayrollService: {
          buildOwnAttendance({ authContext }) {
            serviceCalls.push(authContext.user.employeeId);
            return { employeeId: authContext.user.employeeId };
          },
          buildEmployeeAttendance() { assert.fail("Self permission must not reach coworker attendance"); },
          buildPayrollWorkbench() { assert.fail("Self permission must not reach payroll"); },
        },
        sendJson,
      });
      assert.equal(handled, true);
      assert.equal(replies.length, 1);
      assert.equal(replies[0].status, expectedStatus, `${roleKey}: ${path}`);
      assert.deepEqual(serviceCalls, expectedStatus === 200 ? [runtimeUser.employeeId] : []);
      if (expectedStatus === 403) assert.equal(replies[0].body.requiredPermission, "payroll.preview");
    }
  }
});

test("finance account sees finance work without raw-material execution menus", () => {
  const finance = permissionContextFor("finance", "财务A");
  const itemIds = visibleItemIds(finance);
  assert(itemIds.includes("order-pool"));
  assert(itemIds.includes("customer-statements"));
  assert(itemIds.includes("supplier-month-end"));
  assert(!itemIds.includes("material-receiving"));
  assert(!itemIds.includes("roll-inventory"));
  assert(!itemIds.includes("production-tasks"));
  assert.deepEqual(getVisibleRawMaterialViews(finance), []);
  assert.deepEqual(getVisibleWorkspaceViews(finance), ["订单池", "对账收款", "供应商月结", "工资核算"]);
  assert.equal(getDefaultWorkspaceView(finance), "供应商月结");
  assert.equal(hasEffectivePermission(finance, "order.create"), false);
});

test("raw-material receiving permission alone never exposes supplier month-end", () => {
  const rawMaterialOnly = {
    user: { userId: "TEST-RAW-MATERIAL", displayName: "原料录入A", defaultRole: "office", roleLabel: "原料录入" },
    roles: ["office"],
    buttonPermissions: ["raw_material.inbound.review"],
    actionPermissions: [],
  };
  const itemIds = visibleItemIds(rawMaterialOnly);
  assert(itemIds.includes("material-receiving"));
  assert(itemIds.includes("roll-inventory"));
  assert(!itemIds.includes("supplier-month-end"));
  assert.deepEqual(getVisibleWorkspaceViews(rawMaterialOnly), ["订单池", "收货录入", "卷料库存"]);
});

test("management account receives the complete desktop hierarchy", () => {
  const management = permissionContextFor("management", "管理A");
  const itemIds = visibleItemIds(management);
  for (const required of ["shared-todos", "order-entry", "roll-inventory", "production-tasks", "inventory-query", "laminated-inventory", "launch-status"]) {
    assert(itemIds.includes(required), `${required} should be visible to management`);
  }
  for (const unsupported of ["overview", "finance-todos", "purchase-advice", "cost-margin", "accounts"]) {
    assert(!itemIds.includes(unsupported), `${unsupported} is not an independently deployed PC page`);
  }
});

test("every declared desktop navigation entry resolves to a workspace", () => {
  const navItems = pcNavGroups.flatMap((group) => group.items);
  const renderedWorkspaceIds = new Set([...completedBusinessWorkspaceIds, ...dedicatedWorkspaceIds]);
  assert.equal(Object.keys(navViewMap).length, navItems.length);
  for (const item of navItems) {
    assert.equal(typeof navViewMap[item.id], "string", `${item.id} should resolve to a page`);
    assert(renderedWorkspaceIds.has(item.id), `${item.id} should have a rendered workspace`);
  }
});
