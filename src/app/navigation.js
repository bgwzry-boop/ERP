import { RAW_MATERIAL_FIRST_RELEASE_ENABLED } from "../config/rawMaterialFirstRelease.js";

export const primaryNavigationItems = Object.freeze([
  { key: "todos", label: "公共待办", icon: "dashboard", description: "共享待办池，按急单、今天要发、异常和等待时长排序。", allowedRoleKeys: ["office", "management", "finance"] },
  { key: "entry", label: "订单录入", icon: "plus", description: "整段粘贴或手动输入客户消息，规则识别后在表格里修正。", allowedRoleKeys: ["office", "management"] },
  { key: "orders", label: "订单池", icon: "shoppingCart", description: "按订单明细查询状态、库存、生产、交付、对账和操作记录。", allowedRoleKeys: ["office", "management", "finance"] },
  { key: "inventory", label: "库存查询", icon: "database", description: "按尺寸、颜色、提手、款式、库区和状态精确查询可用库存。", allowedRoleKeys: ["office", "management"] },
  { key: "fulfillment", label: "出库交付", icon: "inbox", description: "由办公室准备纸质出库指令、回录实物执行并跟踪最终交付。", allowedRoleKeys: ["office", "management"] },
  { key: "statements", label: "对账收款", icon: "accountBook", description: "按客户生成对账、登记到账线索，并由授权账号完成正式收款和核销。", allowedRoleKeys: ["office", "management", "finance"] },
]);

export const secondaryNavigationItems = Object.freeze([
  {
    key: "packing",
    label: "打包/标签",
    icon: "unorderedList",
    description: "办公室排产调度、打包跟进、可信打印和设备管理工作台。",
    allowedRoleKeys: ["office", "management"],
    permissionKeys: ["packing.complete", "fulfillment.print"],
  },
  {
    key: "rawMaterials",
    label: "原材料",
    icon: "upload",
    description: "送货单 OCR 复核、一卷一标、逐卷实物核对、库存与供应商账务。",
    allowedRoleKeys: ["office", "management", "finance"],
    permissionPrefixes: ["raw_material."],
  },
  {
    key: "masterData",
    label: "基础资料",
    icon: "setting",
    description: "维护客户、价格、规格库存和员工机台资料，草稿复核后进入正式导入。",
    allowedRoleKeys: ["office", "management"],
    permissionPrefixes: ["master_data."],
  },
  {
    key: "payroll",
    label: "工资核算",
    icon: "accountBook",
    description: "按真实考勤、已发布计薪规则和员工工资档案生成、复核、锁定工资批次。",
    allowedRoleKeys: ["management", "finance"],
    permissionPrefixes: ["payroll."],
  },
  {
    key: "v1Status",
    label: "上线状态",
    icon: "checkCircle",
    description: "展示 V1 完成度、发布阻塞、模块就绪度和现场验收状态。",
    allowedRoleKeys: ["management", "technical_operations"],
    permissionPrefixes: ["system.v1_"],
  },
]);

export const roleNavigationItems = Object.freeze([
  {
    key: "attendanceMobile",
    label: "我的考勤",
    icon: "checkCircle",
    description: "员工仅查看本人每日打卡时间、确认工时和截至当前的月度工资预估。",
    allowedRoleKeys: ["office", "management", "finance", "technical_operations", "maintenance", "warehouse", "driver", "workshop", "packing"],
    permissionKeys: ["attendance.self.read"],
  },
  {
    key: "officeMobile",
    label: "办公室手机",
    icon: "dashboard",
    description: "离开电脑后完成原材料拍单、整单核对、卷标打印和现场逐卷贴标。",
    allowedRoleKeys: ["office"],
    permissionKeys: ["raw_material.inbound.review", "raw_material.label.print", "raw_material.label.attach_confirm"],
  },
  {
    key: "decisionMobile",
    label: "经营决策",
    icon: "checkCircle",
    description: "查看待决策事项、关键证据和权限范围，在手机上进入正式确认。",
    allowedRoleKeys: ["decision_maker"],
    permissionKeys: ["business_decision.act_directly"],
  },
  {
    key: "maintenanceMobile",
    label: "设备机修",
    icon: "setting",
    description: "查看设备报修、巡检和维护任务，记录照片、发现和处理结果。",
    allowedRoleKeys: ["maintenance"],
    permissionKeys: ["maintenance.task.read", "maintenance.task.update"],
  },
  {
    key: "rawMaterialScanner",
    label: "原料扫码",
    icon: "upload",
    description: "原材料经手人扫描一卷可用卷标，登记去向机台或区域后完成机边领料。",
    allowedRoleKeys: ["workshop", "packing"],
    permissionKeys: ["raw_material.issue.create"],
  },
  {
    key: "warehouseMobile",
    label: "成品库房",
    icon: "inbox",
    description: "查看已打印出库任务，先备货，再凭当前纸质出库单核对并回录实物出库。",
    allowedRoleKeys: ["warehouse"],
    permissionKeys: ["fulfillment.warehouse.execute"],
  },
  {
    key: "workshopMobile",
    label: "现场任务",
    icon: "appstore",
    description: "按正式岗位直接进入制袋、丝印或打包手机任务，不显示办公室菜单。",
    allowedRoleKeys: ["workshop", "packing"],
    permissionKeys: ["production.report.complete", "packing.complete"],
  },
  {
    key: "driverMobile",
    label: "司机端",
    icon: "checkCircle",
    description: "司机查看送货任务，确认装车、提交水印照片和回单状态。",
    allowedRoleKeys: ["driver"],
    permissionKeys: ["delivery.view", "delivery.load_confirm", "delivery.complete", "delivery.device_qa.record"],
  },
]);

