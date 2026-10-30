import { MixedPackageWorkbench } from "../../../../src/features/packing/MixedPackageWorkbench.jsx";
import OrderPricingEntryWorkspace from "./OrderPricingEntryWorkspace.jsx";
import { InventoryHoldsWorkbench } from "./InventoryHoldsWorkbench.jsx";
import { OrderMutationDialog } from "./OrderMutationDialog.jsx";
import { DeliveryEvidenceReviewPanel } from "../../../../src/features/fulfillment/DeliveryEvidenceReviewPanel.jsx";
import {getOfficeProductionTaskDetail} from "../../../../src/services/officeProductionPackingLazyApi.js";
import {refreshAfterProductionPhotoReview} from "./production-review-refresh.js";
import {resolveTodoWorkspaceLink} from "./todo-workspace-link.js";
import { TodoReminderForm } from "../../../../src/features/todos/TodoReminderForm.jsx";
import { ProductionPhotoReview } from "./ProductionPhotoReview.jsx";
import { DriverExceptionResolutionPanel } from "../../../../src/features/fulfillment/DriverExceptionResolutionPanel.jsx";
import { ProductionScheduleControls } from "./ProductionScheduleControls.jsx";
import { StatementDetailDialog } from "./StatementDetailDialog.jsx";
import { PrintJobDetailDialog } from "./PrintJobDetailDialog.jsx";
import { DesktopFulfillmentOperations } from "./DesktopFulfillmentOperations.jsx";
import { isStockOrderType } from "../../../../shared/orderRouting.js";
import { FinishedInventoryLedger } from "./FinishedInventoryLedger.jsx";
import { FinishedInventoryCorrectionCreate } from "./FinishedInventoryCorrectionCreate.jsx";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  availableQty,
  getLineColorSpecLabel,
  getStockStateGroup,
  getStockTrustLabel,
  money,
  sortTodos,
} from "../../../../src/domain/officeRules.js";
import {
  getBusinessTypeTagValue,
  getRequirementTagValue,
} from "../../../../src/shared/labels.js";
import { SemanticTag as SharedSemanticTag } from "../../../../src/shared/ui/operational.jsx";
import { PayrollAttendancePage } from "../../../../src/features/payroll/PayrollAttendancePage.jsx";
import { EmployeeProfileEditor } from "../../../../src/features/master-data/MasterDataMaintenancePage.jsx";
import { SubaccountPermissionWorkbench } from "../../../../src/features/master-data/SubaccountPermissionWorkbench.jsx";
import "../../../../src/styles/features/payroll-attendance.css";
import "../../../../src/styles/features/master-data.css";
import { FactoryColorLabel } from "./FactoryColor.jsx";
import { buildEmployeeProfile } from "./employee-profile.js";
import { completedBusinessWorkspaceIds } from "./workspaceCoverage.js";
import { optionalFinancialAmount } from "../../../../src/services/officeStatementSelectors.js";
import { getOrderProgress } from "./orderProgress.js";
import { SupplierSettlementActionPanel, SupplierStatementUpload } from "./SupplierSettlementActions.jsx";
import { supplierPaymentTotals } from "./supplier-settlement-model.js";

const OrderPrintGroupCorrectionDialog = lazy(() => import("./OrderPrintGroupCorrectionDialog.jsx").then(module => ({default:module.OrderPrintGroupCorrectionDialog})));

const formatNumber = (value) => new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : null;
};
const quantityText = (value) => value === null ? "待确认" : `${formatNumber(value)}个`;
const moneyText = (value) => value === null ? "待对账" : money(value);
const statementMoney = value => optionalFinancialAmount(value) === null ? "待核实" : money(value);
const customerName = (value, customerNames = new Map()) => {
  if (value && typeof value === "object") return value.customerName || customerNames.get(value.customerId) || value.customerId || "客户待确认";
  return customerNames.get(value) || value || "客户待确认";
};

function businessTypeFor(line = {}) {
  const type = String(line.orderType || "");
  if (type.includes("定制")) return "定制单";
  if (type.includes("印刷通货")) return "印刷通货";
  if (type.includes("外加工")) return "外加工";
  return "现货通货";
}

function requirementFor(line = {}) {
  if (line.handle === "加长提" || String(line.note || "").includes("加长提")) return "加长提";
  if (line.printSide === "双面") return "双面印";
  return "";
}

function riskFor(line = {}) {
  if (Array.isArray(line.exceptions) && line.exceptions.length) return line.exceptions.join("、");
  if (String(line.inventory || "").includes("缺货")) return "库存不足";
  return "—";
}

function StateText({ children }) {
  return <span className={`business-state ${stateTone(String(children))}`}>{children}</span>;
}

const activeProductionStatusPattern = /丝印中|制袋中|生产中|印刷中|跨日继续/;

function buildMachineLabels(machines = []) {
  return new Map(machines.map((machine) => [
    String(machine.machineId || machine.id || "").trim(),
    machine.name || machine.machineLabel || machine.machineId || "",
  ]));
}

function productionMachineLabel(line = {}, machineLabels = new Map()) {
  const machineId = String(line.machineId || "").trim();
  if (machineId) return machineLabels.get(machineId) || machineId;
  return activeProductionStatusPattern.test(String(line.status || "")) ? "机台待确认" : "未排定";
}

function miniappProgressLabel(line = {}) {
  const status = String(line.status || "");
  if (/已取消|已作废/.test(status)) return "已取消";
  if (/已完成|已交付|已关闭/.test(status)) return "已完成";
  if (/配送中|运输中/.test(status)) return "运输中";
  if (/待出库|已备货|待交付|待自提|待提货/.test(status)) return "待发货/待自提";
  if (/待排产|已排产|丝印|制袋|生产|待打包|跨日继续|待完工确认|异常暂停|数量差异/.test(status)) return "生产中";
  return line.orderNo ? "备货中" : "工厂确认中";
}

function stateTone(value) {
  if (/异常|差异|阻塞|失败|缺货|冻结|待补|未就绪/.test(value)) return "danger";
  if (/已完成|正常|有效|通过|可用|可出库|已核算|在线|已清点|已交付|已启用|已付款|已结算|已确认/.test(value)) return "success";
  if (/生产中|印刷中|丝印中|制袋中|打包中|配送中|已备货/.test(value)) return "info";
  return "warning";
}

// 金额、数量列右对齐（表头按列名判断；「客户 / 期间」之类的文字列不受影响）
function isNumericColumn(column) {
  return /^(?:当前)?(?:应收|已收|差额|金额|欠款|应付|已付|计划数量|数量|重量)$/.test(String(column ?? "").trim());
}

// 订单进度：下单 → 生产 → 出库 → 对账，并写出下一步（2026-10-29 品牌橙改版）
function OrderProgressSection({ status }) {
  const progress = getOrderProgress(status);
  return <section className="order-progress" aria-label="订单进度">
    <h3>订单进度</h3>
    <ol>{progress.steps.map((step) => <li className={step.state} key={step.label} aria-current={step.state === "current" ? "step" : undefined}><span aria-hidden="true" /><b>{step.label}</b></li>)}</ol>
    <p>下一步：{progress.next}</p>
  </section>;
}

function SemanticOrderTag({ kind, value }) {
  const resolved = kind === "business" ? getBusinessTypeTagValue(value) : getRequirementTagValue(value);
  return <SharedSemanticTag kind={kind} label={value} size="compact" value={resolved} />;
}

function WorkbenchHeadingActions({ countLabel, onRefresh }) {
  return <div className="business-heading-actions">
    {countLabel ? <span>{countLabel}</span> : null}
    <button aria-label="刷新当前工作台" onClick={onRefresh} type="button"><ReloadOutlined />刷新</button>
  </div>;
}

function buildProductionRows(tasks = [], orderLines = [], customerNames = new Map(), machineLabels = new Map()) {
  const orderById = new Map(orderLines.map((line) => [line.id || line.orderLineId, line]));
  return tasks.map((task) => {
    const taskFacts = task.productionTask || {};
    const taskLine = task.orderLine || orderById.get(task.orderLineId) || {};
    const line = {
      ...taskLine,
      id: task.orderLineId || taskLine.orderLineId,
      product: taskLine.productName || taskLine.product || "货品待确认",
      qty: taskFacts.plannedQty || taskLine.originalQty || taskLine.qty || 0,
      status: taskFacts.status || taskFacts.taskStatus || taskLine.lineStatus || "待确认",
      machineId: taskFacts.machineId,
      color: taskLine.bagColor || taskLine.color,
    };
    return {
      id: task.productionTaskId,
      sourceTask: task,
      sourceOrderLine: line,
      detailEyebrow: customerName(line, customerNames),
      detailTitle: line.product,
  cells: [
    customerName(line, customerNames),
    line.product,
    `${line.size} · ${getLineColorSpecLabel(line) || line.color}`,
    `${formatNumber(line.qty)}个`,
    productionMachineLabel(line, machineLabels),
    line.status,
  ],
  status: line.status,
  details: [
    ["生产任务", task.productionTaskId],
    ["订单明细", line.id],
    ["客户", customerName(line, customerNames)],
    ["货品", line.product],
    ["规格", line.size],
    ["颜色", getLineColorSpecLabel(line) || line.color],
    ["计划数量", `${formatNumber(line.qty)}个`],
    ["执行机台", productionMachineLabel(line, machineLabels)],
    ["内部工序", line.status],
    ["小程序进度", miniappProgressLabel(line)],
    ...(Array.isArray(line.exceptions) && line.exceptions.length
      ? [["待处理事项", line.exceptions.join("、")]]
      : []),
  ],
    };
  });
}

function buildPackingRows(tasks = [], orderLines = [], customerNames = new Map()) {
  const orderById = new Map(orderLines.map((line) => [line.id || line.orderLineId, line]));
  return tasks.map((task) => {
    const packing = task.packingTask || {};
    const line = task.orderLine || orderById.get(task.orderLineId) || {};
    return {
  id: task.packingTaskId,
  orderLineId: task.orderLineId || line.id || line.orderLineId,
  cells: [
    task.packingTaskId,
    `${customerName(line, customerNames)} · ${line.productName || line.product || "货品待确认"}`,
    `${formatNumber(packing.plannedQty)}个`,
    `${formatNumber(packing.actualPackedQty)}个 / ${task.packageCount || packing.packageCount || 0}包`,
    packing.status || "待确认",
  ],
  status: packing.status || "待确认",
  details: [
    ["打包任务", task.packingTaskId],
    ["订单明细", task.orderLineId],
    ["客户", customerName(line, customerNames)],
    ["计划数量", `${formatNumber(packing.plannedQty)}个`],
    ["实际打包", `${formatNumber(packing.actualPackedQty)}个`],
    ["包数", `${task.packageCount || packing.packageCount || 0}包`],
  ],
    };
  });
}

