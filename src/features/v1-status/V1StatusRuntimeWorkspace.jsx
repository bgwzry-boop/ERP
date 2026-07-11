import { StatusPill } from "../../components/ui.jsx";

function SummaryMetrics({ items }) {
  return (
    <div className="v1-field-intake-summary">
      {items.map(([label, value]) => (
        <span key={label}>{label} <strong>{value}</strong></span>
      ))}
    </div>
  );
}

function BlockerList({ className, items, limit = 3, prefix = "" }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={className}>
      {items.slice(0, limit).map((item) => (
        <p key={item.key || item.label || item}>
          {prefix}{typeof item === "string" ? item : `${item.label}：${item.detail}`}
        </p>
      ))}
    </div>
  );
}

function LivePrecheckResult({ action, className, title, tone, statusLabel, children }) {
  if (!action.result && !action.error) {
    return null;
  }

  return (
    <div className={className}>
      {action.result ? (
        <>
          <div>
            <StatusPill tone={tone(action.result)}>{statusLabel(action.result)}</StatusPill>
            <strong>{title}</strong>
          </div>
          {children(action.result)}
        </>
      ) : (
        <p>{action.error}</p>
      )}
    </div>
  );
}

export function V1StatusRuntimeWorkspace({
  runtimeReadinessBlockers,
  sectionRef,
  onPrecheckV1Persistence,
  persistencePrecheckAction,
  onPrecheckV1AttachmentRetention,
  attachmentRetentionPrecheckAction,
  onPrecheckV1PrintSpool,
  printSpoolPrecheckAction,
  onPrecheckV1PrintCups,
  printCupsPrecheckAction,
  onPrecheckV1PrintReadiness,
  printReadinessPrecheckAction,
  onPrecheckV1DriverReadiness,
  driverReadinessPrecheckAction,
  onPrecheckRuntimeReadiness,
  runtimeReadinessPrecheckAction,
  buildRuntimeReadinessBlockerActions,
}) {
  if (!runtimeReadinessBlockers) {
    return null;
  }

  const precheckActions = [
    ["持久化预检", "预检中", onPrecheckV1Persistence, persistencePrecheckAction],
    ["附件留档预检", "预检中", onPrecheckV1AttachmentRetention, attachmentRetentionPrecheckAction],
    ["spool 预检", "预检中", onPrecheckV1PrintSpool, printSpoolPrecheckAction],
    ["CUPS 预检", "预检中", onPrecheckV1PrintCups, printCupsPrecheckAction],
    ["打印门禁预检", "预检中", onPrecheckV1PrintReadiness, printReadinessPrecheckAction],
    ["司机真机预检", "预检中", onPrecheckV1DriverReadiness, driverReadinessPrecheckAction],
    ["当前预检", "预检中", onPrecheckRuntimeReadiness, runtimeReadinessPrecheckAction],
  ];

  return (
    <section
      className="detail-section v1-workspace-panel v1-workspace-runtime v1-section-runtime_gate"
      ref={sectionRef}
    >
      <div className="v1-section-title-row">
        <h3>运行时门禁阻塞</h3>
        <div className="v1-section-title-actions">
          {precheckActions.map(([label, loadingLabel, onClick, action]) => (
            <button
              className="ghost-button"
              disabled={!onClick || action.loading}
              key={label}
              onClick={onClick}
              type="button"
            >
              {action.loading ? loadingLabel : label}
            </button>
          ))}
        </div>
      </div>
      <div className="v1-runtime-readiness-summary">
        <span>通过 <strong>{runtimeReadinessBlockers.summary.passedLabel}</strong></span>
        <span>阻塞 <strong>{runtimeReadinessBlockers.summary.blockingLabel}</strong></span>
        <span>显示 <strong>{runtimeReadinessBlockers.summary.shownBlockingLabel}</strong></span>
      </div>

      <LivePrecheckResult
        action={runtimeReadinessPrecheckAction}
        className="v1-runtime-readiness-live-result"
        statusLabel={(result) => result.statusLabel}
        title="最近运行时预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>{result.nextAction}</p>
            <SummaryMetrics items={[
              ["当前实例", result.summary.currentRuntime ? "是" : "否"],
              ["通过", result.summary.passedLabel],
              ["阻塞", result.summary.blockerLabel],
              ["不出纸", result.summary.nonPrinting ? "是" : "否"],
              ["候选刷新", result.summary.releaseCandidateRefreshed ? "是" : "否"],
            ]} />
            <BlockerList className="v1-runtime-readiness-live-blockers" items={result.blockingCriteria} />
          </>
        )}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={attachmentRetentionPrecheckAction}
        className="v1-attachment-retention-live-result"
        statusLabel={(result) => result.statusLabel}
        title="最近附件留档预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>{result.nextAction}</p>
            <SummaryMetrics items={[
              ["当前实例", result.summary.currentRuntime ? "是" : "否"],
              ["通过", result.summary.passedLabel],
              ["存储", result.summary.storageKindLabel],
              ["对象存储", result.summary.objectStorageLive ? "是" : "否"],
              ["诊断读写", result.summary.diagnosticReady ? "是" : "否"],
              ["清理", result.summary.diagnosticObjectCleanedUp ? "是" : "否"],
              ["本地批准", result.summary.localFsAcceptedForV1 ? "是" : "否"],
              ["候选刷新", result.summary.releaseCandidateRefreshed ? "是" : "否"],
            ]} />
            <BlockerList className="v1-attachment-retention-live-blockers" items={result.blockingCriteria} />
            <div className="v1-runtime-readiness-meta">
              <span>写入 {result.diagnostics.writeOk ? "是" : "否"}</span>
              <span>读回 {result.diagnostics.readOk ? "是" : "否"}</span>
              <span>摘要 {result.diagnostics.digestOk ? "是" : "否"}</span>
              <span>缺配置 {result.diagnostics.missingConfigFields.length} 项</span>
            </div>
          </>
        )}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={printSpoolPrecheckAction}
        className="v1-print-spool-live-result"
        statusLabel={(result) => result.ready ? "已通过" : "仍未通过"}
        title="最近 spool 预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>只检查命令桥 spool 写入、状态回读和清理；不创建业务打印作业，不调用物理打印机。</p>
            <SummaryMetrics items={[
              ["不出纸", result.safeguards.nonPrinting ? "是" : "否"],
              ["写入", result.writeOk ? "是" : "否"],
              ["待打回读", result.pendingPollOk ? "是" : "否"],
              ["完成回读", result.completedPollOk ? "是" : "否"],
              ["清理", result.cleanupOk ? "是" : "否"],
              ["物理打印", result.safeguards.physicalPrinterCalled ? "是" : "否"],
            ]} />
            <BlockerList className="v1-print-spool-live-blockers" items={result.blockers} />
            <div className="v1-runtime-readiness-meta">
              <span>模式 {result.mode || "unknown"}</span>
              <span>存储 {result.storageKind || "unknown"}</span>
              <span>缺配置 {result.missingConfigFields.length} 项</span>
            </div>
          </>
        )}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={printCupsPrecheckAction}
        className="v1-print-cups-live-result"
        statusLabel={(result) => result.ready ? "已通过" : "仍未通过"}
        title="最近 CUPS 预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>只检查 CUPS 队列状态命令和白名单；不生成打印文件，不调用物理打印机。</p>
            <SummaryMetrics items={[
              ["不出纸", result.safeguards.nonPrinting ? "是" : "否"],
              ["队列配置", result.cupsPrinterConfigured ? "是" : "否"],
              ["白名单", result.cupsPrinterAllowed ? "是" : "否"],
              ["状态命令", result.cupsStatusCommandConfigured ? "是" : "否"],
              ["命令可执行", result.cupsStatusCommandRunnable ? "是" : "否"],
              ["物理打印", result.safeguards.physicalPrinterCalled ? "是" : "否"],
            ]} />
            <BlockerList className="v1-print-cups-live-blockers" items={result.blockers} />
            <div className="v1-runtime-readiness-meta">
              <span>模式 {result.preflightResult?.mode || "unknown"}</span>
              <span>适配器 {result.configuration.systemPrinterAdapterKind || "unknown"}</span>
              <span>允许设备 {result.configuration.allowedPrinterCount}</span>
              <span>stdout 暴露 {result.safeguards.stdoutExposed ? "是" : "否"}</span>
              <span>stderr 暴露 {result.safeguards.stderrExposed ? "是" : "否"}</span>
            </div>
          </>
        )}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={printReadinessPrecheckAction}
        className="v1-print-readiness-live-result"
        statusLabel={(result) => result.ready ? "已通过" : "仍未通过"}
        title="最近打印门禁预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => {
          const blockingCriteria = result.criteria.filter((item) => item.blocking && item.status !== "passed");
          return (
            <>
              <p>只读取当前 V1 打印上线门禁、spool / CUPS 诊断和设备 QA 摘要；不生成打印文件，不调用物理打印机。</p>
              <SummaryMetrics items={[
                ["通过", result.summary.label],
                ["阻塞", `${result.summary.blockingCount} 项`],
                ["门禁项", result.criteria.length],
                ["必需设备", `${result.deviceReadiness.filter((item) => item.ready).length}/${result.deviceReadiness.length}`],
                ["spool", result.spoolDiagnostics.ready ? "通过" : "阻塞"],
                ["CUPS", result.cupsDiagnostics.ready ? "通过" : "阻塞"],
                ["不出纸", result.safeguards.nonPrinting ? "是" : "否"],
                ["物理打印", result.safeguards.physicalPrinterCalled ? "是" : "否"],
              ]} />
              <BlockerList className="v1-print-readiness-live-blockers" items={blockingCriteria} limit={4} />
              <BlockerList className="v1-print-readiness-live-blockers" items={result.remainingV1Risks} limit={2} prefix="剩余风险：" />
              <div className="v1-runtime-readiness-meta">
                <span>单据类型 {result.requiredDocumentTypes.length}</span>
                <span>命令值暴露 {result.safeguards.commandValueExposed ? "是" : "否"}</span>
                <span>参数暴露 {result.safeguards.commandArgsExposed ? "是" : "否"}</span>
                <span>spool 路径暴露 {result.safeguards.spoolPathExposed ? "是" : "否"}</span>
                <span>payload 暴露 {result.safeguards.payloadExposed ? "是" : "否"}</span>
              </div>
            </>
          );
        }}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={driverReadinessPrecheckAction}
        className="v1-driver-readiness-live-result"
        statusLabel={(result) => result.statusLabel}
        title="最近司机真机预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>只读取司机端 V1 真机门禁、现场验收摘要、原生桥接和纸质包裹标签扫码样本；不改送货状态，不调用摄像头、扫码或导航。</p>
            <SummaryMetrics items={[
              ["当前实例", result.summary.currentRuntime ? "是" : "否"],
              ["通过", result.summary.readinessLabel],
              ["阻塞", result.summary.blockerLabel],
              ["任务读取", `${result.summary.deliveryTaskCount} 条`],
              ["现场验收", result.summary.fieldTestRecordAvailable ? result.summary.fieldTestLabel : "未记录"],
              ["原生能力", result.summary.nativeSupportedLabel],
              ["标签扫码", result.summary.packageLabelScanMatched ? "已匹配" : "未匹配"],
              ["原生扫码", result.summary.packageLabelScanNative ? "是" : "否"],
            ]} />
            <BlockerList className="v1-driver-readiness-live-blockers" items={result.blockingCriteria} limit={4} />
            <BlockerList className="v1-driver-readiness-live-blockers" items={result.remainingV1Risks} limit={2} prefix="剩余风险：" />
            <div className="v1-runtime-readiness-meta">
              <span>司机验收账号 {result.driverOperatorId || "未返回"}</span>
              <span>送货状态变更 {result.safeguards.deliveryTaskStatusChanged ? "是" : "否"}</span>
              <span>调用摄像头 {result.safeguards.cameraPermissionRequested ? "是" : "否"}</span>
              <span>调用导航 {result.safeguards.navigationAppOpened ? "是" : "否"}</span>
              <span>调用原生桥 {result.safeguards.nativeBridgeInvoked ? "是" : "否"}</span>
              <span>payload 暴露 {result.safeguards.payloadExposed ? "是" : "否"}</span>
            </div>
          </>
        )}
      </LivePrecheckResult>

      <LivePrecheckResult
        action={persistencePrecheckAction}
        className="v1-persistence-live-result"
        statusLabel={(result) => result.statusLabel}
        title="最近持久化预检"
        tone={(result) => result.ready ? "success" : "warning"}
      >
        {(result) => (
          <>
            <p>{result.nextAction}</p>
            <SummaryMetrics items={[
              ["当前实例", result.summary.currentRuntime ? "是" : "否"],
              ["通过", result.summary.passedLabel],
              ["仓储组", result.summary.repositoryGroupLabel],
              ["生产仓储", result.summary.repositoryLabel],
              ["本地仓储", result.summary.localRepositoryLabel],
              ["本地接受", result.summary.localPersistenceAcceptedForV1 ? "是" : "否"],
              ["候选刷新", result.summary.releaseCandidateRefreshed ? "是" : "否"],
            ]} />
            {result.repositoryGroups.length ? (
              <div className="v1-persistence-group-list">
                {result.repositoryGroups.slice(0, 5).map((group) => (
                  <div className="v1-persistence-group-row" key={group.key || group.label}>
                    <div>
                      <StatusPill tone={group.ready ? "success" : "danger"}>{group.statusLabel}</StatusPill>
                      <strong>{group.label}</strong>
                    </div>
                    <p>{group.nextAction}</p>
                    <div className="v1-runtime-readiness-meta">
                      <span>生产仓储 {group.repositoryLabel}</span>
                      <span>本地 {group.localRepositoryLabel}</span>
                      <span>内存 {group.localMemoryCount} / JSON {group.localJsonCount} / 文件 {group.localFsCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </LivePrecheckResult>

      <div className="v1-runtime-readiness-list">
        {runtimeReadinessBlockers.blockers.map((item) => {
          const blockerActions = buildRuntimeReadinessBlockerActions(item);
          return (
            <div className="v1-runtime-readiness-row" key={item.key}>
              <div>
                <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
                <strong>{item.label}</strong>
              </div>
              <p>{item.detail}</p>
              <div className="v1-runtime-readiness-meta">
                <span>{item.group}</span>
                <span>{item.ownerRole}</span>
                <span>{item.nextAction}</span>
              </div>
              {blockerActions.length ? (
                <div className="v1-runtime-readiness-actions">
                  {blockerActions.map((action) => (
                    <button
                      className="ghost-button"
                      disabled={action.disabled}
                      key={action.key}
                      onClick={action.onClick}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="v1-runtime-readiness-note">{runtimeReadinessBlockers.nextAction}</p>
    </section>
  );
}