export const primaryNavigationGroups = Object.freeze([
  Object.freeze({ key: "workspace", label: "今日工作", icon: "dashboard", itemKeys: Object.freeze(["todos"]) }),
  Object.freeze({ key: "orders", label: "订单", icon: "shoppingCart", itemKeys: Object.freeze(["entry", "orders"]) }),
  Object.freeze({ key: "stockDelivery", label: "库存交付", icon: "database", itemKeys: Object.freeze(["inventory", "fulfillment"]) }),
  Object.freeze({ key: "accounts", label: "对账", icon: "accountBook", itemKeys: Object.freeze(["statements"]) }),
]);

export const toolNavigationGroup = Object.freeze({
  key: "moreWorkbenches",
  label: "更多工作台",
  icon: "appstore",
  itemKeys: Object.freeze(["packing", "rawMaterials", "masterData", "payroll", "v1Status"]),
});

export const roleBoundaryPage = Object.freeze({
  key: "roleBoundary",
  label: "当前岗位",
  description: "当前岗位没有桌面 ERP 操作菜单；请按现场纸单或已配置的岗位终端执行。",
});

export const desktopRequiredMobilePage = Object.freeze({
  key: "desktopRequiredMobile",
  label: "请使用电脑端",
  description: "该岗位的完整工作台需要在受控办公室电脑上使用，手机端不提供桌面页面的压缩副本。",
});

export const laterNavigationItems = Object.freeze([
  { label: "排产", icon: "appstore" },
]);

export const allNavigationItems = Object.freeze([
  ...primaryNavigationItems,
  ...secondaryNavigationItems,
  ...roleNavigationItems,
  desktopRequiredMobilePage,
  roleBoundaryPage,
]);

export function getVisiblePrimaryNavigationItems(permissionContext = {}) {
  if (RAW_MATERIAL_FIRST_RELEASE_ENABLED) return [];
  const roles = getRoleSet(permissionContext);
  return primaryNavigationItems.filter((item) => navigationItemMatchesRoles(item, roles));
}

export function getVisibleSecondaryNavigationItems(permissionContext = {}) {
  const permissions = getPermissionSet(permissionContext);
  const roles = getRoleSet(permissionContext);
  return secondaryNavigationItems.filter((item) => (
    (!RAW_MATERIAL_FIRST_RELEASE_ENABLED || item.key === "rawMaterials") &&
    navigationItemMatchesRoles(item, roles) && navigationItemMatchesPermissions(item, permissions)
  ));
}

export function getVisibleRoleNavigationItems(permissionContext = {}) {
  const permissions = getPermissionSet(permissionContext);
  const roles = getRoleSet(permissionContext);
  return roleNavigationItems.filter((item) => (
    (!RAW_MATERIAL_FIRST_RELEASE_ENABLED || item.key === "rawMaterialScanner") &&
    navigationItemMatchesRoles(item, roles) && navigationItemMatchesPermissions(item, permissions)
  ));
}

export function getVisibleNavigationItems(permissionContext = {}) {
  return [
    ...getVisiblePrimaryNavigationItems(permissionContext),
    ...getVisibleSecondaryNavigationItems(permissionContext),
    ...getVisibleRoleNavigationItems(permissionContext),
  ];
}

export function getVisibleNavigationGroups(permissionContext = {}) {
  const visiblePrimaryItems = getVisiblePrimaryNavigationItems(permissionContext);
  const visibleToolItems = getVisibleSecondaryNavigationItems(permissionContext);
  const primaryByKey = new Map(visiblePrimaryItems.map((item) => [item.key, item]));
  const toolsByKey = new Map(visibleToolItems.map((item) => [item.key, item]));
  const primaryGroups = primaryNavigationGroups
    .map((group) => ({
      ...group,
      kind: "primary",
      items: group.itemKeys.map((key) => primaryByKey.get(key)).filter(Boolean),
    }))
    .filter((group) => group.items.length > 0);
  const toolItems = toolNavigationGroup.itemKeys.map((key) => toolsByKey.get(key)).filter(Boolean);
  if (toolItems.length === 0) return primaryGroups;
  return [
    ...primaryGroups,
    { ...toolNavigationGroup, kind: "tools", items: toolItems },
  ];
}

export function getNavigationGroupForPage(pageKey, permissionContext = {}) {
  return getVisibleNavigationGroups(permissionContext).find((group) => (
    group.items.some((item) => item.key === pageKey)
  )) ?? null;
}

