import { StatusPill } from "../../shared/ui/operational.jsx";

export function PrintDriverV1ReadinessPanel({ readinessState = {}, onRefresh }) {
  const readiness = readinessState.readiness;
  const summary = getPrintDriverV1ReadinessSummary(readinessState);
  const sourceLabel = getPrintDriverV1ReadinessSourceLabel(readinessState);
  const statusText = readinessState.error
    ? readinessState.error
    : readinessState.loading
      ? "正在读取 V1 打印上线门禁"
      : readinessState.lastSyncedAt
        ? `最新同步 ${readinessState.lastSyncedAt}`
        : "待刷新上线门禁";
  const rows = buildPrintDriverV1ReadinessRows(readiness);
  const criteria = Array.isArray(readiness?.criteria) ? readiness.criteria : [];
  const deviceReadiness = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const remainingRisks = Array.isArray(readiness?.remainingV1Risks) ? readiness.remainingV1Risks : [];

  return (
    <section className={`detail-section print-driver-diagnostics-section print-driver-v1-readiness-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>V1 打印上线门禁</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={readinessState.loading}>
            {readinessState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverV1ReadinessSafetyLabel(readiness)}</span>
      </div>
      <div className="print-driver-diagnostics-grid">
        {rows.map((row) => (
          <div className={row.tone ?? ""} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="print-driver-readiness">
        <div className="print-driver-readiness-head">
          <strong>上线阻塞项</strong>
          <span className={summary.tone}>{readiness?.summary?.label ?? "未读取"}</span>
        </div>
        {criteria.length ? (
          <div className="print-driver-readiness-list">
            {criteria.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail || "详情待补"}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示配置、spool、CUPS、设备和现场 QA 门禁。</div>
        )}
      </div>
      <div className="print-driver-readiness print-driver-v1-device-list">
        <div className="print-driver-readiness-head">
          <strong>必需设备组</strong>
          <span className={summary.tone}>{formatPrintDriverV1DeviceSummary(deviceReadiness)}</span>
        </div>
        {deviceReadiness.length ? (
          <div className="print-driver-readiness-list">
            {deviceReadiness.map((item) => (
              <div className={`print-driver-readiness-row ${item.ready ? "success" : "warning"}`} key={item.key}>
                <span>{item.ready ? "通过" : "阻塞"}</span>
                <strong>{item.label}</strong>
                <small>{formatPrintDriverV1DeviceDetail(item)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">暂无设备门禁结果。</div>
        )}
      </div>
      {remainingRisks.length ? (
        <div className="print-driver-v1-risks">
          {remainingRisks.slice(0, 4).map((risk) => <span key={risk}>{risk}</span>)}
        </div>
      ) : null}
      <p className="print-driver-diagnostics-note">{getPrintDriverV1ReadinessNote(readinessState)}</p>
    </section>
  );
}

function getPrintDriverV1ReadinessSummary(readinessState = {}) {
  if (readinessState.loading) return { label: "读取中", tone: "neutral" };
  if (readinessState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (readinessState.error || readinessState.source === "api_error") return { label: "门禁异常", tone: "danger" };
  const readiness = readinessState.readiness;
  if (!readiness) return { label: "未读取", tone: "neutral" };
  if (readiness.ready) return { label: "V1 可验收", tone: "success" };
  const blockingCount = Number(readiness.summary?.blockingCount ?? 0);
  return { label: blockingCount ? `${blockingCount} 项阻塞` : "未就绪", tone: "danger" };
}

function getPrintDriverV1ReadinessSourceLabel(readinessState = {}) {
  if (readinessState.loading) return "读取中";
  if (readinessState.source === "api") return "后端门禁";
  if (readinessState.source === "local_fallback") return "本地降级";
  if (readinessState.source === "api_error") return "后端拒绝";
  if (readinessState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverV1ReadinessRows(readiness = null) {
  const summary = readiness?.summary ?? {};
  const documents = Array.isArray(readiness?.requiredDocumentTypes) ? readiness.requiredDocumentTypes : [];
  const devices = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const readyDevices = devices.filter((item) => item.ready).length;
  return [
    {
      label: "门禁状态",
      value: readiness?.ready ? "满足 V1 条件" : "未满足",
      meta: summary.label || "刷新后判断",
      tone: readiness?.ready ? "success" : "warning",
    },
    {
      label: "阻塞项",
      value: `${Number(summary.blockingCount ?? 0)} 项`,
      meta: `${Number(summary.passedCount ?? 0)}/${Number(summary.totalCount ?? 0)} 已通过`,
      tone: Number(summary.blockingCount ?? 0) ? "warning" : "success",
    },
    {
      label: "覆盖单据",
      value: `${documents.length} 类`,
      meta: documents.map(getPrintDriverDocumentTypeLabel).join(" / ") || "范围待补",
      tone: documents.length ? "success" : "warning",
    },
    {
      label: "设备组",
      value: `${readyDevices}/${devices.length} 通过`,
      meta: devices.map((item) => item.label).join(" / ") || "设备待补",
      tone: devices.length && readyDevices === devices.length ? "success" : "warning",
    },
  ];
}

function getPrintDriverV1ReadinessSafetyLabel(readiness = null) {
  if (!readiness) return "未读取安全护栏";
  const safeguards = readiness.safeguards ?? {};
  if (safeguards.physicalPrinterCalled) return "已触发物理打印：需检查";
  if (safeguards.commandValueExposed || safeguards.commandArgsExposed || safeguards.spoolPathExposed || safeguards.payloadExposed) {
    return "敏感信息暴露：需检查";
  }
  return safeguards.nonPrinting ? "门禁检查不触发实体打印" : "门禁安全状态待确认";
}

function formatPrintDriverV1DeviceSummary(devices = []) {
  if (!devices.length) return "0/0 通过";
  return `${devices.filter((item) => item.ready).length}/${devices.length} 通过`;
}

function formatPrintDriverV1DeviceDetail(item = {}) {
  const device = item.printDevice;
  const qaLabel = item.latestFieldTestSummary?.label || (item.latestFieldTestRecord ? "QA 已记录" : "QA 待补");
  const paperLabel = [
    device?.paperName,
    device?.paperWidthMm && device?.paperHeightMm ? `${device.paperWidthMm}x${device.paperHeightMm}mm` : "",
  ].filter(Boolean).join(" ");
  return [device?.name || "设备资料待补", `模式 ${device?.driverMode || "待补"}`, qaLabel, paperLabel]
    .filter(Boolean)
    .join(" · ");
}

function getPrintDriverDocumentTypeLabel(value) {
  const normalized = String(value ?? "").trim();
  const labels = {
    express_ltl_label: "快递快运标签",
    package_label: "包裹标签",
    outbound_note: "出库单",
    pickup_note: "自提单",
    delivery_note: "送货单",
  };
  return labels[normalized] ?? normalized;
}

function getPrintDriverV1ReadinessNote(readinessState = {}) {
  if (readinessState.source === "local_fallback") return "后端不可用时不能证明打印链路已满足 V1 上线条件。";
  const readiness = readinessState.readiness;
  if (!readiness) return "刷新后汇总配置、spool、CUPS 队列、设备模式和现场 QA。";
  if (readiness.ready) return "系统证据满足 V1 打印上线门禁；真实出纸、纸张对位和扫码仍按现场 QA 记录保留。";
  return "门禁仍有阻塞项，默认不能按真实打印链路上线。";
}
