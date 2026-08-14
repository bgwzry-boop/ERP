import { getRolePermissionSet } from "../../../../shared/auth/roleCatalog.js";

const officePermissions = getRolePermissionSet(["office"]);

export const defaultPermissionContext = Object.freeze({
  user: Object.freeze({
    userId: "U-OFFICE-A",
    displayName: "办公室A",
    defaultRole: "office",
    roleLabel: "录单 / 对账",
    enabled: true,
  }),
  roles: Object.freeze([...officePermissions.roles]),
  buttonPermissions: Object.freeze([...officePermissions.buttonPermissions]),
  actionPermissions: Object.freeze([...officePermissions.actionPermissions]),
});

export const pcNavGroups = [
  {
    id: "workbench",
    label: "工作台",
    icon: "home",
    items: [
      { id: "shared-todos", label: "公共待办", allowedRoleKeys: ["office", "management"], permissionKeys: ["todo.handle"], count: 8 },
    ],
  },
  {
    id: "orders",
    label: "订单管理",
    icon: "orders",
    items: [
      { id: "order-entry", label: "订单录入", allowedRoleKeys: ["office", "management"], permissionKeys: ["order.create", "order.draft.save"] },
      { id: "order-pool", label: "订单池", allowedRoleKeys: ["office", "management", "finance"] },
    ],
  },
  {
    id: "materials",
    label: "原料管理",
    icon: "materials",
    items: [
      { id: "material-receiving", label: "收货录入", allowedRoleKeys: ["office", "management"], permissionKeys: ["raw_material.inbound.review"] },
      { id: "roll-inventory", label: "卷料库存", allowedRoleKeys: ["office", "management"], permissionPrefixes: ["raw_material."] },
    ],
  },
  {
    id: "production",
    label: "生产交付",
    icon: "production",
    items: [
      { id: "production-tasks", label: "生产任务", allowedRoleKeys: ["office", "management"], permissionKeys: ["production.schedule.publish"] },
      { id: "packing-labels", label: "打包/标签", allowedRoleKeys: ["office", "management"], permissionKeys: ["packing.complete"] },
      { id: "print-devices", label: "打印与设备", allowedRoleKeys: ["office", "management"], permissionKeys: ["fulfillment.print"] },
      { id: "outbound-delivery", label: "出库交付", allowedRoleKeys: ["office", "management"], permissionKeys: ["fulfillment.dispatch.update", "fulfillment.complete"] },
    ],
  },
  {
    id: "inventory",
    label: "库存管理",
    icon: "inventory",
    items: [
      { id: "inventory-query", label: "无纺布袋", allowedRoleKeys: ["office", "management"], permissionKeys: ["inventory.lookup", "inventory.correction.create", "inventory.correction.confirm"] },
      { id: "laminated-inventory", label: "覆膜袋", allowedRoleKeys: ["office", "management"], permissionKeys: ["inventory.lookup", "inventory.correction.create", "inventory.correction.confirm"] },
    ],
  },
  {
    id: "finance",
    label: "财务管理",
    icon: "finance",
    items: [
      { id: "customer-statements", label: "对账收款", allowedRoleKeys: ["office", "management", "finance"], permissionKeys: ["statement.preview"] },
      { id: "supplier-month-end", label: "供应商月结", allowedRoleKeys: ["office", "management", "finance"], permissionKeys: ["statement.preview", "raw_material.supplier_payable.create"] },
      { id: "payroll-attendance", label: "工资核算", allowedRoleKeys: ["office", "management", "finance"], permissionKeys: ["statement.preview"] },
    ],
  },
  {
    id: "master-data",
    label: "基础资料",
    icon: "master",
    items: [
      { id: "customer-records", label: "客户档案", allowedRoleKeys: ["office", "management"], permissionKeys: ["master_data.import.plan.create"] },
      { id: "general-prices", label: "成品资料", allowedRoleKeys: ["office", "management"], permissionKeys: ["master_data.import.plan.create"] },
      { id: "people-machines", label: "员工机台", allowedRoleKeys: ["office", "management"], permissionKeys: ["master_data.import.plan.create"] },
    ],
  },
  {
    id: "system",
    label: "系统管理",
    icon: "system",
    items: [
      { id: "launch-status", label: "上线状态", allowedRoleKeys: ["management"], permissionPrefixes: ["system.v1_"] },
    ],
  },
];