function buildPrintRows(printJobs = [], printDevices = []) {
  const deviceRows = printDevices.map((device) => ({
    id: device.printDeviceId,
    cells: ["设备验收", device.name, device.status === "active" ? "已启用" : device.status || "待确认", device.driverName || "驱动待确认", device.status === "active" ? "在线" : "待检查"],
    status: device.status === "active" ? "在线" : "待检查",
    modes: ["全部", "设备验收"],
    details: [["设备编号", device.printDeviceId], ["设备名称", device.name], ["驱动", device.driverName || "待确认"], ["纸张", device.paperName || "待确认"]],
  }));
  const jobRows = printJobs.map((job) => ({
    id: job.printJobId,
    printJobId: job.printJobId,
    cells: ["打印作业", job.documentType || "打印任务", job.jobStatus || "待确认", job.printDeviceSnapshot?.name || job.printDeviceId || "设备待确认", job.jobStatus || "待确认"],
    status: job.jobStatus || "待确认",
    modes: ["全部", "打印作业"],
    details: [["打印作业", job.printJobId], ["目标业务", `${job.targetType || "—"} · ${job.targetId || "—"}`], ["文档类型", job.documentType || "待确认"], ["设备", job.printDeviceSnapshot?.name || job.printDeviceId || "待确认"]],
  }));
  return [...deviceRows, ...jobRows];
}

const finishedGoodsCategories = ["全部成品", "无纺布袋", "覆膜无纺布袋"];
const finishedGoodsTypes = ["全部类型", "纯色通货", "印刷通货"];

function classifyFinishedInventory(stock) {
  if (stock.category && stock.goodsType) return stock;
  const laminated = /覆膜/.test(`${stock.style || ""} ${stock.zone || ""}`);
  const printed = !/空白袋|纯色/.test(stock.style || "");
  return {
    ...stock,
    category: laminated ? "覆膜无纺布袋" : "无纺布袋",
    goodsType: printed ? "印刷通货" : "纯色通货",
    pattern: printed ? stock.style || "图案待确认" : "—",
    productName: printed ? "印刷通货袋" : "纯色通货袋",
  };
}

function buildFinishedGoodsInventoryRecords(items = []) {
  return items.map(classifyFinishedInventory).map((stock) => ({
  ...stock,
  available: availableQty(stock),
  trust: getStockTrustLabel(stock),
  stateLabel: getStockStateGroup(stock),
  }));
}

function getFinishedInventoryException(stock) {
  if (!stock) return "";
  const evidence = `${stock.state || ""} ${stock.trust || ""}`;
  if (/冻结/.test(evidence)) return "冻结";
  if (/差异/.test(evidence)) return "盘点差异";
  if (stock.estimated || /待复核/.test(evidence)) return "待复核";
  if (stock.stateLabel === "缺货") return "缺货";
  if (/报废|待处理/.test(evidence) || Number(stock.pending) > 0) return "待处理";
  return "";
}

function InventoryAllocation({ stock, variant = "compact" }) {
  const inStock = Math.max(0, Number(stock?.inStock) || 0);
  const available = Math.max(0, Number(stock?.available) || 0);
  const reserved = Math.max(0, Number(stock?.reserved) || 0);
  const locked = Math.max(0, Number(stock?.locked) || 0);
  const pending = Math.max(0, Number(stock?.pending) || 0);
  const allocationBase = Math.max(inStock, available + reserved + locked + pending, 1);
  const availableRate = inStock > 0 ? Math.round((available / inStock) * 100) : 0;
  const exception = getFinishedInventoryException(stock);
  const parts = [
    ["available", "可用", available],
    ["reserved", "占用", reserved],
    ["locked", "锁定", locked],
    ["pending", "待处理", pending],
  ];
  const allocationLabel = `在库 ${formatNumber(inStock)}，可用 ${formatNumber(available)}，占用 ${formatNumber(reserved)}，锁定 ${formatNumber(locked)}，待处理 ${formatNumber(pending)}`;

  return <div className={`inventory-allocation ${variant}`}>
    {variant === "detail" ? <div className="inventory-allocation-total"><span>在库</span><strong>{formatNumber(inStock)}</strong></div> : null}
    <div aria-label={allocationLabel} className="inventory-allocation-track" role="img">
      {parts.filter(([, , value]) => value > 0).map(([key, label, value]) => <span aria-hidden="true" className={`inventory-allocation-segment ${key}`} key={key} style={{ width: `${(value / allocationBase) * 100}%` }} title={`${label} ${formatNumber(value)}`} />)}
    </div>
    <div className="inventory-allocation-legend">
      <strong className="available">可用 {formatNumber(available)}（{availableRate}%）</strong>
      <span>占用 {formatNumber(reserved)}</span>
      <span>锁定 {formatNumber(locked)}</span>
      {pending > 0 ? <span className="pending">待处理 {formatNumber(pending)}</span> : null}
      {exception && pending <= 0 ? <span className="exception">{exception}</span> : null}
    </div>
  </div>;
}

function buildFulfillmentRows(items = [], orderLines = []) {
  const orderLineById = new Map(orderLines.map((line) => [line.id || line.orderLineId, line]));

  return items.map((item) => {
    const id = item.id || item.fulfillmentId;
    const orderLineId = item.lineId || item.orderLineId;
    const orderLine = orderLineById.get(orderLineId) || {};
    const customerId = item.customerId || orderLine.customerId;
    const status = item.status || "待确认";
    const goods = item.goods || item.goodsSpec || orderLine.productName || orderLine.product || "货品待确认";
    const progress = item.shipmentProgress;
    const orderedQty = optionalNumber(progress?.orderedQty);
    const currentQty = optionalNumber(progress?.currentQty);
    const currentQtyLabel = progress?.currentQtyLabel || "本次数量待核实";
    const shippedBeforeQty = optionalNumber(progress?.totalIssuedQty);
    const remainingQty = optionalNumber(progress?.remainingQty);
    const packageLabel = item.packages || item.package || (item.packageCount ? `${item.packageCount}包` : "待打包");

    return {
      id,
      customerId,
      orderLineId,
      customer: customerName({ ...orderLine, ...item }),
      goods,
      // 详情标题只用货品名；完整规格（尺寸、颜色、印刷、数量）放在标题下一行。
      productTitle: orderLine.productName || orderLine.product || String(goods).split(/\s+/)[0] || goods,
      method: item.methodLabel || item.method || "待确认",
      packageLabel,
      latestNeededAt: item.latest || item.latestNeededAt || "待确认",
      zone: item.zone || "待确认",
      status,
      orderedQty,
      shippedBeforeQty,
      currentQty,
      remainingQty,
      currentQtyLabel,
      searchValues: [id, orderLineId, item.orderNo, customerId],
    };
  });
}

function statementStatusLabel(status) {
  return ({ current_period: "本期待对账", debt_or_variance: "有欠款/差异", payment_pending: "收款待确认", settled: "已结清" })[status] || status || "待确认";
}

function buildStatementRows(items = []) {
  return items.map((statement) => ({
  id: statement.statementId || statement.id,
  statementId: statement.statementId || statement.id,
  cells: [
    `${customerName(statement)} · ${statement.settlementCycle || "账期待确认"}`,
    statementMoney(statement.currentReceivable),
    statementMoney(statement.currentReceived),
    statementMoney(statement.varianceAmount),
    statementStatusLabel(statement.status),
  ],
  status: statementStatusLabel(statement.status),
  details: [
    ["对账单", statement.statementId || statement.id],
    ["客户", customerName(statement)],
    ["结算周期", statement.settlementCycle || "待确认"],
    ["本期应收", statementMoney(statement.currentReceivable)],
    ["本期累计实收", statementMoney(statement.currentReceived)],
    ["本期未收", statementMoney(statement.currentUnpaid)],
    ["本期差额", statementMoney(statement.varianceAmount)],
    ["历史欠款", statementMoney(statement.historicalDebt)],
    ["累计欠款", statementMoney(statement.cumulativeDebt)],
    ["最近对账", statement.lastStatementAt || "待确认"],
  ],
  }));
}

function buildCustomerRows(orderLines = [], statements = []) {
  const records = new Map();
  for (const statement of statements) {
    records.set(statement.customerId, {
      id: statement.customerId,
      name: statement.customerName || statement.customerId,
      settlementCycle: statement.settlementCycle || "待确认",
      receivable: statement.currentReceivable,
      status: statementStatusLabel(statement.status),
    });
  }
  for (const line of orderLines) {
    if (!records.has(line.customerId)) records.set(line.customerId, { id: line.customerId, name: line.customerName || line.customerId, settlementCycle: "待确认", receivable: null, status: "正常" });
  }
  return [...records.values()].map((item) => ({
    id: item.id,
    cells: [item.name, item.id, item.settlementCycle, statementMoney(item.receivable), item.status],
    status: item.status,
    details: [["客户编号", item.id], ["客户名称", item.name], ["结算周期", item.settlementCycle], ["当前应收", statementMoney(item.receivable)]],
  }));
}

function buildPeopleMachineRows(employees = [], machines = []) {
  const machineById = new Map(machines.map((machine) => [machine.machineId, machine]));
  return employees.map((employee, employeeIndex) => {
    const machine = machineById.get(employee.configuredMachineId || employee.defaultMachineId);
    const profile = buildEmployeeProfile(employee);
    const roleLabel = employee.roleName || "待确认";
    const workshopLabel = employee.defaultWorkshop || "未维护";
    const machineLabel = machine?.machineLabel || employee.configuredMachineLabel || "未绑定";
    const accountStatus = employee.loginName ? (employee.accountStatusLabel || "已分配") : "待分配";
    return {
      id: employee.employeeId,
      cells: [String(employeeIndex + 1), employee.name, roleLabel, workshopLabel, machineLabel, employee.statusLabel || employee.status],
      detailTitle: employee.name,
      employeeReview: employee,
      searchValues: [employee.loginName],
      status: employee.statusLabel || employee.status,
      target: "payroll-attendance",
      detailSections: [
        {
          title: "员工档案",
          facts: [["员工编号", employee.employeeId], ["姓名", employee.name], ["年龄", profile.age], ["入职时间", profile.hireDate], ["在厂工龄", profile.tenure], ["在职状态", profile.employmentStatus]],
        },
        {
          title: "工作安排",
          facts: [["岗位", roleLabel], ["所在车间", workshopLabel], ["当前机台", machineLabel], ["备注", employee.note || "—"]],
        },
        {
          title: "账号信息",
          facts: [["账号", employee.loginName || "待分配"], ["账号状态", accountStatus]],
        },
      ],
      details: [["员工编号", employee.employeeId], ["姓名", employee.name], ["账号", employee.loginName || "待分配"], ["岗位", roleLabel], ["车间", workshopLabel], ["机台", machineLabel]],
    };
  });
}

