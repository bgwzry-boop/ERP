import { useState } from "react";
import { DetailPane, InfoGrid, MetricStrip, Segmented, StatusPill, Timeline } from "../../components/ui.jsx";
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
  getProductionPackingTaskListStatusText,
  getProductionProcessLabel,
  inferPackageCountFromQty,
  isProductionFinishedGoodsPhotoRequired,
  isProductionPackingTaskListFromApi,
  isProductionReportCandidate,
} from "../production/productionPackingPresentation.js";

export function WorkshopMobilePage({ orderLines, inventoryRecords, productionPacking, onAction, helpers }) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getOrderLineShortNo,
    getUiActionState,
    statusTone,
  } = helpers;
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const taskListStatusText = getProductionPackingTaskListStatusText(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const productionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const allPackingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const openPackingTasks = allPackingTasks.filter((task) => task.status !== "已完成");
  const [mode, setMode] = useState(productionLines.length ? "生产报工" : "打包任务");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(openPackingTasks[0]?.packingTaskId ?? "");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [finishedPhotoInputs, setFinishedPhotoInputs] = useState({});
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = openPackingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? openPackingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const selectedLine = mode === "打包任务" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const selectedInventoryItem = selectedLine ? resolveInventoryItem(selectedLine, selectedPackingTask) : null;
  const reportState = getUiActionState("workshopMobile", "报工完成");
  const reportDailyState = getUiActionState("workshopMobile", "报当日数量");
  const uploadFinishedPhotoState = getUiActionState("workshopMobile", "上传成品图");
  const packingState = getUiActionState("workshopMobile", "提交打包完成");
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoFile = selectedProductionLine ? finishedPhotoInputs[selectedProductionLine.id]?.file ?? null : null;
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const packingLabelsPrinted = getBooleanInput(packingInputs, selectedPackingTask?.packingTaskId, "labelsPrinted", false);
  const stats = [
    ["生产待报工", productionLines.length, productionLines.length ? "warning" : "success"],
    ["跨日继续", productionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["打包待提交", openPackingTasks.length, openPackingTasks.length ? "blue" : "success"],
    ["已打包", allPackingTasks.filter((task) => task.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || !selectedInventoryItem;
  const reportTitle = reportState.title || (!selectedInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine;
  const reportDailyTitle = reportDailyState.title || "";
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

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setMode("生产报工");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setMode("打包任务");
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

  return (
    <section className="page-grid workshop-mobile-layout">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact mobile-work-head">
          <div>
            <h2>移动任务池</h2>
            <span>车间只报合格数和机器计数；打包只报实包数和包裹数。{taskListStatusText}</span>
          </div>
          <Segmented value={mode} onChange={setMode} items={["生产报工", "打包任务"]} />
        </div>
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
            }) : <div className="empty-row">暂无待报工生产任务</div>
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
            }) : <div className="empty-row">暂无待打包任务</div>
          )}
        </div>
      </div>
      <DetailPane
        title={mode === "打包任务" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={selectedLine ? `${findCustomer(selectedLine.customerId).name} · ${selectedLine.id}` : "未选择"}
      >
        {selectedLine ? (
          <>
            <InfoGrid
              rows={[
                ["岗位入口", mode === "打包任务" ? "打包工手机端" : `${getProductionProcessLabel(selectedLine)}手机端`],
                ["货品", `${selectedLine.product} / ${selectedLine.size}`],
                ["颜色/单双面", `${getLineColorSpecLabel(selectedLine)} / ${getLinePrintSide(selectedLine)}`],
                ["数量", `${selectedLine.qty} 个`],
                ["交付", `${selectedLine.fulfillment} · ${selectedLine.latest}`],
                ["库存键", selectedInventoryItem ? `${selectedInventoryItem.id} / ${selectedInventoryItem.zone}` : "未找到匹配库存键"],
                ["跨日进度", formatProductionDailyProgressLabel(selectedLine) || "暂无日报数"],
                ["成品图", mode === "生产报工" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                ["备注", getLineRemark(selectedLine) || "无"],
              ]}
            />
            {mode === "生产报工" ? (
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
                <section className="detail-section finished-goods-photo-section">
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
                <div className="action-row">
                  <button
                    disabled={reportDailyDisabled}
                    title={reportDailyTitle}
                    onClick={() =>
                      onAction("报当日数量", {
                        entryLabel: "车间手机端",
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        dailyQualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报当日数量
                  </button>
                  <button
                    className="primary-action"
                    disabled={reportDisabled}
                    title={reportTitle}
                    onClick={() =>
                      onAction("报工完成", {
                        entryLabel: "车间手机端",
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        qualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报工完成
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    <label>
                      <span>标签状态</span>
                      <select value={packingLabelsPrinted ? "已打印" : "未打印"} onChange={(event) => updatePackingInput("labelsPrinted", event.target.value === "已打印")}>
                        <option>未打印</option>
                        <option>已打印</option>
                      </select>
                    </label>
                  </div>
                  <p>打包完成生成包裹和标签下一步；不会扣库存，仍由出库完成或快递快运拉走确认扣减。</p>
                </section>
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled}
                    title={packingTitle}
                    onClick={() =>
                      onAction("提交打包完成", {
                        entryLabel: "打包手机端",
                        packingTaskId: selectedPackingTask.packingTaskId,
                        packingTask: selectedPackingTask,
                        orderLineId: selectedPackingTask.orderLineId,
                        orderLine: selectedPackingTask.orderLine,
                        actualPackedQty: Number(packingActualQty || 0),
                        packageCount: Number(packingPackageCount || 1),
                        labelsPrinted: packingLabelsPrinted,
                      })
                    }
                  >
                    提交打包完成
                  </button>
                </div>
              </>
            )}
            <Timeline
              items={[
                mode === "打包任务" ? "生产完成进入打包手机端" : "发布任务到车间手机端",
                mode === "打包任务" ? "打包工填写实包数量和包裹数" : "岗位工填写合格数量和机器计数",
                mode === "打包任务" ? "包裹进入标签/出库下一步" : "合格品入库并占用给订单",
                "关键动作写后端 API 和操作日志",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">当前岗位暂无任务</div>
        )}
      </DetailPane>
    </section>
  );
}
