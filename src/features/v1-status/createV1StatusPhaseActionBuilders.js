export function createV1StatusPhaseActionBuilders({
  attachmentRetentionPrecheckAction = {},
  canRunFieldEvidenceCloseoutReview = false,
  canRunProductionEnvFrontDoorReview = false,
  canShowProductionEnvFrontDoorReview = false,
  driverReadinessPrecheckAction = {},
  fieldEvidenceIntakeQualityRef,
  fieldEvidenceValidationAction = {},
  findMissingEvidenceOptionByText,
  findProductionEnvFixItemForGate,
  findSignoffBoundaryOptionByText,
  focusFieldAcceptanceReportFromPhase,
  focusFieldEvidenceProgressFromPhase,
  focusProductionEnvFillTemplateFromPhase,
  focusProductionEnvFixChecklistFromBlocker,
  focusProductionEnvFixItemFromGate,
  focusProductionEnvMinimumValuesTemplateFromPhase,
  focusProductionEnvTemplateSection,
  focusRuntimeReadinessFromPhase,
  focusV1V2BoundaryBriefFromBlocker,
  missingEvidenceOptions = [],
  onPrecheckProductionEnv,
  onPrecheckProductionGoLive,
  onPrecheckReleaseCandidateRefresh,
  onPrecheckRuntimeReadiness,
  onPrecheckV1AttachmentRetention,
  onPrecheckV1DriverReadiness,
  onPrecheckV1Persistence,
  onPrecheckV1PrintCups,
  onPrecheckV1PrintReadiness,
  onPrecheckV1PrintSpool,
  onPrecheckV1V2Boundary,
  onRefreshReleaseCandidate,
  persistencePrecheckAction = {},
  printCupsPrecheckAction = {},
  printReadinessPrecheckAction = {},
  printSpoolPrecheckAction = {},
  productionEnvFrontDoorReviewLoading = false,
  productionEnvGateRef,
  productionEnvMinimumValuesFragmentTemplate,
  productionEnvPrecheckAction = {},
  productionEnvTemplateSectionIndexByLabel = new Map(),
  productionGoLivePrecheckAction = {},
  releaseCandidateRefreshAction = {},
  releaseCandidateRefreshPrecheckAction = {},
  runFieldEvidenceCloseoutReview,
  runProductionEnvFrontDoorReview,
  runtimeReadinessPrecheckAction = {},
  scrollV1StatusRefIntoView,
  selectedPhase = {},
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  signoffBoundaryOptions = [],
  v1V2BoundaryPrecheckAction = {},
} = {}) {
  function addPhaseAction(actions, action) {
    if (!action || actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  function buildProductionEnvGateActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.ownerRole,
      item.nextAction,
      item.variableLabel,
    ].filter(Boolean).join(" ");
    const actions = [];
    const fixItem = findProductionEnvFixItemForGate(item);
    const knownProductionEnvGateKeys = new Set([
      "v1-persistence-profile",
      "attachment-object-storage-env",
      "statement-export-object-storage-env",
      "system-printer-command-bridge-env",
      "cups-preflight-env",
      "v1-readiness-identity-env",
      "v1-field-acceptance-report-env",
      "local-v1-acceptance-bypass-env",
      "preflight-redaction-safeguard",
    ]);
    const hasKnownProductionEnvGateKey = knownProductionEnvGateKeys.has(key);

    if (fixItem) {
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看修正项",
        onClick: () => focusProductionEnvFixItemFromGate(item),
      });
      if (productionEnvTemplateSectionIndexByLabel.has(fixItem.label)) {
        addPhaseAction(actions, {
          key: "open-env-template-section",
          label: "定位草稿段",
          onClick: () => focusProductionEnvTemplateSection(fixItem),
        });
      }
    }

    if (onPrecheckProductionEnv) {
      addPhaseAction(actions, {
        key: "run-production-env-precheck",
        label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
        onClick: onPrecheckProductionEnv,
        disabled: productionEnvPrecheckAction.loading,
      });
    }

    if ((key === "v1-persistence-profile" || (!hasKnownProductionEnvGateKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) && onPrecheckV1Persistence) {
      addPhaseAction(actions, {
        key: "run-persistence-precheck",
        label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
        onClick: onPrecheckV1Persistence,
        disabled: persistencePrecheckAction.loading,
      });
    }

    if ((key === "attachment-object-storage-env" || (!hasKnownProductionEnvGateKey && haystack.includes("附件对象存储"))) && onPrecheckV1AttachmentRetention) {
      addPhaseAction(actions, {
        key: "run-attachment-retention",
        label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
        onClick: onPrecheckV1AttachmentRetention,
        disabled: attachmentRetentionPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || (!hasKnownProductionEnvGateKey && haystack.includes("command_bridge"))) && onPrecheckV1PrintSpool) {
      addPhaseAction(actions, {
        key: "run-print-spool",
        label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
        onClick: onPrecheckV1PrintSpool,
        disabled: printSpoolPrecheckAction.loading,
      });
    }

    if ((key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("CUPS"))) && onPrecheckV1PrintCups) {
      addPhaseAction(actions, {
        key: "run-print-cups",
        label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
        onClick: onPrecheckV1PrintCups,
        disabled: printCupsPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("打印"))) && onPrecheckV1PrintReadiness) {
      addPhaseAction(actions, {
        key: "run-print-readiness",
        label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
        onClick: onPrecheckV1PrintReadiness,
        disabled: printReadinessPrecheckAction.loading,
      });
    }

    if (onPrecheckProductionGoLive) {
      addPhaseAction(actions, {
        key: "run-production-go-live",
        label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
        onClick: onPrecheckProductionGoLive,
        disabled: productionGoLivePrecheckAction.loading,
      });
    }

    return actions;
  }


  function buildSelectedPhaseQuickActions() {
    const phaseKey = selectedPhase.key || "";
    const knownPhaseKeys = new Set([
      "production_environment",
      "print_hardware",
      "driver_device",
      "business_pilot",
      "security_and_signoff",
      "remaining",
    ]);
    const hasKnownPhaseKey = knownPhaseKeys.has(phaseKey);
    const phaseHeadlineText = [
      phaseKey,
      selectedPhase.label,
      selectedPhase.nextStep,
    ].filter(Boolean).join(" ");
    const actions = [];
    const isProductionPhase = phaseKey === "production_environment" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("生产环境") || phaseHeadlineText.includes("持久化") || phaseHeadlineText.includes("PostgreSQL")));
    const isPrintPhase = phaseKey === "print_hardware" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("打印") || phaseHeadlineText.includes("CUPS") || phaseHeadlineText.includes("spool") || phaseHeadlineText.includes("标签")));
    const isDriverPhase = phaseKey === "driver_device" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("司机") || phaseHeadlineText.includes("真机") || phaseHeadlineText.includes("原生")));
    const isBusinessPhase = phaseKey === "business_pilot" || phaseKey === "remaining" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("业务试跑") || phaseHeadlineText.includes("业务试运行") || phaseHeadlineText.includes("真实订单") || phaseHeadlineText.includes("客户订单")));
    const isSecurityPhase = phaseKey === "security_and_signoff" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("签字") || phaseHeadlineText.includes("边界") || phaseHeadlineText.includes("安全运维") || phaseHeadlineText.includes("审计")));

    if (isProductionPhase) {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      addPhaseAction(actions, {
        key: "open-env-template",
        label: "查看安全 env 草稿",
        onClick: focusProductionEnvFillTemplateFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-minimum-env-template",
        label: "查看最小片段",
        onClick: focusProductionEnvMinimumValuesTemplateFromPhase,
        disabled: !productionEnvMinimumValuesFragmentTemplate,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (isPrintPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1PrintSpool) {
        addPhaseAction(actions, {
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintCups) {
        addPhaseAction(actions, {
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintReadiness) {
        addPhaseAction(actions, {
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      const printEvidenceItem = findMissingEvidenceOptionByText(["打印", "标签", "CUPS", "样张", "纸张", "条码"]);
      if (printEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (isDriverPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (isBusinessPhase) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      const businessEvidenceItem = findMissingEvidenceOptionByText(["真实业务", "真实订单", "客户订单", "出库", "交付", "异常待办", "订单录入"]);
      if (businessEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-business-evidence",
          label: "填业务试跑证据",
          onClick: () => selectMissingEvidenceForStage(businessEvidenceItem),
        });
      }
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (isSecurityPhase) {
      const firstSignoffItem = findSignoffBoundaryOptionByText(["办公室", "技术", "管理", "财务"]) ||
        signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
        null;
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }


  function buildCompletionAuditActions(criterion = {}) {
    const actions = [];
    const key = criterion.key || "";

    if (key === "release_candidate") {
      addPhaseAction(actions, {
        key: "open-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
      if (onRefreshReleaseCandidate) {
        addPhaseAction(actions, {
          key: "run-refresh-candidate",
          label: releaseCandidateRefreshAction.loading ? "刷新中" : "刷新候选",
          onClick: onRefreshReleaseCandidate,
          disabled: releaseCandidateRefreshAction.loading,
        });
      }
    }

    if (key === "production_env") {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (canShowProductionEnvFrontDoorReview) {
        addPhaseAction(actions, {
          key: "run-production-env-front-door",
          label: productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: !canRunProductionEnvFrontDoorReview || productionGoLivePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (key === "runtime_readiness") {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckRuntimeReadiness) {
        addPhaseAction(actions, {
          key: "run-runtime-readiness",
          label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前运行时预检",
          onClick: onPrecheckRuntimeReadiness,
          disabled: runtimeReadinessPrecheckAction.loading,
        });
      }
    }

    if (key === "field_acceptance") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (key === "field_evidence") {
      const firstEvidenceItem = missingEvidenceOptions[0] || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      if (canRunFieldEvidenceCloseoutReview) {
        addPhaseAction(actions, {
          key: "run-field-evidence-closeout",
          label: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading ? "复核中" : "校验并预检刷新",
          onClick: runFieldEvidenceCloseoutReview,
          disabled: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (key === "owner_signoff") {
      const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "签字 / 边界进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (key === "v1_v2_boundary") {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return actions;
  }


  return {
    buildCompletionAuditActions,
    buildProductionEnvGateActions,
    buildSelectedPhaseQuickActions,
  };
}