function buildWorkspaceConfigs(formal) {
  const data = formal.data;
  const customerNames = new Map(data.orderLines.map((line) => [line.customerId, line.customerName || line.customerId]));
  const machineLabels = buildMachineLabels(data.machines);
  const productionRows = buildProductionRows(data.productionTasks, data.orderLines, customerNames, machineLabels);
  const packingRows = buildPackingRows(data.packingTasks, data.orderLines, customerNames);
  const printRows = buildPrintRows(data.printJobs, data.printDevices);
  const fulfillmentRows = buildFulfillmentRows(data.fulfillments, data.orderLines, data.statements);
  const statementRows = buildStatementRows(data.statements);
  return {
  "production-tasks": {
    title: "生产任务",
    description: "来自 ProductionPackingPage；办公室负责发布与协调，现场仍由岗位手机端报工。",
    columns: ["客户", "品名", "规格 / 颜色", "计划数量", "机台", "状态"],
    gridTemplateColumns: "minmax(112px, 1.2fr) minmax(100px, 1.05fr) minmax(140px, 1.35fr) minmax(82px, .75fr) minmax(92px, .8fr) minmax(78px, .72fr)",
    rows: productionRows,
    primaryAction: "查看生产任务",
    source: "正式生产任务 API",
    showSourceEvidence: false,
  },
  "packing-labels": {
    title: "打包任务",
    description: "沿用 ProductionPackingPage 的打包任务生成规则，不把打包完成等同于出库。",
    columns: ["打包任务", "客户 / 货品", "计划数量", "实际 / 包数", "状态"],
    rows: packingRows,
    primaryAction: "查看打包任务",
    source: "正式打包任务 API",
  },
  "print-devices": {
    title: "打印与设备",
    description: "保持设备验收、上线门禁、驱动诊断和打印作业四个真实工作区。",
    modes: ["全部", "设备验收", "上线门禁", "驱动诊断", "打印作业"],
    columns: ["工作区", "处理范围", "当前结果", "同步摘要", "状态"],
    rows: printRows,
    primaryAction: "查看当前工作区",
    source: "正式打印设备与作业 API",
  },
  "outbound-delivery": {
    title: "出库交付",
    description: "沿用 FulfillmentPage 的交付任务、方式、数量、库区和实物状态。",
    columns: ["客户 / 订单", "货品", "交付方式", "数量 / 包装", "状态"],
    rows: fulfillmentRows,
    primaryAction: "查看交付事实",
    source: "正式出库交付 API",
  },
  "customer-statements": {
    title: "对账收款",
    description: "沿用 StatementPage 的客户账期、应收、实收、差额和订单明细。",
    columns: ["客户 / 期间", "应收", "已收", "差额", "状态"],
    rows: statementRows,
    primaryAction: "查看对账明细",
    source: "正式对账 API",
  },
  "customer-records": {
    title: "客户档案",
    columns: ["客户", "客户编号", "结算周期", "当前应收", "状态"],
    rows: buildCustomerRows(data.orderLines, data.statements),
    primaryAction: "查看客户事实",
    source: "正式订单与对账 API",
  },
  "people-machines": {
    title: "员工机台",
    columns: ["序号", "员工", "岗位", "车间", "机台", "状态"],
    gridTemplateColumns: "52px minmax(120px, 1.15fr) minmax(124px, 1.2fr) minmax(84px, .78fr) minmax(104px, .92fr) minmax(92px, .8fr)",
    primaryCellIndex: 1,
    rows: buildPeopleMachineRows(data.employeeAccountReviews, data.machines),
    primaryAction: "查看考勤与工资",
    profileMaintenance: true,
    accountPreparation: true,
    onConfirmEmployeeIdentity: formal.actions.confirmEmployeeIdentity,
    onEnableEmployeeAccount: formal.actions.enableEmployeeAccount,
    onIssueEmployeePassword: formal.actions.issueEmployeePassword,
    onUpdateEmployeeProfile: formal.actions.updateEmployeeProfile,
    source: "正式员工账号与机台 API",
  },
  "launch-status": {
    title: "上线状态",
    columns: ["检查对象", "版本 / 范围", "环境", "最后动作", "状态"],
    rows: [],
    primaryAction: "查看发布状态",
    source: "正式发布状态接口尚未提供",
  },
  };
};

