import { getRolePermissionSet } from "../../shared/auth/roleCatalog.js";

export const defaultSeedUserId = "U-OFFICE-A";

export const seedUserOptions = [
  { userId: "U-OFFICE-A", displayName: "办公室A", defaultRole: "office", roleLabel: "录单 / 对账" },
  { userId: "U-WAREHOUSE-A", displayName: "库房出库A", defaultRole: "warehouse", roleLabel: "出库 / 标签" },
  { userId: "U-FINANCE-A", displayName: "财务A", defaultRole: "finance", roleLabel: "对账 / 收款" },
  { userId: "U-MANAGER-A", displayName: "管理A", defaultRole: "management", roleLabel: "管理 / 审核", roles: ["office", "warehouse", "finance", "management"] },
  { userId: "U-TECH-A", displayName: "技术运维A", defaultRole: "technical_operations", roleLabel: "部署 / 上线" },
  { userId: "U-WORKSHOP-A", displayName: "车间A", defaultRole: "workshop", roleLabel: "制袋 / 报工", defaultMachineId: "BAG-01" },
  { userId: "U-WORKSHOP-PRINT-A", displayName: "丝印A", defaultRole: "workshop", roleLabel: "丝印 / 报工", defaultMachineId: "PRINT-01" },
  { userId: "U-PACKING-A", displayName: "打包A", defaultRole: "packing", roleLabel: "打包 / 标签", defaultMachineId: "PACK-01" },
  { userId: "U-DRIVER-A", displayName: "司机A", defaultRole: "driver", roleLabel: "送货 / 回单" },
];

