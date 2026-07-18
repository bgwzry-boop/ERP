import { useEffect, useRef, useState } from "react";
import {
  AppstoreOutlined,
  BarcodeOutlined,
  InboxOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DetailPane,
  InfoGrid,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  buildPackingTaskRows,
  formatCompactDateTime,
  formatProductionDailyProgressLabel,
  formatProductionFinishedGoodsPhotoLabel,
  getBooleanInput,
  getNumericInput,
  getProductionDailyProgress,
  getProductionFinishedGoodsPhoto,
  getProductionFinishedGoodsPhotoTone,
  getProductionProcessLabel,
  inferPackageCountFromQty,
  isProductionFinishedGoodsPhotoRequired,
  isProductionPackingTaskListFromApi,
  isProductionReportCandidate,
} from "../production/productionPackingPresentation.js";
import { buildPackingCompletionSummary } from "../../services/packingCompletionConfirmationClient.js";
import { buildProductionReportSummary } from "../../services/productionReportConfirmationClient.js";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function WorkshopMobilePage({ orderLines, inventoryRecords, productionPacking, onAction, onNavigate, helpers }) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getOrderLineShortNo,
    getUiActionState,
    currentUser,
    permissionContext,
    statusTone,
  } = helpers;
  const roleKeys = new Set([...(permissionContext?.roles ?? []), currentUser?.defaultRole].filter(Boolean));
  const permissionKeys = new Set([...(permissionContext?.buttonPermissions ?? []), ...(permissionContext?.actionPermissions ?? [])]);
  const canUseProductionMode = roleKeys.has("workshop");
  const canUsePackingMode = roleKeys.has("packing");
  const canUseRawMaterialScan = permissionKeys.has("raw_material.issue.create");
  const modeItems = [
    canUseProductionMode ? "生产报工" : "",
    canUsePackingMode ? "打包任务" : "",
  ].filter(Boolean);
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const productionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const allPackingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const openPackingTasks = allPackingTasks.filter((task) => task.status !== "已完成");
  const [mode, setMode] = useState(modeItems[0] || (productionLines.length ? "生产报工" : "打包任务"));
  const [mobileView, setMobileView] = useState("current");
  const [detailView, setDetailView] = useState("操作");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(openPackingTasks[0]?.packingTaskId ?? "");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [finishedPhotoInputs, setFinishedPhotoInputs] = useState({});
  const [productionReportConfirmation, setProductionReportConfirmation] = useState(null);
  const productionReportConfirmationRef = useRef(null);
  const productionDailyReportTriggerRef = useRef(null);
  const productionCompleteReportTriggerRef = useRef(null);
  const restoreProductionReportTriggerKindRef = useRef("");
  const [packingCompletionConfirmation, setPackingCompletionConfirmation] = useState(null);
  const packingCompletionConfirmationRef = useRef(null);
  const packingCompletionTriggerRef = useRef(null);
  const restorePackingCompletionTriggerFocusRef = useRef(false);
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = openPackingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? openPackingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const selectedLine = mode === "打包任务" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const selectedInventoryItem = selectedLine ? resolveInventoryItem(selectedLine, selectedPackingTask) : null;
  const reportState = getUiActionState("workshopMobile", "报工完成");
  const reportDailyState = getUiActionState("workshopMobile", "报当日数量");
  const productionExceptionState = getUiActionState("workshopMobile", "上报生产异常");
  const uploadFinishedPhotoState = getUiActionState("workshopMobile", "上传成品图");
  const packingState = getUiActionState("workshopMobile", "提交打包完成");
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoFile = selectedProductionLine ? finishedPhotoInputs[selectedProductionLine.id]?.file ?? null : null;
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const productionExceptionType = String(reportInputs[selectedProductionLine?.id]?.exceptionType ?? "");
  const productionExceptionLossQty = getNumericInput(reportInputs, selectedProductionLine?.id, "estimatedLossQty", 0);
  const productionExceptionAffectsDelivery = getBooleanInput(reportInputs, selectedProductionLine?.id, "exceptionAffectsDelivery", false);
  const productionExceptionRemark = String(reportInputs[selectedProductionLine?.id]?.exceptionRemark ?? "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const stats = [
    ...(canUseProductionMode ? [
      ["生产待报工", productionLines.length, productionLines.length ? "warning" : "success"],
      ["跨日继续", productionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ] : []),
    ...(canUsePackingMode ? [
      ["打包待提交", openPackingTasks.length, openPackingTasks.length ? "blue" : "success"],
      ["已打包", allPackingTasks.filter((task) => task.status === "已完成").length, "success"],
    ] : []),
  ];
  const selectedProductionPaused = String(selectedProductionLine?.status ?? selectedProductionLine?.lineStatus ?? "") === "异常暂停";
  const reportDisabled = reportState.disabled || !selectedProductionLine || !selectedInventoryItem || selectedProductionPaused;
  const reportTitle = reportState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : !selectedInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine || selectedProductionPaused;
  const reportDailyTitle = reportDailyState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : "");
  const productionExceptionDisabled = productionExceptionState.disabled || !selectedProductionLine || !productionExceptionType;
  const productionExceptionTitle = productionExceptionState.title || (!productionExceptionType ? "请先选择异常类型" : "");
  const latestProductionException =
    selectedProductionLine?.latestException ?? productionPacking.productionExceptionsByLineId?.[selectedProductionLine?.id] ?? null;
  const finishedPhotoUploadDisabled = uploadFinishedPhotoState.disabled || !selectedProductionLine || !selectedFinishedGoodsPhotoRequired;
  const finishedPhotoUploadTitle =
    uploadFinishedPhotoState.title ||
    (!selectedProductionLine
      ? "请先选择生产任务"
      : !selectedFinishedGoodsPhotoRequired
        ? "当前任务不强制上传成品图"
        : selectedFinishedGoodsPhotoFile
          ? `上传 ${selectedFinishedGoodsPhotoFile.name || "所选成品图"}`
          : "未选择文件时会登记一张样张，用于原型验证");
  const packingDisabled = packingState.disabled || !selectedPackingTask;
  const packingTitle = packingState.title || "";
  const detailViews = mode === "生产报工" ? ["操作", "任务", "成品图", "记录"] : ["操作", "任务", "记录"];

  useEffect(() => {
    if ((mode === "生产报工" && canUseProductionMode) || (mode === "打包任务" && canUsePackingMode)) return;
    setMode(canUseProductionMode ? "生产报工" : "打包任务");
    setDetailView("操作");
  }, [canUsePackingMode, canUseProductionMode, mode]);

  useEffect(() => {
    setProductionReportConfirmation(null);
  }, [selectedProductionLine?.id, mode, detailView]);

  useEffect(() => {
    if (productionReportConfirmation) {
      productionReportConfirmationRef.current?.focus();
      return;
    }
    const triggerKind = restoreProductionReportTriggerKindRef.current;
    if (!triggerKind) return;
    restoreProductionReportTriggerKindRef.current = "";
    (triggerKind === "daily" ? productionDailyReportTriggerRef : productionCompleteReportTriggerRef).current?.focus();
  }, [productionReportConfirmation]);

  useEffect(() => {
    setPackingCompletionConfirmation(null);
  }, [selectedPackingTask?.packingTaskId, mode, detailView]);

  useEffect(() => {
    if (packingCompletionConfirmation) {
      packingCompletionConfirmationRef.current?.focus();
      return;
    }
    if (restorePackingCompletionTriggerFocusRef.current) {
      restorePackingCompletionTriggerFocusRef.current = false;
      packingCompletionTriggerRef.current?.focus();
    }
  }, [packingCompletionConfirmation]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setDetailView("操作");
  }

  function openMode(nextMode) {
    changeMode(nextMode);
    setMobileView("pending");
  }

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setMode("生产报工");
    setDetailView("操作");
    setMobileView("current");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setMode("打包任务");
    setDetailView("操作");
    setMobileView("current");
  }

  function updateReportInput(field, value) {
    if (!selectedProductionLine) return;
    setReportInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        [field]: value,
      },
    }));
  }

  function buildProductionReportPayload(kind) {
    if (!selectedProductionLine) return null;
    const customer = findCustomer(selectedProductionLine.customerId);
    const qualifiedQty = Number(reportQualifiedQty || 0);
    return {
      entryLabel: "车间手机端",
      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
      productionTask: selectedProductionLine.productionTask ?? selectedProductionLine,
      orderLineId: selectedProductionLine.id,
      orderLine: selectedProductionLine,
      customerName: customer?.name ?? selectedProductionLine.customerName ?? "",
      goodsSummary: [
        selectedProductionLine.product ?? selectedProductionLine.productName,
        selectedProductionLine.size,
        getLineColorSpecLabel(selectedProductionLine),
        getLinePrintSide(selectedProductionLine),
        getLineRemark(selectedProductionLine),
      ].filter(Boolean).join(" · "),
      ...(kind === "daily" ? { dailyQualifiedQty: qualifiedQty } : { qualifiedQty }),
      exceptionQty: Number(reportExceptionQty || 0),
      machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
    };
  }

  function submitProductionException(continuationMode) {
    if (!selectedProductionLine || !productionExceptionType) return;
    onAction("上报生产异常", {
      entryLabel: "车间手机端",
      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
      orderLineId: selectedProductionLine.id,
      orderLine: selectedProductionLine,
      exceptionType: productionExceptionType,
      continuationMode,
      estimatedLossQty: Number(productionExceptionLossQty || 0),
      affectsDelivery: productionExceptionAffectsDelivery,
      remark: productionExceptionRemark,
    });
  }

  function requestProductionReportConfirmation(kind) {
    const payload = buildProductionReportPayload(kind);
    if (!payload) return;
    setProductionReportConfirmation({
      kind,
      action: kind === "daily" ? "报当日数量" : "报工完成",
      payload,
      summary: buildProductionReportSummary({
        kind,
        productionTask: payload.productionTask,
        orderLine: selectedProductionLine,
        customerName: payload.customerName,
        payload,
      }),
    });
  }

  function confirmProductionReport() {
    if (!productionReportConfirmation) return;
    const { action, payload } = productionReportConfirmation;
    setProductionReportConfirmation(null);
    onAction(action, { ...payload, productionReportConfirmed: true });
  }

  function returnToProductionReportEdit() {
    restoreProductionReportTriggerKindRef.current = productionReportConfirmation?.kind ?? "";
    setProductionReportConfirmation(null);
  }

  function handleProductionReportConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToProductionReportEdit();
  }

  function updateFinishedPhotoFile(file) {
    if (!selectedProductionLine) return;
    setFinishedPhotoInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        file: file ?? null,
      },
    }));
  }

  function updatePackingInput(field, value) {
    if (!selectedPackingTask) return;
    setPackingInputs((current) => ({
      ...current,
      [selectedPackingTask.packingTaskId]: {
        ...(current[selectedPackingTask.packingTaskId] ?? {}),
        [field]: value,
      },
    }));
  }

  function buildPackingCompletionPayload() {
    if (!selectedPackingTask?.orderLine) return null;
    const orderLine = selectedPackingTask.orderLine;
    const customer = findCustomer(orderLine.customerId);
    return {
      entryLabel: "打包手机端",
      packingTaskId: selectedPackingTask.packingTaskId,
      packingTask: selectedPackingTask,
      orderLineId: selectedPackingTask.orderLineId,
      orderLine,
      customerName: customer?.name ?? orderLine.customerName ?? "",
      goodsSummary: [
        orderLine.product ?? orderLine.productName,
        orderLine.size,
        getLineColorSpecLabel(orderLine),
        getLinePrintSide(orderLine),
        getLineRemark(orderLine),
      ].filter(Boolean).join(" · "),
      actualPackedQty: Number(packingActualQty || 0),
      packageCount: Number(packingPackageCount || 1),
    };
  }

  function requestPackingCompletion() {
    const payload = buildPackingCompletionPayload();
    if (!payload) return;
    setPackingCompletionConfirmation({
      payload,
      summary: buildPackingCompletionSummary({
        packingTask: selectedPackingTask,
        orderLine: selectedPackingTask.orderLine,
        customerName: payload.customerName,
        payload,
      }),
    });
  }

  function confirmPackingCompletion() {
    if (!packingCompletionConfirmation) return;
    const { payload } = packingCompletionConfirmation;
    setPackingCompletionConfirmation(null);
    onAction("提交打包完成", { ...payload, packingCompletionConfirmed: true });
  }

  function returnToPackingCompletionEdit() {
    restorePackingCompletionTriggerFocusRef.current = true;
    setPackingCompletionConfirmation(null);
  }

  function handlePackingCompletionConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToPackingCompletionEdit();
  }

  const pendingCount = mode === "打包任务" ? openPackingTasks.length : productionLines.length;
  const roleTitle = mode === "打包任务" ? "打包任务" : `${getProductionProcessLabel(selectedLine || productionLines[0]) || "车间"}报工`;

  return (
    <section className={`guided-mobile-page workshop-mobile-workbench view-${mobileView}`}>
      <header className="guided-mobile-hero">
        <div>
          <h1>{roleTitle}</h1>
        </div>
        <strong>{pendingCount}<small>待处理</small></strong>
      </header>

      {mobileView === "pending" ? <OperationalPanel className="table-pane mobile-role-task-panel workshop-task-panel" ariaLabel={mode === "打包任务" ? "打包移动任务" : "车间移动任务"}>
        <MetricStrip items={stats} ariaLabel={mode === "打包任务" ? "打包任务摘要" : "车间任务摘要"} />
        <PanelHeader
          title={mode === "打包任务" ? "打包任务" : "生产任务"}
          actions={modeItems.length > 1 ? <Segmented ariaLabel="现场任务模式" value={mode} onChange={changeMode} items={modeItems} /> : null}
        />
        <div className="mobile-task-list">
          {mode === "生产报工" ? (
            productionLines.length ? productionLines.map((line) => {
              const customer = findCustomer(line.customerId);
              const inventoryItem = resolveInventoryItem(line);
              const lineTitle = `${getProductionProcessLabel(line)} · ${getOrderLineShortNo(line)}`;
              return (
                <button className={`mobile-task-row ${line.id === selectedProductionLine?.id ? "active" : ""}`} key={line.id} onClick={() => selectProductionLine(line.id)}>
                  <div>
                    <strong>{lineTitle}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · {line.qty} 个 · {formatProductionDailyProgressLabel(line) || line.latest}</small>
                  </div>
                  <StatusPill tone={inventoryItem ? statusTone(line.status) : "danger"}>{inventoryItem ? line.status : "缺库存键"}</StatusPill>
                </button>
              );
            }) : <DataState title="暂无待报工生产任务" compact />
          ) : (
            openPackingTasks.length ? openPackingTasks.map((task) => {
              const line = task.orderLine;
              const customer = findCustomer(line.customerId);
              return (
                <button className={`mobile-task-row ${task.packingTaskId === selectedPackingTask?.packingTaskId ? "active" : ""}`} key={task.packingTaskId} onClick={() => selectPackingTask(task.packingTaskId)}>
                  <div>
                    <strong>打包 · {getOrderLineShortNo(line)}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · 计划 {task.plannedQty} 个 · {task.packageCount ?? inferPackageCountFromQty(task.plannedQty)} 包</small>
                  </div>
                  <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
                </button>
              );
            }) : <DataState title="暂无待打包任务" compact />
          )}
        </div>
      </OperationalPanel> : null}
      {mobileView === "current" ? <DetailPane
        className="mobile-role-detail-pane workshop-detail-pane"
        title={mode === "打包任务" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={selectedLine ? `${findCustomer(selectedLine.customerId).name} · ${selectedLine.id}` : "未选择"}
      >
        {selectedLine ? (
          <>
            <div className="mobile-role-detail-tabs">
              <Segmented ariaLabel="车间任务详情" value={detailView} onChange={setDetailView} items={detailViews} />
            </div>
            {detailView === "任务" ? (
              <section className="mobile-role-stage mobile-role-summary-stage">
                <InfoGrid
                  rows={[
                    ["货品", `${selectedLine.product} / ${selectedLine.size}`],
                    ["颜色/单双面", `${getLineColorSpecLabel(selectedLine)} / ${getLinePrintSide(selectedLine)}`],
                    ["数量", `${selectedLine.qty} 个`],
                    ["交付", `${selectedLine.fulfillment} · ${selectedLine.latest}`],
                    ["库存键", selectedInventoryItem ? `${selectedInventoryItem.id} / ${selectedInventoryItem.zone}` : "未找到匹配库存键"],
                    ["跨日进度", formatProductionDailyProgressLabel(selectedLine) || "暂无日报数"],
                    ["成品图", mode === "生产报工" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                    ["生产异常", mode === "生产报工" && latestProductionException ? `${latestProductionException.exceptionType} · ${latestProductionException.continuationMode}` : "无"],
                    ["备注", getLineRemark(selectedLine) || "无"],
                  ]}
                />
              </section>
            ) : null}
            {mode === "生产报工" && detailView === "操作" ? (
              <>
                {!productionReportConfirmation ? (
                  <>
                  <section className="detail-section">
                  <h3>车间报工</h3>
                  <div className="detail-form">
                    <label>
                      <span>合格数量</span>
                      <input type="number" min="1" value={reportQualifiedQty} onChange={(event) => updateReportInput("qualifiedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>异常/废品数</span>
                      <input type="number" min="0" value={reportExceptionQty} onChange={(event) => updateReportInput("exceptionQty", event.target.value)} />
                    </label>
                    <label>
                      <span>机器计数/动作次数</span>
                      <input type="number" min="0" placeholder="只作凭证" value={reportMachineCount} onChange={(event) => updateReportInput("machineCount", event.target.value)} />
                    </label>
                  </div>
                  <p>报当日数量只记录跨日继续和剩余数量，不入库；报工完成才会进入库存和后续打包。</p>
                </section>
                <section className="detail-section production-exception-report">
                  <div className="section-title-row">
                    <h3>生产异常</h3>
                    <StatusPill tone={latestProductionException?.continuationMode === "暂停等确认" ? "danger" : "warning"}>
                      {latestProductionException?.status || "未上报"}
                    </StatusPill>
                  </div>
                  <div className="detail-form">
                    <label>
                      <span>异常类型</span>
                      <select value={productionExceptionType} onChange={(event) => updateReportInput("exceptionType", event.target.value)}>
                        <option value="">请选择</option>
                        <option>印刷问题</option>
                        <option>材料问题</option>
                        <option>机器问题</option>
                        <option>尺寸/模具问题</option>
                        <option>数量异常</option>
                        <option>客户/订单信息不清</option>
                        <option>其他</option>
                      </select>
                    </label>
                    <label>
                      <span>预估异常数</span>
                      <input type="number" min="0" value={productionExceptionLossQty} onChange={(event) => updateReportInput("estimatedLossQty", event.target.value)} />
                    </label>
                    <label>
                      <span>异常说明</span>
                      <input value={productionExceptionRemark} placeholder="其他类型必填" onChange={(event) => updateReportInput("exceptionRemark", event.target.value)} />
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={productionExceptionAffectsDelivery} onChange={(event) => updateReportInput("exceptionAffectsDelivery", event.target.checked)} />
                      <span>可能影响交付时间</span>
                    </label>
                  </div>
                  <p>异常数量只作追溯；上报会建待办，不会写库存、占用、打包或对账。</p>
                  <div className="action-row mobile-role-stage-actions">
                    <button disabled={productionExceptionDisabled} title={productionExceptionTitle} onClick={() => submitProductionException("继续生产")}>报异常并继续</button>
                    <button className="danger-action" disabled={productionExceptionDisabled} title={productionExceptionTitle} onClick={() => submitProductionException("暂停等确认")}>报异常并暂停</button>
                  </div>
                </section>
                </>
                ) : null}
                <div className="action-row mobile-role-stage-actions">
                  <button
                    disabled={reportDailyDisabled || Boolean(productionReportConfirmation)}
                    ref={productionDailyReportTriggerRef}
                    title={reportDailyTitle}
                    onClick={() => requestProductionReportConfirmation("daily")}
                  >
                    报当日数量
                  </button>
                  <button
                    className="primary-action"
                    disabled={reportDisabled || Boolean(productionReportConfirmation)}
                    ref={productionCompleteReportTriggerRef}
                    title={reportTitle}
                    onClick={() => requestProductionReportConfirmation("complete")}
                  >
                    报工完成
                  </button>
                </div>
                {productionReportConfirmation ? (
                  <section
                    aria-describedby="workshop-production-report-confirmation-summary"
                    aria-labelledby="workshop-production-report-confirmation-title"
                    aria-live="assertive"
                    className="production-report-confirmation"
                    onKeyDown={handleProductionReportConfirmationKeyDown}
                    ref={productionReportConfirmationRef}
                    role="region"
                    tabIndex={-1}
                  >
                    <div className="production-report-confirmation-head">
                      <div>
                        <strong id="workshop-production-report-confirmation-title">{productionReportConfirmation.summary.title}</strong>
                        <span id="workshop-production-report-confirmation-summary">
                          {productionReportConfirmation.kind === "daily"
                            ? "确认后才会写入当日进度；按 Esc 可返回修改。"
                            : "确认后才会完成生产、入库、占用并创建待打包任务；按 Esc 可返回修改。"}
                        </span>
                      </div>
                      <StatusPill tone="warning">高风险写入</StatusPill>
                    </div>
                    <div className="production-report-confirmation-grid">
                      {productionReportConfirmation.summary.fields.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <ul className="production-report-confirmation-effects">
                      {productionReportConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <div className="production-report-confirmation-actions">
                      <button type="button" onClick={returnToProductionReportEdit}>返回修改</button>
                      <button
                        className="primary-action"
                        type="button"
                        disabled={productionReportConfirmation.kind === "daily" ? reportDailyDisabled : reportDisabled}
                        onClick={confirmProductionReport}
                      >
                        {productionReportConfirmation.kind === "daily" ? "确认提交当日报数" : "确认完成生产报工"}
                      </button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
            {mode === "生产报工" && detailView === "成品图" ? (
              <section className="detail-section finished-goods-photo-section mobile-role-stage">
                  <div className="section-title-row">
                    <h3>定制成品图</h3>
                    <StatusPill tone={getProductionFinishedGoodsPhotoTone(selectedFinishedGoodsPhoto)}>
                      {selectedFinishedGoodsPhoto.status}
                    </StatusPill>
                  </div>
                  <InfoGrid
                    rows={[
                      ["当前附件", selectedFinishedGoodsPhoto.fileName || selectedFinishedGoodsPhoto.attachmentId || "未上传"],
                      ["上传时间", selectedFinishedGoodsPhoto.uploadedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.uploadedAt) : "未上传"],
                      ["办公室复核", selectedFinishedGoodsPhoto.reviewedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.reviewedAt) : "待确认"],
                      ["退回原因", selectedFinishedGoodsPhoto.rejectedReason || "无"],
                    ]}
                  />
                  <div className="detail-form single">
                    <label>
                      <span>拍照/选择图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={finishedPhotoUploadDisabled}
                        onChange={(event) => updateFinishedPhotoFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <p>车间只上传或重拍成品图；是否合格和是否通知客户由办公室复核确认。</p>
                  <div className="action-row">
                    <button
                      disabled={finishedPhotoUploadDisabled}
                      title={finishedPhotoUploadTitle}
                      onClick={() =>
                        onAction("上传成品图", {
                          entryLabel: "车间手机端",
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                          photoFile: selectedFinishedGoodsPhotoFile,
                        })
                      }
                    >
                      {selectedFinishedGoodsPhoto.attachmentId ? "重拍/重传成品图" : "上传成品图"}
                    </button>
                  </div>
              </section>
            ) : null}
            {mode === "打包任务" && detailView === "操作" ? (
              <>
                {!packingCompletionConfirmation ? (
                  <section className="detail-section">
                    <h3>打包提交</h3>
                    <div className="detail-form">
                      <label>
                        <span>实际打包数量</span>
                        <input type="number" min="1" value={packingActualQty} onChange={(event) => updatePackingInput("actualPackedQty", event.target.value)} />
                      </label>
                      <label>
                        <span>包裹数</span>
                        <input type="number" min="1" value={packingPackageCount} onChange={(event) => updatePackingInput("packageCount", event.target.value)} />
                      </label>
                    </div>
                    <p>打包完成生成包裹；快递快运统一等待服务端确认标签打印完成。不会扣库存，仍由出库完成或快递快运拉走确认扣减。</p>
                  </section>
                ) : null}
                <div className="action-row mobile-role-stage-actions">
                  <button
                    className="primary-action"
                    disabled={packingDisabled || Boolean(packingCompletionConfirmation)}
                    ref={packingCompletionTriggerRef}
                    title={packingTitle}
                    onClick={requestPackingCompletion}
                  >
                    提交打包完成
                  </button>
                </div>
                {packingCompletionConfirmation ? (
                  <section
                    aria-describedby="workshop-packing-completion-confirmation-summary"
                    aria-labelledby="workshop-packing-completion-confirmation-title"
                    aria-live="assertive"
                    className="packing-completion-confirmation"
                    onKeyDown={handlePackingCompletionConfirmationKeyDown}
                    ref={packingCompletionConfirmationRef}
                    role="region"
                    tabIndex={-1}
                  >
                    <div className="packing-completion-confirmation-head">
                      <div>
                        <strong id="workshop-packing-completion-confirmation-title">{packingCompletionConfirmation.summary.title}</strong>
                        <span id="workshop-packing-completion-confirmation-summary">确认后才会生成包裹并写入打包结果；按 Esc 可返回修改。</span>
                      </div>
                      <StatusPill tone="warning">高风险写入</StatusPill>
                    </div>
                    <div className="packing-completion-confirmation-grid">
                      {packingCompletionConfirmation.summary.fields.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <ul className="packing-completion-confirmation-effects">
                      {packingCompletionConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <div className="packing-completion-confirmation-actions">
                      <button type="button" onClick={returnToPackingCompletionEdit}>返回修改</button>
                      <button className="primary-action" type="button" disabled={packingDisabled} onClick={confirmPackingCompletion}>确认提交打包完成</button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
            {detailView === "记录" ? (
              <section className="mobile-role-stage mobile-role-history-stage">
                <Timeline
                  items={[
                    mode === "打包任务" ? "生产完成进入打包手机端" : "发布任务到车间手机端",
                    mode === "打包任务" ? "打包工填写实包数量和包裹数" : "岗位工填写合格数量和机器计数",
                    mode === "打包任务" ? "包裹进入标签/出库下一步" : "合格品入库并占用给订单",
                    "关键动作写后端 API 和操作日志",
                  ]}
                />
              </section>
            ) : null}
          </>
        ) : (
          <DataState title="当前岗位暂无任务" detail="切换任务模式或刷新任务池后重试。" compact />
        )}
      </DetailPane> : null}

      {mobileView === "all" ? (
        <section className="guided-mobile-functions" aria-label="现场岗位全部功能">
          <header><h2>全部功能</h2></header>
          <div>
            {canUseProductionMode ? <button onClick={() => openMode("生产报工")} type="button"><ToolOutlined /><strong>生产报工</strong><span>{productionLines.length} 条</span></button> : null}
            {canUsePackingMode ? <button onClick={() => openMode("打包任务")} type="button"><InboxOutlined /><strong>打包任务</strong><span>{openPackingTasks.length} 条</span></button> : null}
            {canUseRawMaterialScan ? <button onClick={() => onNavigate?.("rawMaterialScanner")} type="button"><BarcodeOutlined /><strong>原料扫码</strong><span>扫卷领料</span></button> : null}
            <button disabled={!selectedLine} onClick={() => { setDetailView("记录"); setMobileView("current"); }} type="button"><UnorderedListOutlined /><strong>任务记录</strong><span>{selectedLine ? "查看" : "暂无"}</span></button>
          </div>
        </section>
      ) : null}

      <nav className="mobile-role-bottom-nav" aria-label="现场岗位手机导航">
        {MOBILE_VIEWS.map(([key, label, Icon]) => (
          <button aria-current={mobileView === key ? "page" : undefined} className={mobileView === key ? "active" : ""} key={key} onClick={() => setMobileView(key)} type="button">
            <Icon aria-hidden="true" /><span>{label}</span>
            {key === "pending" && pendingCount ? <b>{pendingCount}</b> : null}
          </button>
        ))}
      </nav>
    </section>
  );
}
