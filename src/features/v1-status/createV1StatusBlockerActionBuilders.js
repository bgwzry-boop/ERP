export function createV1StatusBlockerActionBuilders({
  attachmentRetentionPrecheckAction = {},
  canShowProductionEnvFrontDoorReview = false,
  driverReadinessPrecheckAction = {},
  fieldEvidenceIntakeQualityRef,
  findMatchingMissingEvidenceOptionByText,
  findSignoffBoundaryOptionByText,
  focusFieldAcceptanceReportFromPhase,
  focusFieldEvidenceProgressFromPhase,
  focusProductionEnvFixChecklistFromBlocker,
  focusV1V2BoundaryBriefFromBlocker,
  missingEvidenceOptions = [],
  onPrecheckProductionEnv,
  onPrecheckProductionEnvFileAudit,
  onPrecheckProductionEnvFilePreview,
  onPrecheckProductionGoLive,
  onPrecheckRuntimeReadiness,
  onPrecheckV1AttachmentRetention,
  onPrecheckV1DriverReadiness,
  onPrecheckV1Persistence,
  onPrecheckV1PrintCups,
  onPrecheckV1PrintReadiness,
  onPrecheckV1PrintSpool,
  persistencePrecheckAction = {},
  printCupsPrecheckAction = {},
  printReadinessPrecheckAction = {},
  printSpoolPrecheckAction = {},
  productionEnvFileAuditPrecheckAction = {},
  productionEnvFilePreviewPrecheckAction = {},
  productionEnvFrontDoorReviewLoading = false,
  productionEnvGateRef,
  productionEnvPrecheckAction = {},
  productionGoLivePrecheckAction = {},
  releaseCandidateRefreshAction = {},
  releaseCandidateRefreshPrecheckAction = {},
  runProductionEnvFrontDoorReview,
  runtimeReadinessPrecheckAction = {},
  scrollV1StatusRefIntoView,
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  signoffBoundaryOptions = [],
} = {}) {
  function addPhaseAction(actions, action) {
    if (!action || actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  function buildRuntimeReadinessBlockerActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.group,
      item.ownerRole,
      item.detail,
      item.nextAction,
    ].filter(Boolean).join(" ");
    const actions = [];
    const addRuntimeAction = (action) => addPhaseAction(actions, action);
    const printEvidenceItem = findMatchingMissingEvidenceOptionByText(["打印", "标签", "CUPS", "spool", "样张", "纸张", "条码"]);
    const knownRuntimeBlockerKeys = new Set([
      "system-v1-persistence",
      "attachment-v1-readiness",
      "print-spool-diagnostics",
      "print-cups-diagnostics",
      "print-v1-readiness",
      "driver-v1-readiness",
    ]);
    const hasKnownRuntimeBlockerKey = knownRuntimeBlockerKeys.has(key);

    if (key === "system-v1-persistence" || (!hasKnownRuntimeBlockerKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) {
      if (onPrecheckV1Persistence) {
        addRuntimeAction({
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      const persistenceEvidenceItem = findMatchingMissingEvidenceOptionByText(["PostgreSQL", "生产持久化", "生产库", "迁移", "备份", "恢复"]);
      if (persistenceEvidenceItem) {
        addRuntimeAction({
          key: "fill-persistence-evidence",
          label: "填持久化证据",
          onClick: () => selectMissingEvidenceForStage(persistenceEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "attachment-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("附件") || haystack.includes("对象存储")))) {
      if (onPrecheckV1AttachmentRetention) {
        addRuntimeAction({
          key: "run-attachment-retention-precheck",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
        });
      }
      const attachmentEvidenceItem = findMatchingMissingEvidenceOptionByText(["对象存储", "附件", "bucket", "短期访问", "访问审计", "对账导出"]);
      if (attachmentEvidenceItem) {
        addRuntimeAction({
          key: "fill-attachment-evidence",
          label: "填对象存储证据",
          onClick: () => selectMissingEvidenceForStage(attachmentEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "print-spool-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("spool"))) {
      if (onPrecheckV1PrintSpool) {
        addRuntimeAction({
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-cups-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("CUPS"))) {
      if (onPrecheckV1PrintCups) {
        addRuntimeAction({
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("打印 V1") || haystack.includes("打印门禁")))) {
      if (onPrecheckV1PrintReadiness) {
        addRuntimeAction({
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    if (key === "driver-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")))) {
      if (onPrecheckV1DriverReadiness) {
        addRuntimeAction({
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMatchingMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addRuntimeAction({
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addRuntimeAction({
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (!actions.length && onPrecheckRuntimeReadiness) {
      addRuntimeAction({
        key: "run-runtime-readiness",
        label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前预检",
        onClick: onPrecheckRuntimeReadiness,
        disabled: runtimeReadinessPrecheckAction.loading,
      });
      addRuntimeAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    return actions;
  }

  function buildReleaseCandidateRefreshBlockerActions(item = {}) {
    const key = item.key || "";
    const firstProductionGoLiveBlockedStageKey =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      "";
    const firstProductionGoLiveBlockedStageLabel =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      "";
    const firstMissingEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const actions = [];

    if (key === "field-evidence-draft-missing" || key === "field-evidence-draft-invalid") {
      actions.push({
        key: "open-field-evidence-quality",
        label: "到回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (key === "field-evidence-draft-blocked") {
      if (firstMissingEvidenceItem) {
        actions.push({
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstMissingEvidenceItem),
        });
      }
      if (firstSignoffItem) {
        actions.push({
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
    }

    if (key === "signoff-incomplete" && firstSignoffItem) {
      actions.push({
        key: "fill-signoff",
        label: "填负责人签字",
        onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
      });
    }

    if (key === "v1-v2-boundary-pending") {
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      actions.push({
        key: "open-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
    }

    if (key === "production-env-preflight-blocked") {
      actions.push({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      if (onPrecheckProductionEnv) {
        actions.push({
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
    }

    if (key === "production-go-live-combo-blocked") {
      const firstBlockedStageIsEnvFileAudit =
        firstProductionGoLiveBlockedStageKey === "production-env-file-audit" ||
        firstProductionGoLiveBlockedStageLabel.includes("生产 env 文件安全审计") ||
        String(item.detail || "").includes("生产 env 文件安全审计");
      if (firstBlockedStageIsEnvFileAudit && canShowProductionEnvFrontDoorReview) {
        actions.push({
          key: "run-env-front-door-review",
          label: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFileAudit) {
        actions.push({
          key: "run-env-file-audit",
          label: productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计",
          onClick: onPrecheckProductionEnvFileAudit,
          disabled: productionEnvFileAuditPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFilePreview) {
        actions.push({
          key: "run-env-file-preview",
          label: productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检",
          onClick: onPrecheckProductionEnvFilePreview,
          disabled: productionEnvFilePreviewPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnv) {
        actions.push({
          key: "run-current-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      actions.push({
        key: "open-production-gate",
        label: "查看生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (onPrecheckProductionGoLive) {
        actions.push({
          key: "run-combo-precheck",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    return actions;
  }


  return {
    buildReleaseCandidateRefreshBlockerActions,
    buildRuntimeReadinessBlockerActions,
  };
}