const uiActionPermissions = {
  topbar: {
    新建订单: { permissionKey: "order.create", permissionType: "button" },
  },
  v1Status: {
    生成现场证据草稿: { permissionKey: "system.v1_field_evidence_intake.apply", permissionType: "action" },
    校验现场证据草稿: { permissionKey: "system.v1_field_evidence.validate", permissionType: "action" },
    当前生产环境预检: { permissionKey: "system.v1_production_env.precheck", permissionType: "action" },
    生产Env安全草稿: { permissionKey: "system.v1_production_env_setup.run", permissionType: "action" },
    生产Env真实值校验: { permissionKey: "system.v1_production_env_intake.precheck", permissionType: "action" },
    当前生产Env文件审计: { permissionKey: "system.v1_production_env_file_audit.precheck", permissionType: "action" },
    当前生产Env文件应用预检: { permissionKey: "system.v1_production_env_file_preview.precheck", permissionType: "action" },
    当前生产上线组合预检: { permissionKey: "system.v1_production_go_live.precheck", permissionType: "action" },
    生产持久化留证: { permissionKey: "system.v1_production_persistence_evidence.run", permissionType: "action" },
    第一阶段执行: { permissionKey: "system.v1_production_first_stage_execution.run", permissionType: "action" },
    第一阶段真实值DryRun: { permissionKey: "system.v1_production_first_stage_values_dry_run.precheck", permissionType: "action" },
    第一阶段真实值正式合并: { permissionKey: "system.v1_production_first_stage_values_apply.run", permissionType: "action" },
    当前持久化预检: { permissionKey: "system.v1_persistence.precheck", permissionType: "action" },
    当前附件留档预检: { permissionKey: "system.v1_attachment_retention.precheck", permissionType: "action" },
    当前司机真机预检: { permissionKey: "system.v1_driver_readiness.precheck", permissionType: "action" },
    当前运行时门禁预检: { permissionKey: "system.v1_runtime_readiness.precheck", permissionType: "action" },
    V1V2边界预检: { permissionKey: "system.v1_v2_boundary.precheck", permissionType: "action" },
    刷新V1V2差异: { permissionKey: "system.v1_v2_scope_brief.refresh", permissionType: "action" },
    刷新候选预检: { permissionKey: "system.v1_release_candidate.refresh_precheck", permissionType: "action" },
    刷新候选: { permissionKey: "system.v1_release_candidate.refresh", permissionType: "action" },
  },
  todo: {
    处理完成: { permissionKey: "todo.handle", permissionType: "action" },
    确认已查看: { permissionKey: "todo.handle", permissionType: "action" },
    重新打开: { permissionKey: "todo.handle", permissionType: "action" },
    打印标签: { permissionKey: "todo.handle", permissionType: "action" },
    打印预览: { permissionKey: "todo.handle", permissionType: "action" },
    批量打印标签: { permissionKey: "todo.handle", permissionType: "action" },
    稍后30分钟: { permissionKey: "todo.handle", permissionType: "action" },
    稍后2小时: { permissionKey: "todo.handle", permissionType: "action" },
    稍后明早: { permissionKey: "todo.handle", permissionType: "action" },
    稍后指定时间: { permissionKey: "todo.handle", permissionType: "action" },
    客户待确认: { permissionKey: "todo.handle", permissionType: "action" },
  },
  entry: {
    识别: { permissionKey: "order.draft.recognize", permissionType: "action" },
    保存草稿: { permissionKey: "order.draft.save", permissionType: "action" },
    保存并确认: { permissionKey: "order.confirm", permissionType: "action" },
    确认拆单: { permissionKey: "order.confirm", permissionType: "action" },
    拆分订单: { permissionKey: "order.draft.save", permissionType: "action" },
    作废草稿: { permissionKey: "order.draft.save", permissionType: "action" },
    作废正式单: { permissionKey: "order.void", permissionType: "action" },
    调整正式单数量: { permissionKey: "order.quantity.adjust", permissionType: "action" },
  },
  orders: {
    作废正式单: { permissionKey: "order.void", permissionType: "action" },
    调整正式单数量: { permissionKey: "order.quantity.adjust", permissionType: "action" },
  },
  inventory: {
    生成修正草稿: { permissionKey: "inventory.correction.create", permissionType: "button" },
    确认修正生效: { permissionKey: "inventory.correction.confirm", permissionType: "button" },
  },
  masterData: {
    生成维护草稿: { permissionKey: "master_data.import.plan.create", permissionType: "action" },
    生成执行记录: { permissionKey: "master_data.import.execute", permissionType: "action" },
    正式导入: { permissionKey: "master_data.import.execute", permissionType: "action" },
    下载失败行: { permissionKey: "master_data.import.plan.create", permissionType: "action" },
    生成修正草稿: { permissionKey: "master_data.import.plan.create", permissionType: "action" },
    刷新员工复核: { permissionKey: "master_data.employee_account.review", permissionType: "action" },
    复核启用员工账号: { permissionKey: "master_data.employee_account.review", permissionType: "action" },
    保存员工调配: { permissionKey: "master_data.employee_account.review", permissionType: "action" },
    发放员工临时密码: { permissionKey: "master_data.employee_account.password.issue", permissionType: "action" },
    撤销员工密码: { permissionKey: "master_data.employee_account.password.issue", permissionType: "action" },
  },
  rawMaterial: {
    复核送货单: { permissionKey: "raw_material.inbound.review", permissionType: "action" },
    打印卷标: { permissionKey: "raw_material.label.print", permissionType: "action" },
    确认贴标入库: { permissionKey: "raw_material.label.attach_confirm", permissionType: "action" },
    机边领料: { permissionKey: "raw_material.issue.create", permissionType: "action" },
    确认消耗: { permissionKey: "raw_material.consumption.confirm", permissionType: "action" },
    余料退回: { permissionKey: "raw_material.leftover.return", permissionType: "action" },
    复核余料可用: { permissionKey: "raw_material.leftover.review", permissionType: "action" },
    标记异常: { permissionKey: "raw_material.exception.create", permissionType: "action" },
    查看成本: { permissionKey: "raw_material.cost.view", permissionType: "action" },
    生成成本草稿: { permissionKey: "raw_material.cost.allocate", permissionType: "action" },
    确认成本草稿: { permissionKey: "raw_material.cost.confirm", permissionType: "action" },
    校准损耗: { permissionKey: "raw_material.cost.calibrate", permissionType: "action" },
    生成毛利快照: { permissionKey: "raw_material.margin.snapshot", permissionType: "action" },
    复核毛利快照: { permissionKey: "raw_material.margin.review", permissionType: "action" },
    生成应付: { permissionKey: "raw_material.supplier_payable.create", permissionType: "action" },
    确认付款: { permissionKey: "raw_material.supplier_payment.confirm", permissionType: "action" },
  },
  fulfillment: {
    数量不符: { permissionKey: "fulfillment.exception.create", permissionType: "action" },
    无法出库: { permissionKey: "fulfillment.exception.create", permissionType: "action" },
    打印标签: { permissionKey: "fulfillment.print", permissionType: "action" },
    重打标签: { permissionKey: "fulfillment.print", permissionType: "action" },
    作废旧标签: { permissionKey: "fulfillment.print", permissionType: "action" },
    作废旧单据: { permissionKey: "fulfillment.print", permissionType: "action" },
    编辑派单: { permissionKey: "fulfillment.dispatch.update", permissionType: "action" },
    打印预览: { permissionKey: "fulfillment.print", permissionType: "action" },
    打印自提单: { permissionKey: "fulfillment.print", permissionType: "action" },
    重打自提单: { permissionKey: "fulfillment.print", permissionType: "action" },
    打印送货单: { permissionKey: "fulfillment.print", permissionType: "action" },
    重打送货单: { permissionKey: "fulfillment.print", permissionType: "action" },
    标记已备货: { permissionKey: "fulfillment.complete", permissionType: "action" },
    完成出库交付: { permissionKey: "fulfillment.complete", permissionType: "action" },
    "完成出库/交付": { permissionKey: "fulfillment.complete", permissionType: "action" },
    完成自提: { permissionKey: "fulfillment.complete", permissionType: "action" },
    完成送货: { permissionKey: "fulfillment.complete", permissionType: "action" },
    确认已拉走: { permissionKey: "fulfillment.pickup.confirm", permissionType: "action" },
    查看水印照片: { permissionKey: "attachment.view", permissionType: "action" },
    查看签收照片: { permissionKey: "attachment.view", permissionType: "action" },
    证据复核通过: { permissionKey: "delivery.evidence.review", permissionType: "action" },
    退回重拍: { permissionKey: "delivery.evidence.review", permissionType: "action" },
    取消出库: { permissionKey: "fulfillment.cancel", permissionType: "action" },
  },
  productionPacking: {
    发布排产: { permissionKey: "production.schedule.publish", permissionType: "action" },
    上移排产: { permissionKey: "production.schedule.sequence.update", permissionType: "action" },
    下移排产: { permissionKey: "production.schedule.sequence.update", permissionType: "action" },
    调整排产顺序: { permissionKey: "production.schedule.sequence.update", permissionType: "action" },
    移动排产任务: { permissionKey: "production.schedule.sequence.update", permissionType: "action" },
    移动排产机台: { permissionKey: "production.schedule.sequence.update", permissionType: "action" },
    报当日数量: { permissionKey: "production.report.complete", permissionType: "action" },
    报工完成: { permissionKey: "production.report.complete", permissionType: "action" },
    上传成品图: { permissionKey: "production.report.complete", permissionType: "action" },
    确认成品图: { permissionKey: "production.schedule.publish", permissionType: "action" },
    退回成品图: { permissionKey: "production.schedule.publish", permissionType: "action" },
    提交打包完成: { permissionKey: "packing.complete", permissionType: "action" },
    保存设备模式: { permissionKey: "fulfillment.print", permissionType: "action" },
    保存打印验收: { permissionKey: "print.device_qa.record", permissionType: "action" },
    派发打印作业: { permissionKey: "fulfillment.print", permissionType: "action" },
    重试打印作业: { permissionKey: "fulfillment.print", permissionType: "action" },
  },
  workshopMobile: {
    报当日数量: { permissionKey: "production.report.complete", permissionType: "action" },
    报工完成: { permissionKey: "production.report.complete", permissionType: "action" },
    上传成品图: { permissionKey: "production.report.complete", permissionType: "action" },
    提交打包完成: { permissionKey: "packing.complete", permissionType: "action" },
  },
  driverMobile: {
    保存验收: { permissionKey: "delivery.device_qa.record", permissionType: "action" },
    确认已装车: { permissionKey: "delivery.load_confirm", permissionType: "action" },
    提交送达: { permissionKey: "delivery.complete", permissionType: "action" },
    装车异常: { permissionKey: "delivery.exception.create", permissionType: "action" },
    送货异常: { permissionKey: "delivery.exception.create", permissionType: "action" },
  },
  statements: {
    生成对账单预览: { permissionKey: "statement.preview", permissionType: "button" },
    导出占位: { permissionKey: "statement.preview", permissionType: "button" },
    导出Excel: { permissionKey: "statement.preview", permissionType: "button" },
    刷新导出记录: { permissionKey: "statement.preview", permissionType: "button" },
    下载导出文件: { permissionKey: "statement.preview", permissionType: "button" },
    查看付款凭证: { permissionKey: "attachment.view", permissionType: "action" },
    查看客户确认附件: { permissionKey: "attachment.view", permissionType: "action" },
    标记已发送: { permissionKey: "statement.send", permissionType: "action" },
    标记已读回执: { permissionKey: "statement.send", permissionType: "action" },
    登记客户确认: { permissionKey: "statement.send", permissionType: "action" },
    登记实收: { permissionKey: "statement.payment.record", permissionType: "action" },
    差额待确认: { permissionKey: "statement.variance.handle", permissionType: "action" },
    确认核销: { permissionKey: "statement.write_off", permissionType: "action" },
  },
};

