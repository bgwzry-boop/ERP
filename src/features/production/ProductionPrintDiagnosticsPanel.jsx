import { StatusPill } from "../../shared/ui/operational.jsx";
import {
  buildPrintDriverReadinessChecklist,
  getPrintDriverReadinessSummary,
} from "../../services/officePrintDriverConfigApiClient.js";
import {
  buildOfficePrintDriverIntegrationKit,
  getOfficePrintDriverIntegrationKitSummary,
} from "../../services/officePrintDriverIntegrationKitClient.js";

export function PrintDriverDiagnosticsPanel({ driverState = {}, cupsDiagnosticsState = {}, onRefresh }) {
  const config = driverState.config;
  const summary = getPrintDriverDiagnosticsSummary(driverState);
  const sourceLabel = getPrintDriverDiagnosticsSourceLabel(driverState);
  const readinessChecklist = buildPrintDriverReadinessChecklist(config);
  const readinessSummary = getPrintDriverReadinessSummary(config);
  const cupsDiagnostics = cupsDiagnosticsState.diagnostics;
  const cupsSummary = getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState);
  const cupsRows = buildPrintDriverCupsDiagnosticsRows(cupsDiagnostics);
  const cupsBlockers = Array.isArray(cupsDiagnostics?.blockers) ? cupsDiagnostics.blockers : [];
  const environmentPreflight = getPrintDriverEnvironmentPreflight(config);
  const integrationKit = buildOfficePrintDriverIntegrationKit({ config });
  const integrationKitSummary = getOfficePrintDriverIntegrationKitSummary(integrationKit);
  const statusText = driverState.error
    ? driverState.error
    : driverState.loading
      ? "正在读取后端打印驱动配置"
      : driverState.lastSyncedAt
        ? `最新同步 ${driverState.lastSyncedAt}`
        : "待刷新驱动诊断";
  const rows = buildPrintDriverDiagnosticsRows(config);

  return (
    <section className={`detail-section print-driver-diagnostics-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>打印驱动诊断</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={driverState.loading}>
            {driverState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverDiagnosticsSafetyLabel(config)}</span>
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
          <strong>配置检查清单</strong>
          <span className={readinessSummary.tone}>{readinessSummary.label}</span>
        </div>
        <div className="print-driver-readiness-list">
          {readinessChecklist.map((item) => (
            <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
              <span>{item.status}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="print-driver-readiness print-driver-cups-diagnostics">
        <div className="print-driver-readiness-head">
          <strong>CUPS 队列预检</strong>
          <span className={cupsSummary.tone}>{cupsSummary.label}</span>
        </div>
        {cupsRows.length ? (
          <div className="print-driver-readiness-list">
            {cupsRows.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.status}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示 CUPS 队列状态预检。</div>
        )}
        {cupsBlockers.length ? (
          <div className="print-driver-v1-risks">
            {cupsBlockers.slice(0, 3).map((item) => <span key={item.key}>{item.detail || item.label}</span>)}
          </div>
        ) : null}
      </div>
      {environmentPreflight.items.length ? (
        <div className="print-driver-readiness print-driver-environment-preflight">
          <div className="print-driver-readiness-head">
            <strong>本机环境预检</strong>
            <span className={environmentPreflight.summary.tone}>{environmentPreflight.summary.label}</span>
          </div>
          <div className="print-driver-readiness-list">
            {environmentPreflight.items.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="print-driver-integration-kit">
        <div className="print-driver-readiness-head">
          <strong>{integrationKit.title}</strong>
          <span className={integrationKit.ready ? "success" : "warning"}>{integrationKit.version}</span>
        </div>
        <div className="print-driver-integration-summary">
          <strong>{integrationKitSummary}</strong>
          <small>
            模式 {integrationKit.commandBridge.mode} · 参数 {integrationKit.commandBridge.argumentTemplate.join(" ")} · 状态 pending→sent / completed→printed / failed→failed / canceled→canceled
          </small>
        </div>
        <div className="print-driver-integration-list">
          {integrationKit.items.map((item) => (
            <div className={`print-driver-integration-row ${item.tone}`} key={item.key}>
              <span>{item.ready ? "可联调" : "待配置"}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
          ))}
        </div>
      </div>
      <p className="print-driver-diagnostics-note">{getPrintDriverDiagnosticsNote(driverState)}</p>
    </section>
  );
}

function getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState = {}) {
  if (cupsDiagnosticsState.loading) return { label: "读取中", tone: "neutral" };
  if (cupsDiagnosticsState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (cupsDiagnosticsState.error || cupsDiagnosticsState.source === "api_error") return { label: "预检异常", tone: "danger" };
  const diagnostics = cupsDiagnosticsState.diagnostics;
  if (!diagnostics) return { label: "未读取", tone: "neutral" };
  if (diagnostics.ready) return { label: "队列可访问", tone: "success" };
  if (diagnostics.status === "not_configured") return { label: "未配置", tone: "warning" };
  return { label: "未通过", tone: "danger" };
}

function buildPrintDriverCupsDiagnosticsRows(diagnostics = null) {
  if (!diagnostics) return [];
  const preflight = diagnostics.preflightResult;
  const safeguardsOk =
    diagnostics.safeguards?.nonPrinting !== false &&
    !diagnostics.safeguards?.physicalPrinterCalled &&
    !diagnostics.safeguards?.printFileCreated &&
    !diagnostics.safeguards?.commandValueExposed &&
    !diagnostics.safeguards?.commandArgsExposed &&
    !diagnostics.safeguards?.stdoutExposed &&
    !diagnostics.safeguards?.stderrExposed &&
    !diagnostics.safeguards?.payloadExposed;
  return [
    {
      key: "cups-printer-configured",
      label: "CUPS 打印机名",
      status: diagnostics.cupsPrinterConfigured ? "通过" : "待配置",
      detail: diagnostics.cupsPrinterConfigured ? "后端已配置目标队列名" : "需配置目标 CUPS 打印机名",
      tone: diagnostics.cupsPrinterConfigured ? "success" : "warning",
    },
    {
      key: "cups-printer-allowlist",
      label: "队列白名单",
      status: diagnostics.cupsPrinterAllowed ? "通过" : "阻塞",
      detail: diagnostics.cupsPrinterAllowed ? "目标队列命中后端白名单" : "目标队列未命中白名单，不能进入真实打印验收",
      tone: diagnostics.cupsPrinterAllowed ? "success" : "warning",
    },
    {
      key: "cups-status-command",
      label: "状态命令",
      status: diagnostics.cupsStatusCommandRunnable ? "通过" : "阻塞",
      detail: diagnostics.cupsStatusCommandRunnable
        ? `状态命令可运行，仅回传字节数 stdout ${preflight?.stdoutBytes ?? 0} / stderr ${preflight?.stderrBytes ?? 0}`
        : `状态命令未通过${preflight?.errorCode ? `：${preflight.errorCode}` : ""}`,
      tone: diagnostics.cupsStatusCommandRunnable ? "success" : "warning",
    },
    {
      key: "cups-non-printing-safeguards",
      label: "安全护栏",
      status: safeguardsOk ? "通过" : "需检查",
      detail: safeguardsOk
        ? "不读取 payload、不生成打印文件、不提交实体打印、不暴露命令或输出内容"
        : "预检安全护栏异常，需检查命令、输出或实体打印调用是否暴露",
      tone: safeguardsOk ? "success" : "danger",
    },
  ];
}

function getPrintDriverEnvironmentPreflight(config = null) {
  const fallback = {
    summary: { label: "0/0 通过", tone: "warning", passedCount: 0, totalCount: 0, blockingCount: 0 },
    items: [],
  };
  if (!config?.environmentPreflight || !Array.isArray(config.environmentPreflight.items)) return fallback;
  return {
    ...fallback,
    ...config.environmentPreflight,
    summary: { ...fallback.summary, ...(config.environmentPreflight.summary ?? {}) },
  };
}

function getPrintDriverDiagnosticsSummary(driverState = {}) {
  if (driverState.loading) return { label: "读取中", tone: "neutral" };
  if (driverState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (driverState.error || driverState.source === "api_error") return { label: "配置异常", tone: "danger" };
  const config = driverState.config;
  if (!config) return { label: "未读取", tone: "neutral" };
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) return { label: "命令桥+回读", tone: "success" };
  if (config.realDispatchAvailable) return { label: "可提交命令桥", tone: "blue" };
  if (config.dryRunEnabled) return { label: "Dry-run", tone: "warning" };
  if (!config.systemPrinterEnabled) return { label: "系统打印未启用", tone: "warning" };
  return { label: "真实派发已保护", tone: "warning" };
}

function getPrintDriverDiagnosticsSourceLabel(driverState = {}) {
  if (driverState.loading) return "读取中";
  if (driverState.source === "api") return "后端配置";
  if (driverState.source === "local_fallback") return "本地降级";
  if (driverState.source === "api_error") return "后端拒绝";
  if (driverState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverDiagnosticsRows(config = null) {
  const safeConfig = config ?? {};
  const allowList = Array.isArray(safeConfig.allowedPrinterNames) ? safeConfig.allowedPrinterNames : [];
  return [
    { label: "适配器", value: getPrintDriverAdapterKindLabel(safeConfig.kind), meta: safeConfig.adapterName || "名称待补", tone: safeConfig.dryRunEnabled ? "warning" : "" },
    { label: "系统打印", value: safeConfig.systemPrinterEnabled ? "已启用" : "未启用", meta: safeConfig.dryRunEnabled ? "Dry-run 不触碰实体打印机" : "实体打印需后端环境变量开启", tone: safeConfig.systemPrinterEnabled ? "success" : "warning" },
    { label: "桥接方式", value: getPrintDriverBridgeKindLabel(safeConfig.systemPrinterAdapterKind), meta: safeConfig.systemPrinterCommandConfigured ? "命令已配置" : "命令未配置", tone: safeConfig.systemPrinterCommandConfigured ? "success" : "warning" },
    { label: "状态回读", value: safeConfig.commandBridgeStatusReadbackAvailable ? "可读本地 spool" : "未启用", meta: safeConfig.systemPrinterCommandTimeoutMs ? `${safeConfig.systemPrinterCommandTimeoutMs}ms 超时` : "无超时配置", tone: safeConfig.commandBridgeStatusReadbackAvailable ? "success" : "warning" },
    { label: "打印机白名单", value: allowList.length ? `${allowList.length} 台` : "未配置", meta: allowList.join(" / ") || "真实派发前必须限制目标设备", tone: allowList.length ? "success" : "warning" },
    { label: "真实派发", value: safeConfig.realDispatchAvailable ? "可提交命令桥" : "已保护", meta: safeConfig.safeguards?.physicalPrinterCallsBlocked ? "实体打印调用被保护" : "实体打印调用可达", tone: safeConfig.realDispatchAvailable ? "success" : "warning" },
  ];
}

function getPrintDriverAdapterKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "dry_run_adapter") return "Dry-run";
  if (normalized === "guarded_adapter") return "Guarded";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverBridgeKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "command_bridge") return "命令桥";
  if (normalized === "none") return "未选择";
  if (normalized === "unsupported") return "不支持";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverDiagnosticsSafetyLabel(config = null) {
  if (!config) return "未读取驱动保护状态";
  if (config.safeguards?.commandValueExposed) return "命令值暴露：需检查";
  if (config.safeguards?.physicalPrinterCallsBlocked) return "实体打印调用受保护";
  return "实体打印调用可达";
}

function getPrintDriverDiagnosticsNote(driverState = {}) {
  const config = driverState.config;
  if (driverState.source === "local_fallback") return "后端不可用时只显示保护性降级状态，不能据此判断实体打印已完成。";
  if (!config) return "刷新后查看后端驱动模式、命令桥和状态回读能力。";
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) return "可提交命令桥；是否完成仍以本地 spool 状态回读和现场验收为准。";
  if (config.realDispatchAvailable) return "可提交命令桥；提交成功不等于纸张已打出，仍需现场验收。";
  return "真实派发当前被保护；打印作业可预览或排队，但不能视为实体打印完成。";
}
