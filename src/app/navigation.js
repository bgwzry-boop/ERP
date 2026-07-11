export const primaryNavigationItems = Object.freeze([
  { key: "todos", label: "公共待办", icon: "dashboard", description: "共享待办池，按急单、异常、最晚要货和等待时长排序。" },
  { key: "entry", label: "订单录入", icon: "plus", description: "整段粘贴或手动输入客户消息，规则识别后在表格里修正。" },
  { key: "orders", label: "订单池", icon: "shoppingCart", description: "按订单明细查询状态、库存、生产、交付、对账和操作记录。" },
  { key: "inventory", label: "库存查询", icon: "database", description: "按尺寸、颜色、提手、款式、库区和状态精确查询可用库存。" },
  { key: "fulfillment", label: "出库交付", icon: "inbox", description: "统一处理自提、送货、快递快运的出库和交付确认。" },
  { key: "statements", label: "对账收款", icon: "accountBook", description: "按客户生成对账、登记实收、处理差额和欠款。" },
]);

export const secondaryNavigationItems = Object.freeze([
  {
    key: "packing",
    label: "打包/标签",
    icon: "unorderedList",
    description: "生产报工入库、生成打包任务、提交包裹明细并进入标签和出库下一步。",
    permissionKeys: ["packing.complete", "fulfillment.print"],
  },
  {
    key: "rawMaterials",
    label: "原材料",
    icon: "upload",
    description: "原材料送货单 OCR 预填、人工复核、一卷一标、贴标扫码后进入可用库存。",
    permissionPrefixes: ["raw_material."],
  },
  {
    key: "masterData",
    label: "基础资料",
    icon: "setting",
    description: "维护客户、价格、规格库存和员工机台资料，草稿复核后进入正式导入。",
    permissionPrefixes: ["master_data."],
  },
  {
    key: "v1Status",
    label: "上线状态",
    icon: "checkCircle",
    description: "展示 V1 完成度、发布阻塞、模块就绪度和现场验收状态。",
    permissionPrefixes: ["system.v1_"],
  },
  {
    key: "workshopMobile",
    label: "车间/打包手机端",
    icon: "appstore",
    description: "按岗位展示车间报工和打包任务，手机端动作写入同一套 API。",
    permissionKeys: ["production.report.complete", "packing.complete"],
  },
  {
    key: "driverMobile",
    label: "司机端",
    icon: "checkCircle",
    description: "司机查看送货任务，确认装车、提交水印照片和回单状态。",
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