export function getSeedPermissionContext(userId = defaultSeedUserId) {
  const user = seedUserOptions.find((item) => item.userId === userId) ?? seedUserOptions[0];
  const {
    roles: roleKeys,
    buttonPermissions,
    actionPermissions,
  } = getRolePermissionSet(user.roles?.length ? user.roles : [user.defaultRole]);

  return {
    user: {
      userId: user.userId,
      displayName: user.displayName,
      defaultRole: user.defaultRole,
      defaultMachineId: user.defaultMachineId ?? "",
      enabled: true,
    },
    roles: roleKeys,
    buttonPermissions,
    actionPermissions,
  };
}

export function getUiActionPermission(surface, action) {
  return uiActionPermissions[surface]?.[action] ?? null;
}

export function canUseUiAction(permissionContext, surface, action) {
  const requirement = getUiActionPermission(surface, action);
  if (!requirement) return true;
  return hasPermission(permissionContext, requirement);
}

export function getUiActionState(permissionContext, surface, action) {
  const requirement = getUiActionPermission(surface, action);
  if (!requirement || hasPermission(permissionContext, requirement)) {
    return { disabled: false, title: "" };
  }
  return {
    disabled: true,
    title: `当前账号缺少权限：${requirement.permissionKey}`,
    permissionKey: requirement.permissionKey,
  };
}

export function getPermissionDeniedText(permissionContext, surface, action) {
  const requirement = getUiActionPermission(surface, action);
  const displayName = permissionContext.user?.displayName ?? "当前账号";
  return requirement ? `${displayName} 缺少权限 ${requirement.permissionKey}，不能执行「${action}」。` : "";
}

function hasPermission(permissionContext, requirement) {
  const pool =
    requirement.permissionType === "button"
      ? permissionContext.buttonPermissions
      : permissionContext.actionPermissions;
  return pool?.includes(requirement.permissionKey);
}
