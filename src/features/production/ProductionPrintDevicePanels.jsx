import { getPrintJobStatusLabel, getPrintJobDocumentLabel } from "../../../shared/printJobPresentation.js";
import { StatusPill } from "../../shared/ui/operational.jsx";
import { formatOperationalError } from "../../shared/ui/errorPresentation.js";
import {
  PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS,
  PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
} from "../../services/printerDeviceFieldTestClient.js";

const PRINT_DRIVER_MODE_OPTIONS = [
  { value: "preview_only", label: "仅预览" },
  { value: "system_printer", label: "系统打印" },
];

export function PrinterDeviceQaPanel({
  qaState = {},
  saveState = {},
  deviceModeSaveState = {},
  onRefresh,
  onSelectDevice,
  onChangeField,
  onChangeCheck,
  onChangeEvidence,
  onSaveDeviceMode,
  onSave,
}) {
  const devices = Array.isArray(qaState.devices) ? qaState.devices : [];
  const checks = Array.isArray(qaState.checks) ? qaState.checks : [];
  const eligiblePrintJobs = Array.isArray(qaState.eligiblePrintJobs) ? qaState.eligiblePrintJobs : [];
  const selectedDevice = devices.find((item) => item.printDeviceId === qaState.selectedDeviceId) ?? null;
  const selectedPrintJob = eligiblePrintJobs.find((item) => item.printJobId === qaState.selectedPrintJobId) ?? null;
  const latestRecord = qaState.latestRecord ?? selectedDevice?.latestFieldTestRecord ?? null;
  const summary = getPrinterDeviceFieldTestSummary(checks);
  const evidence = qaState.evidence ?? latestRecord?.evidence ?? latestRecord?.summary?.evidence ?? {};
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const currentDriverMode = getPrinterDeviceDriverMode(selectedDevice);
  const draftDriverMode = qaState.driverModeDraft || currentDriverMode;
  const driverModeChanged = Boolean(selectedDevice && draftDriverMode !== currentDriverMode);
  const sourceLabel = getPrinterDeviceQaSourceLabel(qaState);
  const sourceTone = qaState.error
    ? "danger"
    : qaState.source === "api" || qaState.recordSource === "api"
      ? "success"
      : qaState.source === "idle"
        ? "neutral"
        : "warning";
  const acceptanceCandidate = summary.passedCount === summary.total && evidenceSummary.complete;
  const saveDisabled = Boolean(
    saveState.disabled ||
      qaState.loading ||
      qaState.saving ||
      !qaState.selectedDeviceId ||
      (acceptanceCandidate && !selectedPrintJob),
  );
  const saveModeDisabled = Boolean(
    deviceModeSaveState.disabled ||
      qaState.loading ||
      qaState.savingDeviceMode ||
      !qaState.selectedDeviceId ||
      !driverModeChanged,
  );
  const saveTitle =
    saveState.title ||
    (!qaState.selectedDeviceId
      ? "请先选择打印设备"
      : acceptanceCandidate && !selectedPrintJob
        ? "六项通过且证据完整时，必须关联该设备的已打印作业"
        : qaState.loading
          ? "设备验收记录刷新中"
          : "");
  const statusText = qaState.error
    ? formatOperationalError(qaState.error, "验收记录读取失败，请刷新重试。")
    : latestRecord
      ? `最新记录 ${latestRecord.recordId} · ${formatPrinterDeviceQaDateTime(latestRecord.checkedAt)}`
      : qaState.loading
        ? "正在读取打印设备和验收记录"
        : "暂无已保存验收记录";

  return (
    <section className="detail-section driver-field-test-section printer-device-qa-section">
      <div className="section-title-row printer-device-qa-head">
        <div>
          <h3>打印设备验收</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={qaState.loading}>
            {qaState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="printer-device-qa-select-row">
        <label>
          <span>设备</span>
          <select
            value={qaState.selectedDeviceId ?? ""}
            onChange={(event) => onSelectDevice?.(event.target.value)}
            disabled={qaState.loading || !devices.length}
          >
            {devices.length ? null : <option value="">未配置打印设备</option>}
            {devices.map((device) => (
              <option value={device.printDeviceId} key={device.printDeviceId}>
                {device.name || device.printDeviceId}
              </option>
            ))}
          </select>
        </label>
        <span className={`driver-device-summary ${summary.tone}`}>{summary.label}</span>
      </div>
      <div className="printer-device-mode-row">
        <div className={`printer-device-mode-current ${currentDriverMode === "system_printer" ? "success" : "warning"}`}>
          <span>当前模式</span>
          <strong>{getPrintDriverModeLabel(currentDriverMode)}</strong>
          <small>{currentDriverMode === "system_printer" ? "允许真实系统打印" : "仅预览，不出纸"}</small>
        </div>
        <label>
          <span>目标模式</span>
          <select
            value={draftDriverMode}
            onChange={(event) => onChangeField?.("driverModeDraft", event.target.value)}
            disabled={qaState.loading || qaState.savingDeviceMode || !qaState.selectedDeviceId}
          >
            {PRINT_DRIVER_MODE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSaveDeviceMode}
          disabled={saveModeDisabled}
          title={
            deviceModeSaveState.title ||
            (!qaState.selectedDeviceId
              ? "请先选择打印设备"
              : !driverModeChanged
                ? "设备模式没有变化"
                : "")
          }
        >
          {qaState.savingDeviceMode ? "保存中" : "保存设备模式"}
        </button>
      </div>
      <small className="printer-device-mode-note">
        切到系统打印只代表 ERP 允许派发真实打印，仍需 V1 门禁、spool 回读和现场 QA 通过。
      </small>
      <div className="driver-field-test-form printer-device-qa-form">
        <label>
          <span>已打印作业</span>
          <select
            value={qaState.selectedPrintJobId ?? ""}
            onChange={(event) => onChangeField?.("selectedPrintJobId", event.target.value)}
          >
            <option value="">{eligiblePrintJobs.length ? "暂不关联" : "暂无该设备已打印作业"}</option>
            {eligiblePrintJobs.map((printJob) => (
              <option value={printJob.printJobId} key={printJob.printJobId}>
                {printJob.printJobId} · {getPrintDocumentTypeLabel(printJob.documentType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>设备标签</span>
          <input
            value={qaState.deviceLabel ?? ""}
            onChange={(event) => onChangeField?.("deviceLabel", event.target.value)}
            placeholder="如 标签机A"
          />
        </label>
        <label>
          <span>驱动/连接</span>
          <input
            value={qaState.driverLabel ?? ""}
            onChange={(event) => onChangeField?.("driverLabel", event.target.value)}
            placeholder="如 EPSON LQ-610KII/615KII / USB"
          />
        </label>
        <label>
          <span>纸张</span>
          <input
            value={qaState.paperLabel ?? ""}
            onChange={(event) => onChangeField?.("paperLabel", event.target.value)}
            placeholder="如 80x60 热敏标签"
          />
        </label>
      </div>
      <small className="printer-device-mode-note">
        失败或未测记录可直接保存；六项全通过且证据完整时，必须关联同设备、同单据类型的已打印作业。
      </small>
      <div className="driver-field-test-list printer-device-qa-checks">
        {checks.map((item) => (
          <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.target}</span>
              <small>现场手动确认，保存后生成 PDQA 验收记录</small>
            </div>
            <select value={item.status} onChange={(event) => onChangeCheck?.(item.key, event.target.value)}>
              {PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="printer-device-qa-evidence">
        <div className="printer-device-qa-evidence-head">
          <strong>验收证据</strong>
          <span className={`driver-device-summary ${evidenceSummary.tone}`}>{evidenceSummary.label}</span>
        </div>
        <div className="printer-device-qa-evidence-grid">
          {PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.map((item) => (
            <label key={item.key}>
              <span>{item.label}</span>
              <input
                value={evidence[item.key] ?? ""}
                onChange={(event) => onChangeEvidence?.(item.key, event.target.value)}
                placeholder={item.placeholder}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="driver-field-test-note printer-device-qa-note">
        <input
          value={qaState.note ?? ""}
          onChange={(event) => onChangeField?.("note", event.target.value)}
          placeholder="记录样张、扫码、驱动回写、作废重打问题"
        />
        <button type="button" onClick={onSave} disabled={saveDisabled} title={saveTitle}>
          {qaState.saving ? "保存中" : "保存验收"}
        </button>
      </div>
      {latestRecord ? (
        <div className="driver-field-test-record printer-device-qa-record">
          <strong>{latestRecord.recordId}</strong>
          <span>{latestRecord.summary?.label ?? "已记录"}</span>
          <small>
            {[latestRecord.deviceLabel, latestRecord.driverLabel, latestRecord.paperLabel, latestRecord.operatorName]
              .filter(Boolean)
              .join(" · ")}
          </small>
          {latestRecord.evidence ? (
            <small>{getPrinterDeviceFieldTestEvidenceSummary(latestRecord.evidence).label}</small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function getPrintDocumentTypeLabel(documentType) {
  const labels = {
    express_ltl_label: "快递/快运标签",
    package_label: "包裹标签",
    outbound_note: "出库单",
    pickup_note: "自提单",
    delivery_note: "送货单",
  };
  return labels[documentType] ?? "打印单据";
}

export function PrintJobQueuePanel({
  queueState = {},
  dispatchState = {},
  retryState = {},
  onRefresh,
  onDispatch,
  onRetry,
}) {
  const items = Array.isArray(queueState.items) ? queueState.items.filter(Boolean) : [];
  const visibleItems = items.slice(0, 6);
  const failedCount = items.filter((item) => item.jobStatus === "failed").length;
  const queuedCount = items.filter((item) => item.jobStatus === "queued").length;
  const sourceLabel = getPrintJobQueueSourceLabel(queueState);
  const sourceTone = queueState.error
    ? "danger"
    : queueState.source === "api"
      ? "success"
      : queueState.source === "idle"
        ? "neutral"
        : "warning";
  const statusText = queueState.error
    ? queueState.error
    : queueState.loading
      ? "正在读取打印作业"
      : queueState.lastSyncedAt
        ? `最新同步 ${queueState.lastSyncedAt}`
        : "待刷新打印作业";

  return (
    <section className="detail-section print-job-queue-section">
      <div className="section-title-row print-job-queue-head">
        <div>
          <h3>打印作业池</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={queueState.loading}>
            {queueState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-job-stats">
        <span>最近 {items.length}</span>
        <span>待派发 {queuedCount}</span>
        <span className={failedCount ? "danger" : ""}>失败 {failedCount}</span>
      </div>
      {visibleItems.length ? (
        <div className="print-job-list">
          {visibleItems.map((printJob) => {
            const statusTone = getPrintJobStatusTone(printJob.jobStatus);
            const canDispatch = printJob.jobStatus === "queued";
            const canRetry = printJob.jobStatus === "failed" || printJob.jobStatus === "canceled";
            const actionState = canDispatch ? dispatchState : canRetry ? retryState : {};
            const busy = queueState.actionJobId === printJob.printJobId;
            const actionBlockedByOther = Boolean(queueState.actionJobId && !busy);
            const actionDisabled = Boolean(
              actionState.disabled || queueState.loading || actionBlockedByOther || (!canDispatch && !canRetry),
            );
            const actionTitle =
              actionState.title ||
              (actionBlockedByOther
                ? "已有打印作业操作进行中"
                : !canDispatch && !canRetry
                  ? "当前状态不需要办公室手动操作"
                  : "");
            return (
              <div className={`print-job-row ${statusTone}`} key={printJob.printJobId}>
                <div className="print-job-main">
                  <div>
                    <strong>{printJob.printJobId}</strong>
                    <StatusPill tone={statusTone}>{getPrintJobStatusLabel(printJob.jobStatus)}</StatusPill>
                  </div>
                  <span>{getPrintJobSummary(printJob)}</span>
                  <small>{getPrintJobMetaText(printJob)}</small>
                  {printJob.errorMessage ? <em>{printJob.errorMessage}</em> : null}
                </div>
                <div className="print-job-actions">
                  {canDispatch ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onDispatch?.(printJob.printJobId)}>
                      {busy ? "派发中" : "派发"}
                    </button>
                  ) : canRetry ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onRetry?.(printJob.printJobId)}>
                      {busy ? "重试中" : "重试"}
                    </button>
                  ) : (
                    <span>{getPrintJobActionHint(printJob.jobStatus)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-row">暂无打印作业，打印单据后会在这里显示队列状态。</div>
      )}
    </section>
  );
}

function getPrinterDeviceDriverMode(printDevice = {}) {
  if (!printDevice || typeof printDevice !== "object") return "preview_only";
  return String(printDevice.settings?.driverMode ?? printDevice.driverMode ?? "preview_only").trim() || "preview_only";
}

function getPrintDriverModeLabel(driverMode) {
  const option = PRINT_DRIVER_MODE_OPTIONS.find((item) => item.value === driverMode);
  return option?.label ?? driverMode ?? "待补";
}

function getPrinterDeviceQaSourceLabel(qaState = {}) {
  if (qaState.loading) return "刷新中";
  if (qaState.saving) return "保存中";
  if (qaState.error) return "验收异常";
  if (qaState.recordSource === "api" || qaState.source === "api") return "已同步";
  if (qaState.source === "local_fallback" || qaState.recordSource === "local_fallback") return "待连接";
  if (qaState.source === "idle") return "未读取";
  return "待确认";
}

function formatPrinterDeviceQaDateTime(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getPrintJobQueueSourceLabel(queueState = {}) {
  if (queueState.loading) return "刷新中";
  if (queueState.error) return "作业异常";
  if (queueState.source === "api") return "已同步";
  if (queueState.source === "local_fallback") return "待连接";
  if (queueState.source === "idle") return "未读取";
  return "待确认";
}

function getPrintJobStatusTone(status) {
  if (status === "printed") return "success";
  if (status === "sent") return "blue";
  if (status === "queued") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function getPrintJobSummary(printJob = {}) {
  return [
    getPrintJobDocumentLabel(printJob.documentType),
    printJob.targetId,
    printJob.printDeviceName || printJob.printDeviceId || "设备待补",
  ].filter(Boolean).join(" / ");
}

function getPrintJobMetaText(printJob = {}) {
  const attemptNo = Number(printJob.attemptNo ?? 0);
  return [
    printJob.printRecordId,
    attemptNo > 0 ? `第 ${attemptNo} 次` : "首次",
    printJob.driverMode || "驱动待补",
    formatPrintJobTimeLabel(printJob.updatedAt || printJob.finishedAt || printJob.sentAt || printJob.queuedAt || printJob.createdAt),
  ].filter(Boolean).join(" · ");
}

function getPrintJobActionHint(status) {
  if (status === "preview_only") return "预览";
  if (status === "sent") return "等回写";
  if (status === "printed") return "完成";
  return "无操作";
}

function formatPrintJobTimeLabel(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
