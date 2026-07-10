export const primaryNavigationItems = Object.freeze([
  { key: "todos", label: "公共待办", icon: "dashboard" },
  { key: "entry", label: "订单录入", icon: "plus" },
  { key: "orders", label: "订单池", icon: "shoppingCart" },
  { key: "inventory", label: "库存查询", icon: "database" },
  { key: "fulfillment", label: "出库交付", icon: "inbox" },
  { key: "statements", label: "对账收款", icon: "accountBook" },
]);

export const secondaryNavigationItems = Object.freeze([
  {
    key: "packing",
    label: "打包/标签",
    icon: "unorderedList",
    permissionKeys: ["packing.complete", "fulfillment.print"],
  },
  {
    key: "rawMaterials",
    label: "原材料",
    icon: "upload",
    permissionPrefixes: ["raw_material."],
  },
  {
    key: "masterData",
    label: "基础资料",
    icon: "setting",
    permissionPrefixes: ["master_data."],
  },
  {
    key: "v1Status",
    label: "上线状态",
    icon: "checkCircle",
    permissionPrefixes: ["system.v1_"],
  },
  {
    key: "workshopMobile",
    label: "车间/打包手机端",
    icon: "appstore",
    permissionKeys: ["production.report.complete", "packing.complete"],
  },
  {
    key: "driverMobile",
    label: "司机端",
    icon: "checkCircle",
    permissionKeys: ["delivery.view", "delivery.load_confirm", "delivery.complete", "delivery.device_qa.record"],
  },
]);

export const laterNavigationItems = Object.freeze([
  { label: "排产", icon: "appstore" },
]);

export const allNavigationItems = Object.freeze([
  ...primaryNavigationItems,
  ...secondaryNavigationItems,
]);

export function getVisibleSecondaryNavigationItems(permissionContext = {}) {
  const permissions = getPermissionSet(permissionContext);
  return secondaryNavigationItems.filter((item) => navigationItemMatchesPermissions(item, permissions));
}

export function isNavigationPageVisible(pageKey, permissionContext = {}) {
  if (primaryNavigationItems.some((item) => item.key === pageKey)) return true;
  return getVisibleSecondaryNavigationItems(permissionContext).some((item) => item.key === pageKey);
}

function navigationItemMatchesPermissions(item, permissions) {
  if (item.permissionKeys?.some((permissionKey) => permissions.has(permissionKey))) return true;
  return item.permissionPrefixes?.some((prefix) => [...permissions].some((permissionKey) => permissionKey.startsWith(prefix))) ?? false;
}

function getPermissionSet(permissionContext = {}) {
  return new Set([
    ...(permissionContext.buttonPermissions ?? []),
    ...(permissionContext.actionPermissions ?? []),
  ]);
}