export const navViewMap = Object.freeze({
  "shared-todos": "公共待办",
  "order-entry": "订单录入",
  "order-pool": "订单池",
  "material-receiving": "收货录入",
  "roll-inventory": "卷料库存",
  "production-tasks": "生产任务",
  "packing-labels": "打包/标签",
  "print-devices": "打印与设备",
  "outbound-delivery": "出库交付",
  "inventory-query": "无纺布袋",
  "laminated-inventory": "覆膜袋",
  "customer-statements": "对账收款",
  "supplier-month-end": "供应商月结",
  "payroll-attendance": "工资核算",
  "customer-records": "客户档案",
  "general-prices": "成品资料",
  "people-machines": "员工机台",
  "launch-status": "上线状态",
});

export const viewNavMap = Object.freeze(
  Object.fromEntries(Object.entries(navViewMap).map(([navId, view]) => [view, navId])),
);

const rawMaterialViewNames = Object.freeze(["卷料库存", "收货录入"]);

export function getVisiblePcNavGroups(permissionContext = {}) {
  return pcNavGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => navigationItemMatchesAccount(item, permissionContext)),
  })).filter((group) => group.items.length);
}

export function getVisibleWorkspaceViews(permissionContext = {}) {
  const allowedNavIds = new Set(getVisiblePcNavGroups(permissionContext).flatMap((group) => group.items.map((item) => item.id)));
  return Object.entries(navViewMap).filter(([navId]) => allowedNavIds.has(navId)).map(([, view]) => view);
}

export function getVisibleRawMaterialViews(permissionContext = {}) {
  const visibleViews = new Set(getVisibleWorkspaceViews(permissionContext));
  return rawMaterialViewNames.filter((view) => visibleViews.has(view));
}

export function getDefaultWorkspaceView(permissionContext = {}) {
  const visibleViews = new Set(getVisibleWorkspaceViews(permissionContext));
  const roles = new Set([
    ...(permissionContext.roles ?? []),
    permissionContext.user?.defaultRole,
  ].filter(Boolean));
  if (roles.has("finance") && !roles.has("office") && visibleViews.has("供应商月结")) return "供应商月结";
  if (visibleViews.has("卷料库存")) return "卷料库存";
  if (visibleViews.has("供应商月结")) return "供应商月结";
  if (visibleViews.has("收货录入")) return "收货录入";
  return "卷料库存";
}

export function hasEffectivePermission(permissionContext = {}, permissionKey) {
  return new Set([
    ...(permissionContext.buttonPermissions ?? []),
    ...(permissionContext.actionPermissions ?? []),
  ]).has(permissionKey);
}

function navigationItemMatchesAccount(item, permissionContext) {
  const roles = new Set([
    ...(permissionContext.roles ?? []),
    permissionContext.user?.defaultRole,
  ].filter(Boolean));
  const permissions = new Set([
    ...(permissionContext.buttonPermissions ?? []),
    ...(permissionContext.actionPermissions ?? []),
  ]);
  const roleMatches = !item.allowedRoleKeys?.length || item.allowedRoleKeys.some((roleKey) => roles.has(roleKey));
  const hasPermissionRule = Boolean(item.permissionKeys?.length || item.permissionPrefixes?.length);
  const permissionMatches = !hasPermissionRule ||
    item.permissionKeys?.some((permissionKey) => permissions.has(permissionKey)) ||
    item.permissionPrefixes?.some((prefix) => [...permissions].some((permissionKey) => permissionKey.startsWith(prefix)));
  return roleMatches && Boolean(permissionMatches);
}
