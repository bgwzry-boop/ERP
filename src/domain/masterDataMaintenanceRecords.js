export function buildMasterDataMaintenanceRecords(input) {
  if (input.tab === "价格表") return buildMasterDataPriceRecords(input);
  if (input.tab === "规格库存") return buildMasterDataInventoryRecords(input);
  if (input.tab === "员工机台") return buildMasterDataEmployeeMachineRecords(input);
  return buildMasterDataCustomerRecords(input);
}

function buildMasterDataCustomerRecords({ customers = [], statements = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  return customers.map((customer) => {
    const customerStatements = statements.filter((statement) => statement.customerId === customer.id);
    const pendingAmount = customerStatements.reduce((total, statement) => total + Number(statement.variance || 0), 0);
    const debt = Number(customer.debt || 0);
    const statusLabel = debt > 0 || pendingAmount > 0 ? "需财务关注" : "正常";
    return {
      id: customer.id,
      label: customer.name,
      statusLabel,
      tone: debt > 0 || pendingAmount > 0 ? "warning" : "success",
      cells: [customer.name, customer.cycle, customer.contact, customer.phone, money(debt), (customer.tags ?? []).join(" / ")],
      detailRows: [
        ["客户编号", customer.id],
        ["联系人", `${customer.contact} ${customer.phone}`],
        ["结算周期", customer.cycle],
        ["地址", customer.address],
        ["应收/欠款", `${money(customer.receivable || 0)} / ${money(debt)}`],
        ["最近对账", customer.lastStatement || "未记录"],
      ],
      fields: [
        { key: "cycle", label: "结算周期", currentValue: customer.cycle },
        { key: "contact", label: "联系人", currentValue: customer.contact },
        { key: "phone", label: "联系电话", currentValue: customer.phone },
        { key: "address", label: "地址", currentValue: customer.address },
        { key: "tags", label: "客户标签", currentValue: (customer.tags ?? []).join("，") },
      ],
      searchText: [customer.id, customer.name, customer.cycle, customer.contact, customer.phone, customer.address, ...(customer.tags ?? [])].join(" "),
      reviewRule: "客户资料影响接单、对账和欠款提醒，保存后先进入维护草稿；结算周期、收货地址和手机号变更需要办公室或管理复核。",
    };
  });
}

function buildMasterDataPriceRecords({ orderLines = [], customers = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  const getLineColorSpecLabel = helpers.getLineColorSpecLabel ?? (() => "");
  const getLinePrintSide = helpers.getLinePrintSide ?? (() => "");
  const getLineRemark = helpers.getLineRemark ?? (() => "");
  return orderLines.map((line) => {
    const customer = customers.find((item) => item.id === line.customerId);
    const qty = Number(line.qty || line.originalQty || 0);
    const amount = Number(line.amount || 0);
    const unitPrice = qty > 0 ? amount / qty : 0;
    const printSide = getLinePrintSide(line) || (line.print === "是" ? "印刷" : "无印刷");
    const colorSpec = getLineColorSpecLabel(line) || [line.color, line.handle].filter(Boolean).join(" / ");
    const remark = getLineRemark(line);
    const label = `${line.product} ${line.size} ${colorSpec}`;
    return {
      id: `PRICE-${line.id}`,
      label,
      statusLabel: line.orderType || "订单快照",
      tone: line.orderType === "定制印刷" ? "warning" : "neutral",
      cells: [line.product, line.size, colorSpec, printSide, money(unitPrice), customer?.name ?? line.customerId, line.orderNo],
      detailRows: [
        ["来源订单", line.id],
        ["客户", customer?.name ?? line.customerId],
        ["品名/尺寸", `${line.product} / ${line.size}`],
        ["颜色/提手", colorSpec],
        ["单双面", printSide],
        ["参考单价", `${money(unitPrice)} / 个`],
      ],
      fields: [
        { key: "bagPrice", label: "袋子单价", currentValue: money(unitPrice) },
        { key: "printPrice", label: "印刷单价", currentValue: line.print === "是" ? "按订单快照复核" : "0" },
        { key: "customerScope", label: "客户范围", currentValue: customer?.name ?? "通用" },
        { key: "remark", label: "价格备注", currentValue: remark || line.orderType || "订单价格快照" },
      ],
      searchText: [line.id, line.orderNo, customer?.name, line.product, line.size, colorSpec, printSide, remark, line.orderType].join(" "),
      reviewRule: "价格资料直接影响订单金额和对账，应只保存为维护草稿；正式启用价格必须由管理复核，并通过确认计划记录价格版本。",
    };
  });
}

function buildMasterDataInventoryRecords({ inventoryRecords = [], helpers = {} }) {
  const availableQty = helpers.availableQty ?? ((item) => Number(item.inStock || 0) - Number(item.reserved || 0) - Number(item.locked || 0));
  const formatStockKey = helpers.formatStockKey ?? ((item) => [item.size, item.color, item.handle, item.style].filter(Boolean).join(" / "));
  const getStockStateGroup = helpers.getStockStateGroup ?? ((item) => item.state || "状态待确认");
  const getStockStateTone = helpers.getStockStateTone ?? (() => "neutral");
  const getStockTrustLabel = helpers.getStockTrustLabel ?? ((item) => item.estimated ? "估算/待复核" : "已清点");
  return inventoryRecords.map((stock) => {
    const stateLabel = getStockStateGroup(stock);
    const available = availableQty(stock);
    return {
      id: `STOCK-${stock.id}`,
      label: formatStockKey(stock),
      statusLabel: stateLabel,
      tone: getStockStateTone(stateLabel),
      cells: [stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, available],
      detailRows: [
        ["库存键", formatStockKey(stock)],
        ["库区", stock.zone],
        ["状态", stateLabel],
        ["在库/占用/锁定", `${stock.inStock} / ${stock.reserved} / ${stock.locked}`],
        ["待处理", `${stock.pending} 个`],
        ["可用/可信", `${available} / ${getStockTrustLabel(stock)}`],
      ],
      fields: [
        { key: "zone", label: "库区", currentValue: stock.zone },
        { key: "state", label: "库存状态", currentValue: stateLabel },
        { key: "safeStock", label: "安全库存", currentValue: "待设置" },
        { key: "trust", label: "可信度", currentValue: getStockTrustLabel(stock) },
      ],
      searchText: [stock.id, stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, getStockTrustLabel(stock)].join(" "),
      reviewRule: "规格库存主数据会影响识别匹配、可用库存和出库扣减。数量差异请走库存修正草稿；规格、库区和安全库存变更先进入基础资料维护草稿。",
    };
  });
}

function buildMasterDataEmployeeMachineRecords({ employeeAccountReviews = [], seedUserOptions = [] }) {
  const importedEmployees = employeeAccountReviews.map((review) => ({
    id: `EMP-${review.employeeId || review.userId || review.loginName}`,
    label: review.name || review.loginName || review.employeeId,
    statusLabel: review.accountEnabled ? getEmployeePasswordStatusLabel(review.passwordStatus) : "待复核启用",
    tone: review.passwordStatus === "password_revoked" ? "danger" : review.passwordStatus === "password_expired" ? "warning" : review.accountEnabled ? "success" : "warning",
    cells: [review.name || review.employeeId, review.loginName || review.userId, review.roleName || review.roleKey || "岗位待补", review.defaultWorkshop || "未分配", formatEmployeeAssignmentLabel(review), review.accountEnabled ? "已启用" : requiresMachineReview(review) ? "待机台复核" : "待启用"],
    detailRows: [
      ["员工", review.name || review.employeeId],
      ["登录名", review.loginName || review.userId || "待生成"],
      ["岗位", review.roleName || review.roleKey || "岗位待补"],
      ["负责车间", review.defaultWorkshop || "未分配"],
      ["默认机台", review.configuredMachineLabel || review.defaultMachineId || "未绑定"],
      ["机台资料", review.machineConfigurationStatusLabel || (review.defaultMachineId ? "待同步" : "待分配机台")],
      ["工作安排", formatEmployeeAssignmentLabel(review)],
      ["账号状态", review.accountEnabled ? "已启用" : "待复核启用"],
      ["密码状态", getEmployeePasswordStatusLabel(review.passwordStatus)],
    ],
    fields: [
      { key: "role", label: "岗位", currentValue: review.roleName || review.roleKey || "" },
      { key: "defaultMachineId", label: "默认机台", currentValue: review.defaultMachineId || "" },
      { key: "loginName", label: "登录名", currentValue: review.loginName || "" },
      { key: "accountEnabled", label: "账号启用", currentValue: review.accountEnabled ? "是" : "否" },
    ],
    searchText: [review.employeeId, review.name, review.loginName, review.userId, review.roleName, review.roleKey, review.defaultWorkshop, review.defaultMachineId, review.configuredMachineId, review.configuredMachineLabel, review.machineConfigurationStatusLabel, formatEmployeeAssignmentLabel(review)].join(" "),
    reviewRule: "员工和机台资料影响权限、车间任务可见性和报工归属。账号启用、密码发放和撤销仍必须在员工账号复核区完成。",
    sourceType: "formal",
    employeeReview: review,
  }));
  const seedEmployees = seedUserOptions.map((user) => ({
    id: `SEED-${user.userId}`,
    label: user.displayName,
    statusLabel: user.defaultMachineId ? "seed账号 / 已绑定机台" : "seed账号",
    tone: "neutral",
    cells: [user.displayName, user.userId, user.roleLabel, "演示", user.defaultMachineId || "未绑定", "seed只读"],
    detailRows: [
      ["用户 ID", user.userId],
      ["显示名", user.displayName],
      ["岗位", user.roleLabel],
      ["角色", user.defaultRole],
      ["默认机台", user.defaultMachineId || "未绑定"],
      ["来源", "本地 seed 权限"],
    ],
    fields: [
      { key: "displayName", label: "显示名", currentValue: user.displayName },
      { key: "roleLabel", label: "岗位说明", currentValue: user.roleLabel },
      { key: "defaultMachineId", label: "默认机台", currentValue: user.defaultMachineId || "" },
    ],
    searchText: [user.userId, user.displayName, user.roleLabel, user.defaultRole, user.defaultMachineId].join(" "),
    reviewRule: "seed 账号只用于原型和本地权限演示；真实员工必须通过员工机台导入和账号复核进入运行期身份仓储。",
    sourceType: "seed",
  }));
  return [...importedEmployees, ...seedEmployees];
}

export function getEmployeeAssignmentMode(review = {}) {
  if (["fixed_machine", "general_worker", "unassigned"].includes(review.assignmentMode)) return review.assignmentMode;
  if (review.defaultMachineId) return "fixed_machine";
  if (review.defaultWorkshop) return "general_worker";
  return "unassigned";
}

function formatEmployeeAssignmentLabel(review = {}) {
  const mode = getEmployeeAssignmentMode(review);
  if (mode === "fixed_machine") return review.configuredMachineLabel || review.defaultMachineId || "机台待补";
  if (mode === "general_worker") return "杂工 / 流动";
  return "暂未分配";
}

function requiresMachineReview(review = {}) {
  const status = String(review.machineConfigurationStatus ?? "").trim();
  if (status) return !["active", "legacy_alias", "not_required"].includes(status);
  return getEmployeeAssignmentMode(review) === "fixed_machine" && !String(review.defaultMachineId ?? "").trim();
}

function getEmployeePasswordStatusLabel(status = "") {
  const labels = {
    temporary_password_issued: "临时密码待改密",
    active: "正式密码已生效",
    password_expired: "密码已过期待改密",
    password_revoked: "密码已撤销",
  };
  return labels[status] || status || "密码待发放";
}