function GenericWorkspace({ config, onNavigate, detailExtra, focus = null }) {
  const [query, setQuery] = useState(focus?.query || "");
  const [status, setStatus] = useState("全部状态");
  const [mode, setMode] = useState(config.modes?.[0] || "全部");
  const [selectedId, setSelectedId] = useState(focus?.recordId || config.rows[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const statuses = useMemo(() => [...new Set(config.rows.map((row) => row.status).filter(Boolean))], [config.rows]);
  const rows = useMemo(() => config.rows.filter((row) => {
    const modeMatch = mode === "全部" || row.modes?.includes(mode) || row.cells.some((cell) => String(cell).includes(mode));
    const statusMatch = status === "全部状态" || row.status === status;
    const queryMatch = !query.trim() || [...row.cells, row.id, ...(row.searchValues || [])].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    return modeMatch && statusMatch && queryMatch;
  }), [config.rows, mode, query, status]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const gridTemplateColumns = config.gridTemplateColumns || `minmax(170px, 1.45fr) repeat(${Math.max(0, config.columns.length - 1)}, minmax(92px, 1fr))`;

  function runPrimary() {
    if (config.onPrimary) config.onPrimary(selected);
    else if (selected?.target) onNavigate(selected.target);
    else setNotice("当前页面仅展示这条记录，尚未接入后续操作。");
  }

  function reset() {
    setQuery("");
    setStatus("全部状态");
    setMode(config.modes?.[0] || "全部");
    setSelectedId(config.rows[0]?.id || "");
    setNotice("");
    setProfileOpen(false);
    setProfileError("");
    setAccountOpen(false);
  }

  async function saveEmployeeProfile(review, profile) {
    setProfileError("");
    const result = await config.onUpdateEmployeeProfile?.(review, profile);
    if (result?.source !== "api" || !result.employeeAccountReview) {
      setProfileError(result?.error?.message || "正式员工档案接口没有返回保存结果。");
      return null;
    }
    setProfileOpen(false);
    setNotice(`已保存 ${result.employeeAccountReview.name || result.employeeAccountReview.employeeId} 的员工档案和考勤身份映射。`);
    return result.employeeAccountReview;
  }

  return <><div className="business-workbench source-grounded-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>{config.title}</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${config.rows.length} 条`} onRefresh={config.onRefresh} /></header>
      {config.modes ? <div aria-label={`${config.title}区域`} className="business-subtabs" role="tablist">{config.modes.map((item) => <button aria-selected={mode === item} key={item} onClick={() => { setMode(item); setSelectedId(""); }} role="tab" type="button">{item}</button>)}</div> : null}
      <div className="business-filter-row"><label><SearchOutlined /><input aria-label={`${config.title}搜索`} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索当前工作台" value={query} /></label><select aria-label={`${config.title}状态`} onChange={(event) => { setStatus(event.target.value); setSelectedId(""); }} value={status}><option>全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!query && status === "全部状态" && mode === (config.modes?.[0] || "全部")} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="business-table" role="table" aria-label={`${config.title}列表`}>
        <div className="business-row business-head" role="row" style={{ gridTemplateColumns }}>{config.columns.map((column) => <span data-numeric={isNumericColumn(column) ? "true" : undefined} key={column} role="columnheader">{column}</span>)}</div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`business-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" style={{ gridTemplateColumns }} type="button">{row.cells.map((cell, index) => <span className={index === (config.primaryCellIndex ?? 0) ? "business-primary-cell" : undefined} data-numeric={isNumericColumn(config.columns[index]) ? "true" : undefined} key={`${row.id}-${index}`} role="cell">{index === row.cells.length - 1 ? <StateText>{cell}</StateText> : cell}</span>)}</button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配记录</strong><span>调整关键词、状态或区域后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel">
      <header><span>{selected?.detailEyebrow || `当前选中 · ${config.title}`}</span><h2>{selected?.detailTitle || selected?.cells[0] || config.title}</h2>{selected ? <StateText>{selected.status}</StateText> : null}</header>
      <div className="business-detail-scroll">
        {config.showSourceEvidence === false ? null : <div className="source-provenance"><CheckCircleOutlined /><span>来源已对齐：{config.source}</span></div>}
        {selected ? (selected.detailSections?.length
          ? selected.detailSections.map((section) => <section className="business-detail-section" key={section.title}><h3>{section.title}</h3><dl className="business-facts">{section.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value || "—")}</dd></div>)}</dl></section>)
          : <><h3>业务事实</h3><dl className="business-facts">{selected.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value || "—")}</dd></div>)}</dl></>)
          : <div className="business-empty"><FileTextOutlined /><strong>暂无记录</strong></div>}
        {detailExtra?.(selected)}
        {notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}
      </div>
      <footer>{detailExtra ? null : <button className="primary" disabled={!selected || (config.canRunPrimary && !config.canRunPrimary(selected))} onClick={runPrimary} type="button">{config.primaryAction}</button>}{config.profileMaintenance ? <button className="secondary-button" disabled={!selected?.employeeReview} onClick={() => { setProfileError(""); setProfileOpen(true); }} type="button">维护员工档案</button> : config.showSourceEvidence === false ? null : <button className="secondary-button" onClick={() => setNotice(`来源：${config.source}`)} type="button">查看数据来源</button>}{config.accountPreparation ? <button className="secondary-button" disabled={!selected?.employeeReview} onClick={() => setAccountOpen(true)} type="button">准备员工账号</button> : null}</footer>
    </aside>
  </div>{profileOpen && selected?.employeeReview ? <div className="dialog-backdrop employee-profile-dialog-backdrop" onMouseDown={() => setProfileOpen(false)} role="presentation"><section aria-labelledby="employee-profile-dialog-title" aria-modal="true" className="receive-dialog employee-profile-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>正式员工资料</span><h2 id="employee-profile-dialog-title">维护 {selected.employeeReview.name}</h2></div><button aria-label="关闭" onClick={() => setProfileOpen(false)} type="button">×</button></header><div className="employee-profile-dialog-body"><EmployeeProfileEditor actionState={{ disabled: false, title: "" }} onSave={saveEmployeeProfile} review={selected.employeeReview} />{profileError ? <p className="employee-profile-dialog-error" role="alert">{profileError}</p> : null}</div></section></div> : null}{accountOpen && selected?.employeeReview ? <EmployeeAccountPreparationDialog onClose={() => setAccountOpen(false)} onConfirmIdentity={config.onConfirmEmployeeIdentity} onEnableAccount={config.onEnableEmployeeAccount} onIssuePassword={config.onIssueEmployeePassword} review={selected.employeeReview} /> : null}</>;
}

function FinanceOperationsWorkspace({ formal, navId, onNavigate }) {
  const [openedId, setOpenedId] = useState("");
  const isStatement = navId === "customer-statements";
  const identity = row => isStatement ? row?.statementId : row?.printJobId;
  const config = {
    ...buildWorkspaceConfigs(formal)[navId],
    showSourceEvidence: false,
    primaryAction: isStatement ? "查看对账明细与收款" : "查看打印作业详情",
    canRunPrimary: row => Boolean(identity(row)),
    onPrimary: row => setOpenedId(identity(row) || ""),
    onRefresh: formal.actions.refreshAll,
  };
  const Dialog = isStatement ? StatementDetailDialog : PrintJobDetailDialog;
  return <><GenericWorkspace config={config} onNavigate={onNavigate} />{openedId ? <Dialog statementId={isStatement ? openedId : undefined} printJobId={isStatement ? undefined : openedId} authState={formal.authState} onClose={() => setOpenedId("")} onUpdated={() => formal.actions.refreshAll()} /> : null}</>;
}

function PeopleMachinesWorkspace({ formal, onNavigate }) {
  const [view, setView] = useState(() => new URL(window.location.href).searchParams.get("peopleView") === "positions" ? "岗位分配" : "员工档案");
  const canManageSubaccounts = formal.permissionContext?.actionPermissions?.includes("permission.manage") === true;
  const config = buildWorkspaceConfigs(formal)["people-machines"];
  return <div className="people-machines-workspace">
    <nav aria-label="员工机台工作区" className="employee-master-secondary-nav">
      <button className={view === "员工档案" ? "is-active" : ""} onClick={() => setView("员工档案")} type="button">员工档案</button>
      {canManageSubaccounts ? <button className={view === "岗位分配" ? "is-active" : ""} onClick={() => setView("岗位分配")} type="button">岗位分配</button> : null}
    </nav>
    {view === "岗位分配" && canManageSubaccounts
      ? <SubaccountPermissionWorkbench authState={formal.authState} currentUser={formal.permissionContext?.user} employeeAccountReviews={formal.data.employeeAccountReviews} />
      : <GenericWorkspace config={{ ...config, onRefresh: formal.actions.refreshAll }} onNavigate={onNavigate} />}
  </div>;
}

function PhysicalPackagesPanel({formal,fulfillmentId,orderLineId}) {
  const [open,setOpen]=useState(false),[pending,setPending]=useState(false);
  const fulfillment = (formal.data?.fulfillments ?? []).find(item => (item.id || item.fulfillmentId) === fulfillmentId);
  const resolvedLineId = orderLineId || fulfillment?.orderLineId || fulfillment?.lineId;
  const line = (formal.data?.orderLines ?? []).find(row => (row.id ?? row.orderLineId) === resolvedLineId);
  const packageCount = Number(fulfillment?.actualPackageCount || 0);
  useEffect(() => { if (packageCount > 0) setOpen(true); }, [packageCount]);
  if (!isStockOrderType(fulfillment?.orderType ?? line?.orderType)) return null;
  const initialStockRegistration = !fulfillment?.actualPackageCount && ["待出库", "待库房备货", "已备货", "待打印标签"].includes(fulfillment?.status);
  if (initialStockRegistration) return null;
  if (!(formal.permissionContext?.actionPermissions || []).some(key=>["packing.read","packing.complete","fulfillment.print"].includes(key))) return null;
  return <section className="business-detail-section"><button className="secondary-button" type="button" disabled={pending} onClick={()=>setOpen(value=>!value)}>{open?"收起实物包裹":"登记 / 更正实物包裹"}</button>{open?<MixedPackageWorkbench authState={formal.authState} fulfillmentId={fulfillmentId} orderLineId={resolvedLineId} onSaved={formal.actions.refreshAll} onBusyChange={setPending}/>:null}</section>;
}

function FulfillmentWorkspace({ formal, onNavigate }) {
  const records = useMemo(
    () => buildFulfillmentRows(formal.data.fulfillments, formal.data.orderLines),
    [formal.data.fulfillments, formal.data.orderLines],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const [notice, setNotice] = useState("");
  const statuses = useMemo(() => [...new Set(records.map((record) => record.status).filter(Boolean))], [records]);
  const rows = useMemo(() => records.filter((record) => {
    const statusMatch = status === "全部状态" || record.status === status;
    const queryMatch = !query.trim() || [record.customer, record.goods, record.method, ...record.searchValues]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return statusMatch && queryMatch;
  }), [query, records, status]);
  const selected = rows.find((record) => record.id === selectedId) || rows[0] || null;
  const gridTemplateColumns = "minmax(150px, 1.22fr) minmax(180px, 1.45fr) minmax(74px, .66fr) minmax(138px, 1fr) minmax(86px, .72fr)";
  const reset = () => { setQuery(""); setStatus("全部状态"); setSelectedId(records[0]?.id || ""); setNotice(""); };

  return <div className="business-workbench fulfillment-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>出库交付</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${records.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <div className="business-filter-row"><label><SearchOutlined /><input aria-label="出库交付搜索" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); setNotice(""); }} placeholder="搜索客户 / 订单 / 货品 / 交付方式" value={query} /></label><select aria-label="出库交付状态" onChange={(event) => { setStatus(event.target.value); setSelectedId(""); setNotice(""); }} value={status}><option>全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!query && status === "全部状态"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div aria-label="出库交付列表" className="business-table" role="table">
        <div className="business-row business-head" role="row" style={{ gridTemplateColumns }}><span role="columnheader">客户 / 订单</span><span role="columnheader">货品</span><span role="columnheader">方式</span><span role="columnheader">本次 / 包装</span><span role="columnheader">状态</span></div>
        <div className="business-table-body">{rows.length ? rows.map((record) => <button aria-pressed={selected?.id === record.id} className={`business-row${selected?.id === record.id ? " selected" : ""}`} key={record.id} onClick={() => { setSelectedId(record.id); setNotice(""); }} role="row" style={{ gridTemplateColumns }} type="button"><span className="business-primary-cell" role="cell">{record.customer}<small>{record.orderLineId || record.id}</small></span><span role="cell">{record.goods}</span><span role="cell">{record.method}</span><span role="cell">{quantityText(record.currentQty)} / {record.packageLabel}</span><span role="cell"><StateText>{record.status}</StateText></span></button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的交付任务</strong><span>调整关键词或状态后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel fulfillment-detail">
      <header><span>{selected ? `${selected.customer} · ${selected.orderLineId || selected.id}` : "当前选中 · 出库交付"}</span><h2>{selected?.productTitle || "暂无交付任务"}</h2>{selected && selected.goods !== selected.productTitle ? <p className="business-detail-subtitle">{selected.goods}</p> : null}{selected ? <StateText>{selected.status}</StateText> : null}</header>
      <div className="business-detail-scroll">{selected ? <>
        <section className="business-detail-section"><h3>交付数量</h3><dl className="fulfillment-progress-facts"><div><dt>订货数量</dt><dd>{quantityText(selected.orderedQty)}</dd></div><div><dt>累计实出</dt><dd>{quantityText(selected.shippedBeforeQty)}</dd></div><div className="current"><dt>{selected.currentQtyLabel}</dt><dd>{quantityText(selected.currentQty)}</dd></div><div><dt>剩余未实出</dt><dd>{quantityText(selected.remainingQty)}</dd></div></dl></section>
        <section className="business-detail-section"><h3>交付事实</h3><dl className="business-facts"><div><dt>交付方式</dt><dd>{selected.method}</dd></div><div><dt>包装</dt><dd>{selected.packageLabel}</dd></div><div><dt>要求时间</dt><dd>{selected.latestNeededAt}</dd></div><div><dt>出库库位</dt><dd>{selected.zone}</dd></div></dl></section>
        <section className="business-detail-section"><h3>对账关联</h3><div className="business-boundary"><InfoCircleOutlined /><div><strong>金额以正式对账记录为准</strong><p>分批出货、赠送数量和差异处理都会影响计费，本页不按数量估算应收或欠款。</p></div></div>{formal.permissionContext?.actionPermissions?.includes("statement.preview") ? <button type="button" onClick={() => onNavigate?.("customer-statements")}>打开对账收款</button> : <p>请由财务或办公室核对正式账单。</p>}</section>
        {selected.method === "送货" ? <DeliveryEvidenceReviewPanel authState={formal.authState} fulfillmentId={selected.id} onReviewed={(message) => { setNotice(message); void formal.actions.refreshAll(); }} /> : null}
        {selected.status === "送货异常" ? <DriverExceptionResolutionPanel authState={{...formal.authState,permissions:formal.permissionContext}} fulfillmentId={selected.id} onResolved={()=>void formal.actions.refreshAll()} /> : null}
        <PhysicalPackagesPanel key={`${selected.id}:${formal.authState?.session?.accessToken || ""}`} formal={formal} fulfillmentId={selected.id}/>
        <DesktopFulfillmentOperations fulfillment={formal.data.fulfillments.find(item => (item.id || item.fulfillmentId) === selected.id)} formal={formal} />
        {notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}
      </> : <div className="business-empty"><FileTextOutlined /><strong>暂无交付任务</strong></div>}</div>
    </aside>
  </div>;
}

const supplierSettlementSteps = ["对账确认", "生成应付", "付款登记", "付款确认"];

function supplierSettlementPeriod(record = {}) {
  const explicit = String(record.statementPeriod || record.period || record.settlementPeriod || "").trim();
  if (explicit) return explicit;
  const source = `${record.fileName || ""} ${record.createdAt || ""}`;
  const match = source.match(/(20\d{2})[年._/-]?(0?[1-9]|1[0-2])/);
  return match ? `${match[1]}年${String(match[2]).padStart(2, "0")}月` : "账期待确认";
}

function supplierSettlementState(record = {}) {
  const statementConfirmed = Boolean(record.statementConfirmationId) || record.reviewStatus === "statement_confirmed";
  const payableReady = Boolean(record.supplierPayableId || record.supplierPayableDraft);
  const paymentRegistered = Boolean(record.supplierPaymentRecord);
  // A partial installment has a confirmation id but is not settled yet.
  const paymentConfirmed = record.paymentStatus === "已确认付款" || (Boolean(record.supplierPaymentConfirmationId) && !record.paymentStatus);
  const partiallyPaid = record.paymentStatus === "部分付款";
  const completedCount = paymentConfirmed ? 4 : paymentRegistered ? 3 : payableReady ? 2 : statementConfirmed ? 1 : 0;
  const label = paymentConfirmed ? "已付款" : partiallyPaid ? "部分付款" : paymentRegistered ? "付款待确认" : payableReady ? "待付款登记" : statementConfirmed ? "待生成应付" : "待对账确认";
  return { completedCount, label };
}

function SettlementFlow({ completedCount }) {
  return <ol aria-label="供应商结算进度" className="supplier-settlement-flow">{supplierSettlementSteps.map((label, index) => {
    const done = completedCount > index;
    const current = completedCount === index;
    return <li aria-current={current ? "step" : undefined} className={done ? "done" : current ? "current" : "pending"} key={label}>{done ? <CheckCircleOutlined /> : <span>{index + 1}</span>}<div><strong>{label}</strong><small>{done ? "已完成" : current ? "当前阶段" : "尚未开始"}</small></div></li>;
  })}</ol>;
}

const supplierPaymentRecordsPresent = (record) => Boolean(record.supplierPaymentRecord) || (Array.isArray(record.supplierPaymentRecords) && record.supplierPaymentRecords.length > 0);

function SupplierSettlementWorkspace({ formal }) {
  const records = useMemo(() => formal.data.supplierStatementReviews.map((record) => ({
    ...record,
    id: record.reviewId || record.id,
    supplierName: record.supplierName || "供应商待确认",
    period: supplierSettlementPeriod(record),
    settlementState: supplierSettlementState(record),
    payableAmount: optionalNumber(record.supplierPayableDraft?.payableAmount ?? record.payableAmount),
    paidAmount: supplierPaymentRecordsPresent(record) ? supplierPaymentTotals(record).paid : null,
  })), [formal.data.supplierStatementReviews]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部阶段");
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const [notice, setNotice] = useState("");
  const statuses = useMemo(() => [...new Set(records.map((record) => record.settlementState.label))], [records]);
  const rows = useMemo(() => records.filter((record) => {
    const statusMatch = status === "全部阶段" || record.settlementState.label === status;
    const queryMatch = !query.trim() || [record.supplierName, record.fileName, record.id, record.period]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return statusMatch && queryMatch;
  }), [query, records, status]);
  const selected = rows.find((record) => record.id === selectedId) || rows[0] || null;
  const gridTemplateColumns = "minmax(132px, 1.15fr) minmax(92px, .8fr) minmax(132px, 1.1fr) minmax(92px, .8fr) minmax(98px, .82fr)";
  const reset = () => { setQuery(""); setStatus("全部阶段"); setSelectedId(records[0]?.id || ""); setNotice(""); };

  return <div className="business-workbench supplier-settlement-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>供应商月结</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${records.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      {formal.actions.precheckSupplierStatement ? <div className="supplier-upload-row"><SupplierStatementUpload formal={formal} onSaved={(review) => { setStatus("全部阶段"); setQuery(""); setSelectedId(review?.reviewId || ""); setNotice(`已保存对账单 ${review?.reviewId || ""}，请核对。`); }} /></div> : null}
      <div className="business-filter-row"><label><SearchOutlined /><input aria-label="供应商月结搜索" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); setNotice(""); }} placeholder="搜索供应商 / 月份 / 文件 / 复核单" value={query} /></label><select aria-label="供应商月结阶段" onChange={(event) => { setStatus(event.target.value); setSelectedId(""); setNotice(""); }} value={status}><option>全部阶段</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!query && status === "全部阶段"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div aria-label="供应商月结列表" className="business-table" role="table">
        <div className="business-row business-head" role="row" style={{ gridTemplateColumns }}><span role="columnheader">供应商</span><span role="columnheader">对账期间</span><span role="columnheader">匹配结果</span><span role="columnheader">应付金额</span><span role="columnheader">结算阶段</span></div>
        <div className="business-table-body">{rows.length ? rows.map((record) => { const summary = record.summary || {}; return <button aria-pressed={selected?.id === record.id} className={`business-row${selected?.id === record.id ? " selected" : ""}`} key={record.id} onClick={() => { setSelectedId(record.id); setNotice(""); }} role="row" style={{ gridTemplateColumns }} type="button"><span className="business-primary-cell" role="cell">{record.supplierName}<small>{record.fileName || record.id}</small></span><span role="cell">{record.period}</span><span role="cell">匹配 {summary.matchedRowCount || 0} / 差异 {(summary.unmatchedRowCount || 0) + (summary.candidateRowCount || 0)}</span><span role="cell">{moneyText(record.payableAmount)}</span><span role="cell"><StateText>{record.settlementState.label}</StateText></span></button>; }) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的供应商结算</strong><span>{records.length ? "调整关键词或结算阶段后重试。" : "服务器暂无供应商月结复核草稿。"}</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel supplier-settlement-detail">
      <header><span>{selected?.id || "当前选中 · 供应商月结"}</span><h2>{selected?.supplierName || "暂无月结复核"}</h2>{selected ? <StateText>{selected.settlementState.label}</StateText> : null}</header>
      <div className="business-detail-scroll">{selected ? <>
        <section className="business-detail-section"><h3>结算进度</h3><SettlementFlow completedCount={selected.settlementState.completedCount} /></section>
        <section className="business-detail-section"><h3>对账事实</h3><dl className="business-facts"><div><dt>对账期间</dt><dd>{selected.period}</dd></div><div><dt>对账文件</dt><dd>{selected.fileName || "待确认"}</dd></div><div><dt>匹配结果</dt><dd>{selected.summaryText || `匹配 ${selected.summary?.matchedRowCount || 0}，差异 ${(selected.summary?.unmatchedRowCount || 0) + (selected.summary?.candidateRowCount || 0)}`}</dd></div><div><dt>当前状态</dt><dd>{selected.status || selected.reviewStatus || "待复核"}</dd></div></dl></section>
        <section className="business-detail-section"><h3>应付与付款</h3><dl className="business-facts"><div><dt>应付草稿</dt><dd>{selected.supplierPayableId || "尚未生成"}</dd></div><div><dt>应付金额</dt><dd>{moneyText(selected.payableAmount)}</dd></div><div><dt>已付合计</dt><dd>{moneyText(selected.paidAmount)}</dd></div><div><dt>付款凭证</dt><dd>{selected.supplierPaymentRecord?.paymentReferenceNo || selected.supplierPaymentRecord?.paymentVoucherNo || "尚未登记"}</dd></div></dl><div className="business-boundary"><InfoCircleOutlined /><div><strong>{selected.demoReadOnly ? "本地评审只读样例" : "一张月结单对应一个结算对象"}</strong><p>{selected.demoReadOnly ? "用于核对完整结算链路的显示效果；不会执行对账、应付或付款写入。" : "对账确认、生成应付、付款登记和付款确认是四个独立阶段；本页只展示服务器已有证据，不代替财务操作。"}</p></div></div></section>
        {formal.actions.confirmSupplierPayment ? <SupplierSettlementActionPanel formal={formal} onNotice={setNotice} record={selected} /> : null}
        {notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}
      </> : <div className="business-empty"><FileTextOutlined /><strong>暂无月结复核草稿</strong><small>点「上传月结 Excel」开始对账。</small></div>}</div>
      <footer><button className="primary" disabled={!selected} onClick={() => setNotice(selected.summaryText || "当前结算对象暂无额外差异摘要。") } type="button">查看差异摘要</button></footer>
    </aside>
  </div>;
}

function EmployeeAccountPreparationDialog({ review, onClose, onConfirmIdentity, onEnableAccount, onIssuePassword }) {
  const [confirmedName, setConfirmedName] = useState(review.name || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [issuedCredential, setIssuedCredential] = useState(null);
  const departed = ["departed", "inactive"].includes(String(review.profileStatus || review.status || "").toLowerCase());
  const passwordReady = Boolean(review.passwordChangedAt) && review.mustChangePassword !== true;

  async function runIdentityConfirmation() {
    if (!confirmedName.trim() || !reason.trim() || busy) return;
    if (!window.confirm(`确认 ${review.employeeId} 的正式身份为“${confirmedName.trim()}”？确认依据会写入审计记录。`)) return;
    setBusy("identity");
    setError("");
    const result = await onConfirmIdentity?.(review, { confirmedName: confirmedName.trim(), reason: reason.trim() });
    if (result?.source !== "api" || !result.employeeAccountReview) setError(result?.error?.message || "正式身份确认失败。");
    setBusy("");
  }

  async function runEnable() {
    if (busy || departed || review.accountActivationBlocked || review.accountEnabled) return;
    if (!window.confirm(`确认启用 ${review.name || review.employeeId} 的员工账号？系统将使用已复核岗位、机台和角色。`)) return;
    setBusy("enable");
    setError("");
    const result = await onEnableAccount?.(review);
    if (result?.source !== "api" || !result.employeeAccountReview) setError(result?.error?.message || "员工账号启用失败。");
    setBusy("");
  }

  async function runIssuePassword() {
    if (busy || !review.accountEnabled || departed) return;
    if (!window.confirm(`确认向 ${review.name || review.employeeId} 发放一次性临时密码？临时密码只在本次返回。`)) return;
    setBusy("password");
    setError("");
    const result = await onIssuePassword?.(review);
    if (result?.source === "api" && result.issuedCredential) setIssuedCredential(result.issuedCredential);
    else setError(result?.error?.message || "临时密码发放失败。");
    setBusy("");
  }

  return <div className="dialog-backdrop employee-account-dialog-backdrop" onMouseDown={onClose} role="presentation"><section aria-labelledby="employee-account-dialog-title" aria-modal="true" className="receive-dialog employee-account-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>员工本人账号</span><h2 id="employee-account-dialog-title">准备 {review.name}</h2></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header><div className="employee-account-dialog-body"><p className="employee-account-boundary">账号启用只授予已复核岗位权限；员工手机“我的考勤”仍由登录账号绑定的员工编号决定，不能选择或查看同事。</p><dl className="employee-account-status"><div><dt>员工编号</dt><dd>{review.employeeId}</dd></div><div><dt>登录名</dt><dd>{review.loginName || "待生成"}</dd></div><div><dt>身份确认</dt><dd>{review.identityConfirmed ? "已确认" : review.accountActivationBlockerLabel || "待确认"}</dd></div><div><dt>账号状态</dt><dd>{departed ? "已离职，不可启用" : review.accountEnabled ? "已启用" : "待复核启用"}</dd></div><div><dt>首次改密</dt><dd>{passwordReady ? "已完成" : review.passwordIssuedAt ? "临时密码待改密" : "尚未发放密码"}</dd></div><div><dt>账号角色</dt><dd>{review.recommendedRoleLabels?.join("、") || review.recommendedRoleLabel || review.roleName || "待确认"}</dd></div></dl>{review.accountActivationBlocked && !departed ? <section className="employee-account-step"><h3>1. 确认正式身份</h3><label><span>正式显示名</span><input onChange={(event) => setConfirmedName(event.target.value)} value={confirmedName} /></label><label><span>确认依据</span><input onChange={(event) => setReason(event.target.value)} placeholder="例如：负责人当面核对身份证与工号" value={reason} /></label><button className="primary" disabled={busy || !confirmedName.trim() || !reason.trim()} onClick={runIdentityConfirmation} type="button">{busy === "identity" ? "确认中…" : "确认身份"}</button></section> : null}<section className="employee-account-step"><h3>{review.accountActivationBlocked ? "2" : "1"}. 复核启用账号</h3><p>{departed ? "离职员工保留历史记录，但不能重新启用。" : review.accountEnabled ? "账号已经启用；岗位和角色变更继续走正式管理员复核。" : "启用前由管理员核对岗位、车间、机台和账号角色。"}</p><button className="primary" disabled={busy || departed || review.accountActivationBlocked || review.accountEnabled} onClick={runEnable} type="button">{review.accountEnabled ? "账号已启用" : busy === "enable" ? "启用中…" : "复核启用账号"}</button></section><section className="employee-account-step"><h3>{review.accountActivationBlocked ? "3" : "2"}. 发放临时密码</h3><p>临时密码只显示一次；员工首次登录必须改密，完成后才计入本人账号就绪。</p><button className="primary" disabled={busy || departed || !review.accountEnabled} onClick={runIssuePassword} type="button">{busy === "password" ? "生成中…" : review.passwordIssuedAt ? "重新发放临时密码" : "发放临时密码"}</button>{issuedCredential ? <div className="employee-issued-credential" role="status"><strong>本次临时凭据（关闭后不再显示）</strong><code>{issuedCredential.loginName || issuedCredential.userId}</code><code>{issuedCredential.temporaryPassword}</code></div> : null}</section>{error ? <p className="employee-profile-dialog-error" role="alert">{error}</p> : null}</div></section></div>;
}

function FinishedGoodsClassificationFilters({ category, goodsType, onCategoryChange, onGoodsTypeChange }) {
  return <div className="finished-goods-classification" aria-label="成品分类筛选">
    <div><span>成品大类</span><div role="tablist" aria-label="成品大类">{finishedGoodsCategories.map((item) => <button aria-selected={category === item} key={item} onClick={() => onCategoryChange(item)} role="tab" type="button">{item}</button>)}</div></div>
    <div><span>通货类型</span><div role="tablist" aria-label="通货类型">{finishedGoodsTypes.map((item) => <button aria-selected={goodsType === item} key={item} onClick={() => onGoodsTypeChange(item)} role="tab" type="button">{item}</button>)}</div></div>
  </div>;
}

function FinishedGoodsTypeFilters({ category, goodsType, onGoodsTypeChange }) {
  return <div className="finished-goods-classification inventory-type-filter" aria-label={`${category}通货类型筛选`}>
    <div><span>通货类型</span><div role="tablist" aria-label="通货类型">{finishedGoodsTypes.map((item) => <button aria-selected={goodsType === item} key={item} onClick={() => onGoodsTypeChange(item)} role="tab" type="button">{item}</button>)}</div></div>
  </div>;
}

function filterFinishedGoods(records, category, goodsType, query) {
  const normalized = query.trim().toLowerCase();
  return records.filter((record) => {
    const categoryMatch = category === "全部成品" || record.category === category;
    const typeMatch = goodsType === "全部类型" || record.goodsType === goodsType;
    const queryMatch = !normalized || Object.values(record).join(" ").toLowerCase().includes(normalized);
    return categoryMatch && typeMatch && queryMatch;
  });
}

function FinishedGoodsInventoryWorkspace({ category, formal, onNavigate, title }) {
  const [goodsType, setGoodsType] = useState("全部类型");
  const [query, setQuery] = useState("");
  const finishedGoodsInventoryRecords = useMemo(() => buildFinishedGoodsInventoryRecords(formal.data.inventoryItems), [formal.data.inventoryItems]);
  const categoryRecords = useMemo(() => finishedGoodsInventoryRecords.filter((record) => record.category === category), [category, finishedGoodsInventoryRecords]);
  const [selectedId, setSelectedId] = useState(categoryRecords[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [holdsOpen,setHoldsOpen]=useState(false);
  const rows = useMemo(() => filterFinishedGoods(finishedGoodsInventoryRecords, category, goodsType, query), [finishedGoodsInventoryRecords, category, goodsType, query]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const selectedException = getFinishedInventoryException(selected);
  const reset = () => { setGoodsType("全部类型"); setQuery(""); setSelectedId(categoryRecords[0]?.id || ""); setNotice(""); };
  const selectType = (value) => { setGoodsType(value); setSelectedId(""); setNotice(""); };

  const authoritativeItem = formal.data.inventoryItems.find(item => item.id === selected?.id || item.inventoryItemId === selected?.id);
  return <div className="business-workbench finished-goods-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>{title}</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${categoryRecords.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <FinishedGoodsTypeFilters category={category} goodsType={goodsType} onGoodsTypeChange={selectType} />
      <div className="finished-goods-search"><label><SearchOutlined /><input aria-label={`${title}搜索`} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索类型 / 规格 / 颜色 / 图案 / 库位" value={query} /></label><button disabled={!query && goodsType === "全部类型"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="finished-goods-table" role="table" aria-label="成品库存列表">
        <div className="finished-inventory-row head" role="row"><span>通货类型</span><span>规格（cm）</span><span>颜色 / 图案</span><span>库位</span><span>在库</span><span>库存结构</span></div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`finished-inventory-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" type="button"><span><SemanticOrderTag kind="business" value={row.goodsType} /></span><span className="finished-inventory-spec"><strong>{row.size}</strong></span><span className="finished-inventory-attributes"><FactoryColorLabel color={row.color} /><span>· {row.handle}{row.pattern !== "—" ? ` · ${row.pattern}` : ""}</span></span><span className="finished-inventory-location">{row.zone}</span><strong className="finished-inventory-total">{formatNumber(row.inStock)}</strong><InventoryAllocation stock={row} /></button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的成品库存</strong><span>切换通货类型或调整搜索条件后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel finished-goods-detail finished-inventory-detail">
      <header>{selected ? <div className="finished-inventory-detail-meta"><SemanticOrderTag kind="business" value={selected.goodsType} /><span className="finished-inventory-trust"><CheckCircleOutlined />{selected.trust}</span></div> : null}<h2 className="finished-inventory-detail-title">{selected ? <><strong>{selected.size}</strong><span>·</span><FactoryColorLabel color={selected.color} /></> : "暂无库存项"}</h2>{selectedException ? <StateText>{selectedException}</StateText> : null}</header>
      <div className="business-detail-scroll">{selected ? <><dl className="business-facts finished-inventory-context-facts"><div><dt>实际库位</dt><dd>{selected.zone}</dd></div><div><dt>提手</dt><dd>{selected.handle}</dd></div>{selected.pattern !== "—" ? <div><dt>现货图案</dt><dd>{selected.pattern}</dd></div> : null}</dl><section className="finished-inventory-stock-section"><h3>库存结构</h3><InventoryAllocation stock={selected} variant="detail" /></section>{holdsOpen && authoritativeItem ? <InventoryHoldsWorkbench item={authoritativeItem} formal={formal} onNavigate={onNavigate}/> : null}{operationsOpen && authoritativeItem ? <>
        <FinishedInventoryLedger key={`${selected.id}:${formal.meta.lastSyncedAt}`} authState={formal.authState} inventoryItemId={selected.id} />
        <FinishedInventoryCorrectionCreate item={authoritativeItem} authState={formal.authState} onConfirmed={formal.actions.refreshAll} />
      </> : null}</> : <div className="business-empty"><FileTextOutlined /><strong>暂无成品库存</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="secondary-button" disabled={!selected} onClick={()=>setHoldsOpen(value=>!value)} type="button">{holdsOpen?"收起留货与转单":"留货与转单"}</button><button className="primary" disabled={!selected} onClick={() => setOperationsOpen(value => !value)} type="button">{operationsOpen ? "收起流水与盘点" : "库存流水与盘点"}</button><button className="secondary-button" onClick={() => onNavigate("general-prices")} type="button">查看成品资料</button></footer>
    </aside>
  </div>;
}

function FinishedGoodsMasterWorkspace({ formal, onNavigate }) {
  const finishedGoodsMasterRecords = [];
  const [category, setCategory] = useState("全部成品");
  const [goodsType, setGoodsType] = useState("全部类型");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(finishedGoodsMasterRecords[0]?.id || "");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => filterFinishedGoods(finishedGoodsMasterRecords, category, goodsType, query), [category, goodsType, query]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const reset = () => { setCategory("全部成品"); setGoodsType("全部类型"); setQuery(""); setSelectedId(finishedGoodsMasterRecords[0]?.id || ""); setNotice(""); };
  const selectCategory = (value) => { setCategory(value); setSelectedId(""); setNotice(""); };
  const selectType = (value) => { setGoodsType(value); setSelectedId(""); setNotice(""); };

  return <div className="business-workbench finished-goods-workbench finished-master-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>成品资料</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${finishedGoodsMasterRecords.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <FinishedGoodsClassificationFilters category={category} goodsType={goodsType} onCategoryChange={selectCategory} onGoodsTypeChange={selectType} />
      <div className="finished-goods-search"><label><SearchOutlined /><input aria-label="成品资料搜索" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索袋类 / 类型 / 商品 / 图案 / 规格 / 系列 / 颜色" value={query} /></label><button disabled={!query && category === "全部成品" && goodsType === "全部类型"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="finished-goods-table" role="table" aria-label="成品资料列表">
        <div className="finished-master-row head" role="row"><span>成品大类</span><span>通货类型</span><span>标准规格</span><span>袋子系列</span><span>提手</span><span>通货单价</span></div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`finished-master-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" type="button"><strong>{row.category}</strong><span className="finished-master-product"><SemanticOrderTag kind="business" value={row.goodsType} /></span><strong>{row.size}</strong><span className="finished-master-scope"><strong>{row.goodsType === "印刷通货" ? row.pattern : row.seriesScope || "—"}</strong></span><span>{row.handleScope}</span><strong className="finished-master-price">{money(row.unitPrice)}</strong></button>) : <div className="business-empty"><SearchOutlined /><strong>正式成品资料接口尚未提供记录</strong><span>本页不再使用硬编码价格；接口上线后会在这里显示服务器发布的现货资料和价格。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel finished-goods-detail finished-master-detail">
      <header><span>{selected?.priceVersion || "成品资料"}</span><h2>{selected ? `${selected.pattern !== "—" ? selected.pattern : selected.goodsType} · ${selected.size}` : "暂无成品"}</h2></header>
      <div className="business-detail-scroll"><div className="source-provenance"><CheckCircleOutlined /><span>正式成品资料接口</span></div>{selected ? <><h3>成品定义</h3><dl className="business-facts"><div><dt>成品大类</dt><dd>{selected.category}</dd></div><div><dt>通货类型</dt><dd><SemanticOrderTag kind="business" value={selected.goodsType} /></dd></div>{selected.seriesScope || selected.pattern !== "—" ? <div><dt>袋子系列</dt><dd>{selected.seriesScope || selected.pattern}</dd></div> : null}<div><dt>标准规格</dt><dd>{selected.size}</dd></div><div><dt>匹配别名</dt><dd>{selected.aliases}</dd></div>{selected.goodsType === "印刷通货" ? <div><dt>现货颜色</dt><dd>{selected.colorScope}</dd></div> : null}<div><dt>提手范围</dt><dd>{selected.handleScope}</dd></div>{selected.goodsType === "印刷通货" ? <div><dt>图案规则</dt><dd>{selected.patternRule}</dd></div> : null}</dl><h3 className="finished-master-price-heading">价格信息</h3><dl className="business-facts finished-master-price-facts"><div><dt>通货单价</dt><dd>{money(selected.unitPrice)} / 个</dd></div><div><dt>价格说明</dt><dd>{selected.priceNote}</dd></div></dl></> : <div className="business-empty"><FileTextOutlined /><strong>暂无现货成品资料</strong></div>}<section className="business-boundary"><InfoCircleOutlined /><div><strong>资料范围</strong><p>本页只保存现货成品的内部标准规格和价格。定制尺寸按订单生产，生产多少交付多少，不建立成品资料，也不进入成品库存；实际现货数量继续在库存管理中查看。</p></div></section>{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="primary" disabled={!selected} onClick={() => setNotice(`当前查看 ${selected.priceVersion}；评审页不执行价格发布或修改。`)} type="button">查看价格版本</button><button className="secondary-button" onClick={() => onNavigate(selected?.category === "覆膜无纺布袋" ? "laminated-inventory" : "inventory-query")} type="button">查看对应库存</button></footer>
    </aside>
  </div>;
}

const todoViews = ["未处理", "今天要发", "异常/提醒", "待打印", "稍后提醒", "已处理", "全部"];
const todoAreas = ["全部业务", "订单", "库存", "出库", "财务", "生产", "设备", "其他"];

function todoArea(todo) {
  if (["order_draft", "order_line"].includes(todo.refType)) return "订单";
  if (todo.refType === "fulfillment") return "出库";
  if (todo.refType === "statement") return "财务";
  if (todo.refType === "inventory_item" || todo.refType === "inventory_correction") return "库存";
  if (todo.refType === "production_task") return "生产";
  if (todo.refType === "maintenance_task") return "设备";
  return "其他";
}

function todoMatchesView(todo, view) {
  if (view === "全部") return true;
  if (view === "未处理") return !todo.handled;
  if (view === "已处理") return Boolean(todo.handled);
  if (view === "今天要发") return !todo.handled && String(todo.latest).includes("今天");
  if (view === "异常/提醒") return !todo.handled && todo.urgency === "异常";
  if (view === "待打印") return !todo.handled && String(todo.type).includes("打印");
  if (view === "稍后提醒") return !todo.handled && Boolean(todo.snoozedUntil);
  return true;
}



export function TodoWorkspace({ formal, onNavigate }) {
  const sortedTodos = useMemo(() => sortTodos(formal.data.todos), [formal.data.todos]);
  const [view, setView] = useState("未处理");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("全部业务");
  const [selectedId, setSelectedId] = useState(sortedTodos[0]?.id || "");
  const [detailTab, setDetailTab] = useState("处理");
  const [notice, setNotice] = useState("");
  const areaMatched = sortedTodos.filter((todo) => area === "全部业务" || todoArea(todo) === area);
  const queryMatched = areaMatched.filter((todo) => !query.trim() || [todo.type, todo.customerName || customerName(todo.customerId), todo.ref, todo.summary, todo.impact].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const rows = queryMatched.filter((todo) => todoMatchesView(todo, view));
  const selected = rows.find((todo) => todo.id === selectedId) || rows[0] || null;
  const targetLink = resolveTodoWorkspaceLink(selected, formal.permissionContext);
  const resetDisabled = !query && area === "全部业务" && view === "未处理";
  const reset = () => { setQuery(""); setArea("全部业务"); setView("未处理"); setSelectedId(sortedTodos[0]?.id || ""); setNotice(""); };

  return <div className="business-workbench todo-source-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>公共待办</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${formal.data.todos.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <div className="todo-source-tabs" role="tablist" aria-label="待办状态快捷筛选">{todoViews.map((item) => <button aria-selected={view === item} key={item} onClick={() => { setView(item); setSelectedId(""); }} role="tab" type="button"><span>{item}</span><strong>{queryMatched.filter((todo) => todoMatchesView(todo, item)).length}</strong></button>)}</div>
      <div className="todo-source-filter"><label><span>关键词</span><div><SearchOutlined /><input aria-label="公共待办关键词" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="待办 / 客户 / 业务编号 / 摘要" value={query} /></div></label><label><span>业务范围</span><select aria-label="公共待办业务范围" onChange={(event) => { setArea(event.target.value); setSelectedId(""); }} value={area}>{todoAreas.map((item) => <option key={item}>{item}</option>)}</select></label><button disabled={resetDisabled} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="todo-source-table" role="table" aria-label="公共待办列表">
        <div className="todo-source-row head" role="row"><span>待办 / 客户</span><span>摘要 / 影响</span><span>最晚 / 等待</span><span>状态</span><span>业务引用</span></div>
        <div className="business-table-body">{rows.length ? rows.map((todo) => <button aria-pressed={selected?.id === todo.id} className={`todo-source-row${selected?.id === todo.id ? " selected" : ""}`} key={todo.id} onClick={() => { setSelectedId(todo.id); setNotice(""); }} role="row" type="button"><span><strong>{todo.type}</strong><small>{todo.customerName || customerName(todo.customerId)}</small></span><span><strong>{todo.summary}</strong><small>{todo.impact}</small></span><span><strong>{todo.latest}</strong><small>{todo.wait}</small></span><StateText>{todo.handled ? "已处理" : todo.urgency}</StateText><strong className="todo-source-ref">{todo.ref}</strong></button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的公共待办</strong><span>调整状态、关键词或业务范围后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel todo-source-detail">
      <header><span>{selected ? `${selected.customerName || customerName(selected.customerId)} · ${selected.ref}` : "公共待办"}</span><h2>{selected?.type || "暂无待办"}</h2>{selected ? <StateText>{selected.handled ? "已处理" : selected.urgency}</StateText> : null}</header>
      <div className="todo-detail-tabs" role="tablist" aria-label="公共待办详情">{["处理", "通知/打印", "记录"].map((item) => <button aria-selected={detailTab === item} key={item} onClick={() => setDetailTab(item)} role="tab" type="button">{item}</button>)}</div>
      <div className="business-detail-scroll"><div className="source-provenance"><CheckCircleOutlined /><span>正式公共待办 API</span></div>{selected ? <><h3>{detailTab === "处理" ? "任务信息" : detailTab}</h3><dl className="business-facts"><div><dt>待办编号</dt><dd>{selected.id}</dd></div><div><dt>客户</dt><dd>{selected.customerName || customerName(selected.customerId)}</dd></div><div><dt>提醒状态</dt><dd>{selected.handled ? "已处理" : selected.reminderLevelLabel || "正常"}</dd></div><div><dt>业务引用</dt><dd>{selected.ref}</dd></div><div><dt>摘要</dt><dd>{selected.summary}</dd></div><div><dt>最晚 / 等待</dt><dd>{selected.latest} / {selected.wait}</dd></div><div><dt>业务影响</dt><dd>{selected.impact}</dd></div></dl><TodoReminderForm todo={selected} authState={formal.authState} onSaved={formal.actions.refreshAll} /></> : <div className="business-empty"><FileTextOutlined /><strong>没有可显示的待办详情</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="primary" disabled={targetLink.disabled} title={targetLink.reason} onClick={() => !targetLink.disabled && onNavigate(targetLink.navId, targetLink)} type="button">{targetLink.label}</button><button className="secondary-button" onClick={() => void formal.actions.refreshAll()} type="button">刷新服务器数据</button></footer>
    </aside>
  </div>;
}

function OrderPoolWorkspace({ formal, onNavigate, focus = null }) {
  const [mutationId,setMutationId]=useState("");
  const [groupCorrectionId,setGroupCorrectionId]=useState("");
  const machineLabels = useMemo(() => buildMachineLabels(formal.data.machines), [formal.data.machines]);
  const officeOrders = useMemo(() => formal.data.orderLines.map((line) => ({
    ...line,
    customer: line.customerName || customerName(line.customerId),
    business: businessTypeFor(line),
    requirement: requirementFor(line),
    risk: riskFor(line),
    machine: line.machineId ? (machineLabels.get(line.machineId) || line.machineId) : "机台待确认",
  })), [formal.data.orderLines, machineLabels]);
  const [query, setQuery] = useState(focus?.query || "");
  const [tab, setTab] = useState("全部订单");
  const [selectedId, setSelectedId] = useState(focus?.recordId || officeOrders[0]?.id || "");
  const [notice, setNotice] = useState("");
  const rows = officeOrders.filter((order) => {
    const queryMatch = !query.trim() || Object.values(order).flat().join(" ").toLowerCase().includes(query.trim().toLowerCase());
    const tabMatch = tab === "全部订单" || (tab === "待处理" && /待|缺货|差异/.test(order.status)) || (tab === "生产中" && /制袋中|丝印中|生产中/.test(order.status)) || (tab === "待出库" && /待出库|已备货/.test(order.status));
    return queryMatch && tabMatch;
  });
  const selected = rows.find((order) => order.id === selectedId) || rows[0] || officeOrders[0];
  return <div className="business-workbench order-pool-workbench source-grounded-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>订单池</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${officeOrders.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <div className="order-pool-tools"><div className="business-subtabs" role="tablist">{["全部订单", "待处理", "生产中", "待出库"].map((item) => <button aria-selected={tab === item} key={item} onClick={() => setTab(item)} role="tab" type="button">{item}</button>)}</div><label><SearchOutlined /><input aria-label="订单池搜索" onChange={(event) => setQuery(event.target.value)} placeholder="客户 / 货品 / 规格 / 订单号" value={query} /></label></div>
      <div className="order-ledger" role="table" aria-label="订单池明细"><div className="order-ledger-row head"><span>客户</span><span>货品与规格</span><span>数量</span><span>状态</span><span>交付</span><span>风险</span></div><div className="business-table-body">{rows.length ? rows.map((order) => <button aria-pressed={selected?.id === order.id} className={`order-ledger-row${selected?.id === order.id ? " selected" : ""}`} key={order.id} onClick={() => { setSelectedId(order.id); setNotice(""); }} type="button"><strong>{order.customer}</strong><span className="order-product-cell"><strong>{order.product}</strong><small>{order.size} · {getLineColorSpecLabel(order) || order.color} <SemanticOrderTag kind="business" value={order.business} />{order.requirement ? <SemanticOrderTag kind="requirement" value={order.requirement} /> : null}</small></span><strong>{formatNumber(order.qty)}<small>个</small></strong><span className="order-state-cell"><StateText>{order.status}</StateText>{/制袋中|丝印中|生产中/.test(order.status) ? <small>{order.machine}</small> : null}</span><span>{order.fulfillment}<small>{order.latest}</small></span><span>{order.risk === "—" ? "—" : <StateText>{order.risk}</StateText>}</span></button>) : <div className="business-empty"><FileTextOutlined /><strong>服务器暂无订单</strong><span>刷新后仍为空时，请先在订单录入中创建订单。</span></div>}</div></div>
    </section>
    <aside className="business-detail-panel order-detail-panel"><header><span>{selected ? `${selected.customer} · ${selected.id}` : "订单池"}</span><h2>{selected?.product || "暂无订单"}</h2>{selected ? <div className="order-detail-tags"><SemanticOrderTag kind="business" value={selected.business} />{selected.requirement ? <SemanticOrderTag kind="requirement" value={selected.requirement} /> : null}</div> : null}</header><div className="business-detail-scroll">{selected ? <><OrderProgressSection status={selected.status} /><h3>订单事实</h3><dl className="business-facts"><div><dt>完整订单明细号</dt><dd>{selected.id}</dd></div><div><dt>规格与颜色</dt><dd>{selected.size} · {getLineColorSpecLabel(selected) || selected.color}</dd></div><div><dt>计划数量</dt><dd>{formatNumber(selected.qty)}个</dd></div><div><dt>库存状态</dt><dd>{selected.inventory}</dd></div><div><dt>当前状态</dt><dd>{selected.status}</dd></div><div><dt>机台</dt><dd>{selected.machine}</dd></div><div><dt>交付方式</dt><dd>{selected.fulfillment}</dd></div><div><dt>要求时间</dt><dd>{selected.latest}</dd></div><div><dt>金额</dt><dd>{money(selected.amount)}</dd></div><div><dt>当前风险</dt><dd>{selected.risk}</dd></div></dl></> : <div className="business-empty"><FileTextOutlined /><strong>服务器暂无订单</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div><footer><button className="primary" disabled={!selected} onClick={() => selected && onNavigate(getOrderProgress(selected.status).target)} type="button">{selected ? getOrderProgress(selected.status).action : "进入生产任务"}</button><button className="secondary-button" disabled={!selected || Boolean(mutationId) || Boolean(groupCorrectionId) || formal.orderEntryWritePending || !["order.quantity.adjust","order.void"].some(p=>formal.permissionContext?.actionPermissions?.includes(p))} onClick={()=>selected.printingPriceGroup?.memberCount>1?setGroupCorrectionId(selected.id):setMutationId(selected.id)} type="button">{selected?.printingPriceGroup?.memberCount>1?"整组印刷更正":"修改数量 / 作废"}</button><button className="secondary-button" onClick={() => void formal.actions.refreshAll()} type="button">刷新服务器数据</button></footer></aside>{mutationId?<OrderMutationDialog orderLineId={mutationId} authState={formal.authState} onClose={()=>setMutationId("")} onSaved={formal.actions.refreshAll}/>:null}{groupCorrectionId?<Suspense fallback={<p role="status">正在读取整组更正…</p>}><OrderPrintGroupCorrectionDialog orderLineId={groupCorrectionId} authState={formal.authState} onClose={()=>setGroupCorrectionId("")} onSaved={formal.actions.refreshAll} onPendingChange={formal.actions.setOrderEntryWritePending}/></Suspense>:null}
  </div>;
}

export function FocusedProductionWorkspace({ formal, onNavigate, taskId, loadDetail = getOfficeProductionTaskDetail }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    Promise.resolve().then(() => loadDetail({ authState: formal.authState, productionTaskId: taskId }, { serverRequired: true }))
      .then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setResult({ error: { message: "生产任务读取失败，请重试。" } }); });
    return () => { active = false; };
  }, [taskId, formal.authState?.session?.accessToken, loadDetail, attempt]);
  if (!result) return <div role="status">正在读取生产任务 {taskId}…</div>;
  const detail = result.detail;
  if (result.source !== "api" || result.blocked || detail?.productionTaskId !== taskId || !detail?.orderLineId) {
    return <div role="alert"><p>{result.error?.message || "没有取得对应生产任务，请核对编号或访问权限。"}</p><button onClick={() => setAttempt(value => value + 1)} type="button">重新读取任务</button></div>;
  }
  const focusedFormal = { ...formal, data: { ...formal.data, productionTasks: [detail] } };
  const config = buildWorkspaceConfigs(focusedFormal)["production-tasks"];
  return <GenericWorkspace key={taskId} config={{ ...config, onRefresh: () => setAttempt(value => value + 1) }} formal={focusedFormal} focusId={taskId} detailExtra={() => <ProductionPhotoReview key={`${taskId}:${detail.productionTask?.revision}:${formal.authState?.session?.accessToken || ""}:${JSON.stringify(formal.authState?.permissions?.actionPermissions)}`} detail={detail} authState={formal.authState} onSaved={() => refreshAfterProductionPhotoReview({ readTodos: () => formal.actions.readCollection("todos"), refreshDetail: () => setAttempt(value => value + 1) })} />} onNavigate={onNavigate} />;
}

export function BusinessWorkspace({ formal, navId, onNavigate, productionFocusId = "", workspaceFocus = null }) {
  const focus = workspaceFocus?.navId === navId ? workspaceFocus : null;
  if (navId === "production-tasks" && productionFocusId) return <FocusedProductionWorkspace key={`${productionFocusId}:${formal.authState?.session?.accessToken || ""}`} formal={formal} onNavigate={onNavigate} taskId={productionFocusId} />;
  if (["customer-statements", "print-devices"].includes(navId)) return <FinanceOperationsWorkspace key={navId} formal={formal} navId={navId} onNavigate={onNavigate} />;
  if (navId === "shared-todos") return <TodoWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "order-entry") return <OrderPricingEntryWorkspace key={`${formal.authState?.session?.accessToken || ""}:${formal.entryDraftId || "new"}`} formal={formal} onNavigate={onNavigate} />;
  if (navId === "order-pool") return <OrderPoolWorkspace key={focus?.token || "order-pool"} formal={formal} focus={focus} onNavigate={onNavigate} />;
  if (navId === "outbound-delivery") return <FulfillmentWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "supplier-month-end") return <SupplierSettlementWorkspace formal={formal} />;
  if (navId === "inventory-query") return <FinishedGoodsInventoryWorkspace category="无纺布袋" formal={formal} onNavigate={onNavigate} title="无纺布袋库存" />;
  if (navId === "laminated-inventory") return <FinishedGoodsInventoryWorkspace category="覆膜无纺布袋" formal={formal} onNavigate={onNavigate} title="覆膜袋库存" />;
  if (navId === "general-prices" || navId === "spec-inventory") return <FinishedGoodsMasterWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "payroll-attendance") return <PayrollAttendancePage authState={formal.authState} currentUser={formal.permissionContext?.user} permissionContext={formal.permissionContext} />;
  if (navId === "people-machines") return <PeopleMachinesWorkspace formal={formal} onNavigate={onNavigate} />;
  const configs = buildWorkspaceConfigs(formal);
  const config = configs[navId];
  if (!config) return <div className="business-missing"><WarningOutlined /><strong>当前 PC 代码没有这个独立页面</strong><span>{navId}</span></div>;
  return <GenericWorkspace key={focus?.token || navId} config={{ ...config, onRefresh: formal.actions.refreshAll }} focus={focus} onNavigate={onNavigate}
    detailExtra={navId === "packing-labels" ? selected => selected?.orderLineId ? <PhysicalPackagesPanel key={`${selected.id}:${formal.authState?.session?.accessToken || ""}`} formal={formal} orderLineId={selected.orderLineId}/> : null : navId === "production-tasks" ? selected => <><ProductionScheduleControls key={`${selected?.id || "empty"}:${selected?.sourceTask?.productionTask?.revision || 0}`} selected={selected} formal={formal} onSaved={formal.actions.refreshAll} />{selected?.sourceTask?.finishedGoodsPhoto?.attachmentId ? <ProductionPhotoReview key={`${selected.id}:${selected.sourceTask.productionTask?.revision}:${formal.authState?.session?.accessToken || ""}`} detail={selected.sourceTask} authState={formal.authState} onSaved={formal.actions.refreshAll} /> : null}</> : null} />;
}

export { completedBusinessWorkspaceIds };