export function getDefaultNavigationPage(permissionContext = {}) {
  const roles = getRoleSet(permissionContext);
  const defaultRole = permissionContext.user?.defaultRole;
  if (RAW_MATERIAL_FIRST_RELEASE_ENABLED && (roles.has("office") || roles.has("management") || roles.has("finance"))) {
    return "rawMaterials";
  }
  if (defaultRole === "office" || defaultRole === "management") return "todos";
  if (defaultRole === "finance") return "statements";
  if (defaultRole === "technical_operations") return "v1Status";
  if (defaultRole === "decision_maker") return "decisionMobile";
  if (defaultRole === "maintenance") return "maintenanceMobile";
  if (defaultRole === "warehouse") return "warehouseMobile";
  if (defaultRole === "driver") return "driverMobile";
  if (defaultRole === "workshop" || defaultRole === "packing") return "workshopMobile";
  return roleBoundaryPage.key;
}

export function getMobileRoleTitle(pageKey, currentUser = {}) {
  if (pageKey === "attendanceMobile") return "我的考勤";
  if (pageKey === "officeMobile" || pageKey === "rawMaterials") return "办公室手机";
  if (pageKey === "driverMobile") return "司机任务";
  if (pageKey === "warehouseMobile") return "成品库房任务";
  if (pageKey === "rawMaterialScanner") return "原材料扫码出库";
  if (pageKey === "decisionMobile") return "经营决策";
  if (pageKey === "maintenanceMobile") return "设备机修";
  if (pageKey === desktopRequiredMobilePage.key) return "电脑端岗位";
  if (pageKey === roleBoundaryPage.key) {
    return currentUser.defaultRole === "warehouse" ? "纸质出库说明" : "岗位说明";
  }
  if (currentUser.defaultRole === "packing") return "打包任务";
  if (String(currentUser.defaultMachineId || "").startsWith("PRINT-")) return "丝印任务";
  return "制袋任务";
}

export function getMobileRoleHomePage(currentUser = {}) {
  if (currentUser.defaultRole === "office") return "rawMaterials";
  if (currentUser.defaultRole === "decision_maker") return "decisionMobile";
  if (currentUser.defaultRole === "maintenance") return "maintenanceMobile";
  if (currentUser.defaultRole === "warehouse") return "warehouseMobile";
  if (currentUser.defaultRole === "driver") return "driverMobile";
  if (currentUser.defaultRole === "workshop" || currentUser.defaultRole === "packing") return "workshopMobile";
  return desktopRequiredMobilePage.key;
}

export function isNavigationPageVisible(pageKey, permissionContext = {}) {
  if (pageKey === roleBoundaryPage.key) return getVisibleNavigationItems(permissionContext).length === 0;
  return getVisibleNavigationItems(permissionContext).some((item) => item.key === pageKey);
}

export function isDedicatedMobileRolePage(pageKey) {
  return pageKey === "attendanceMobile" || pageKey === "officeMobile" || pageKey === "workshopMobile" || pageKey === "driverMobile" || pageKey === "rawMaterialScanner" || pageKey === "warehouseMobile" || pageKey === "decisionMobile" || pageKey === "maintenanceMobile" || pageKey === desktopRequiredMobilePage.key;
}

export function getMobileViewportPage(activePage, permissionContext = {}) {
  const defaultRole = permissionContext.user?.defaultRole;
  if (activePage === "attendanceMobile" && isNavigationPageVisible("attendanceMobile", permissionContext)) return "attendanceMobile";
  if (defaultRole === "office") return "rawMaterials";
  if (defaultRole === "decision_maker") return "decisionMobile";
  if (defaultRole === "maintenance") return "maintenanceMobile";
  if (defaultRole === "warehouse") return "warehouseMobile";
  if (defaultRole === "driver") return "driverMobile";
  if (defaultRole === "workshop" || defaultRole === "packing") {
    return activePage === "rawMaterialScanner" ? "rawMaterialScanner" : "workshopMobile";
  }
  if (["management", "finance", "technical_operations"].includes(defaultRole)) return desktopRequiredMobilePage.key;
  return roleBoundaryPage.key;
}

function navigationItemMatchesPermissions(item, permissions) {
  if (item.permissionKeys?.some((permissionKey) => permissions.has(permissionKey))) return true;
  return item.permissionPrefixes?.some((prefix) => [...permissions].some((permissionKey) => permissionKey.startsWith(prefix))) ?? false;
}

function navigationItemMatchesRoles(item, roles) {
  if (!item.allowedRoleKeys?.length) return true;
  return item.allowedRoleKeys.some((roleKey) => roles.has(roleKey));
}

function getRoleSet(permissionContext = {}) {
  return new Set([
    ...(permissionContext.roles ?? []),
    permissionContext.user?.defaultRole,
  ].filter(Boolean));
}

function getPermissionSet(permissionContext = {}) {
  return new Set([
    ...(permissionContext.buttonPermissions ?? []),
    ...(permissionContext.actionPermissions ?? []),
  ]);
}
