export function createV1StatusFieldRoleActionBuilders({
  attachmentRetentionPrecheckAction = {},
  driverReadinessPrecheckAction = {},
  fieldEvidenceIntakeQualityRef,
  findMatchingMissingEvidenceOptionByText,
  findSignoffBoundaryOptionByText,
  focusFieldAcceptanceReportFromPhase,
  focusFieldEvidenceProgressFromPhase,
  focusMissingEvidenceGroup,
  focusProductionEnvFixChecklistFromBlocker,
  focusRuntimeReadinessFromPhase,
  focusV1V2BoundaryBriefFromBlocker,
  missingEvidenceOptions = [],
  onPrecheckProductionEnv,
  onPrecheckProductionGoLive,
  onPrecheckReleaseCandidateRefresh,
  onPrecheckV1AttachmentRetention,
  onPrecheckV1DriverReadiness,
  onPrecheckV1Persistence,
  onPrecheckV1PrintCups,
  onPrecheckV1PrintReadiness,
  onPrecheckV1PrintSpool,
  onPrecheckV1V2Boundary,
  persistencePrecheckAction = {},
  printCupsPrecheckAction = {},
  printReadinessPrecheckAction = {},
  printSpoolPrecheckAction = {},
  productionEnvGateRef,
  productionEnvPrecheckAction = {},
  productionGoLivePrecheckAction = {},
  releaseCandidateRefreshPrecheckAction = {},
  scrollV1StatusRefIntoView,
  selectedMissingEvidenceGroupKey = "",
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  signoffBoundaryOptions = [],
  v1V2BoundaryPrecheckAction = {},
} = {}) {
  function addPhaseAction(actions, action) {
    if (!action || actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  function buildFieldEvidenceGroupActions(group = {}) {
    const actions = [];
    const groupKey = group.key || "";
    const firstMissingItem = group.firstMissingItem || null;
    const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
    const firstOwnerSignoffItem = findSignoffBoundaryOptionByText(["技术", "管理", "办公室", "财务"]) ||
      signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
      null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;

    if (firstMissingItem) {
      addPhaseAction(actions, {
        key: `fill-first-${groupKey}`,
        label: "填本组第一条",
        onClick: () => selectMissingEvidenceForStage(firstMissingItem),
      });
    }

    if (groupKey === "production_persistence") {
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
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

    if (groupKey === "object_storage") {
      if (onPrecheckV1AttachmentRetention) {
        addPhaseAction(actions, {
          key: "run-attachment-retention",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
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
    }

    if (groupKey === "print_hardware") {
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
    }

    if (groupKey === "driver_native_device") {
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (groupKey === "business_workflow_pilot") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "security_operations") {
      if (firstOwnerSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstOwnerSignoffItem),
        });
      }
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

    if (group.missingCount > 0) {
      addPhaseAction(actions, {
        key: `filter-evidence-${groupKey}`,
        label: selectedMissingEvidenceGroupKey === groupKey ? "正在看本组" : "只看本组",
        onClick: () => focusMissingEvidenceGroup(group),
        disabled: selectedMissingEvidenceGroupKey === groupKey,
      });
    }

    return actions;
  }


  function buildRoleTaskQuickActions(task = {}) {
    const actions = [];
    const taskType = task.type || "";
    const haystack = [
      task.id,
      task.type,
      task.group,
      task.title,
      task.action,
      task.primaryRole,
      ...(Array.isArray(task.roles) ? task.roles : []),
    ].filter(Boolean).join(" ");
    const addRoleAction = (action) => addPhaseAction(actions, action);

    if (taskType === "发布门禁" || haystack.includes("生产环境变量")) {
      if (haystack.includes("生产环境变量") || haystack.includes("env") || haystack.includes("环境变量")) {
        addRoleAction({
          key: "open-production-gate",
          label: "生产配置门禁",
          onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
        });
        addRoleAction({
          key: "open-env-fix",
          label: "查看 env 修正项",
          onClick: focusProductionEnvFixChecklistFromBlocker,
        });
        if (onPrecheckProductionEnv) {
          addRoleAction({
            key: "run-production-env-precheck",
            label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
            onClick: onPrecheckProductionEnv,
            disabled: productionEnvPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("运行时 V1") || haystack.includes("readiness") || haystack.includes("门禁")) {
        addRoleAction({
          key: "open-runtime-readiness",
          label: "运行时门禁",
          onClick: focusRuntimeReadinessFromPhase,
        });
      }
      if (haystack.includes("持久化") || haystack.includes("PostgreSQL")) {
        if (onPrecheckV1Persistence) {
          addRoleAction({
            key: "run-persistence-precheck",
            label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
            onClick: onPrecheckV1Persistence,
            disabled: persistencePrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("附件") || haystack.includes("对象存储")) {
        if (onPrecheckV1AttachmentRetention) {
          addRoleAction({
            key: "run-attachment-retention",
            label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
            onClick: onPrecheckV1AttachmentRetention,
            disabled: attachmentRetentionPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("spool")) {
        if (onPrecheckV1PrintSpool) {
          addRoleAction({
            key: "run-print-spool",
            label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
            onClick: onPrecheckV1PrintSpool,
            disabled: printSpoolPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("CUPS")) {
        if (onPrecheckV1PrintCups) {
          addRoleAction({
            key: "run-print-cups",
            label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
            onClick: onPrecheckV1PrintCups,
            disabled: printCupsPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("打印 V1") || haystack.includes("打印门禁")) {
        if (onPrecheckV1PrintReadiness) {
          addRoleAction({
            key: "run-print-readiness",
            label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
            onClick: onPrecheckV1PrintReadiness,
            disabled: printReadinessPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")) {
        if (onPrecheckV1DriverReadiness) {
          addRoleAction({
            key: "run-driver-readiness",
            label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
            onClick: onPrecheckV1DriverReadiness,
            disabled: driverReadinessPrecheckAction.loading,
          });
        }
      }
    }

    if (taskType === "现场证据") {
      const evidenceItem = findMatchingMissingEvidenceOptionByText([task.title, task.group, task.action]);
      if (evidenceItem) {
        addRoleAction({
          key: "fill-evidence",
          label: "填证据草稿",
          onClick: () => selectMissingEvidenceForStage(evidenceItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("签字") || haystack.includes("负责人签字")) {
      const signoffItem = findSignoffBoundaryOptionByText([task.title, task.primaryRole, task.group]);
      if (signoffItem) {
        addRoleAction({
          key: "fill-signoff",
          label: "填签字草稿",
          onClick: () => selectSignoffBoundaryForStage(signoffItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("边界") || haystack.includes("V1/V2 边界")) {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      if (boundaryItem) {
        addRoleAction({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addRoleAction({
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addRoleAction({
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addRoleAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }

  function buildRoleTaskCategorySummaries(board = {}) {
    const summary = board.summary || {};
    const sourceCategories = Array.isArray(board.categorySummaries) ? board.categorySummaries : [];
    const sourceByKey = new Map(sourceCategories.map((item) => [item.key, item]));
    const firstEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const categories = [
      {
        key: "release",
        title: sourceByKey.get("release")?.title || "发布门禁",
        tone: "danger",
        count: Number(sourceByKey.get("release")?.count ?? summary.releaseTaskCount) || 0,
        description: sourceByKey.get("release")?.nextAction || "先处理生产 env、runtime readiness、持久化、对象存储、打印和司机真机门禁。",
        firstTasks: sourceByKey.get("release")?.firstTasks || [],
        actions: [],
      },
      {
        key: "evidence",
        title: sourceByKey.get("evidence")?.title || "现场证据",
        tone: "blue",
        count: Number(sourceByKey.get("evidence")?.count ?? summary.evidenceTaskCount) || 0,
        description: sourceByKey.get("evidence")?.nextAction || "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。",
        firstTasks: sourceByKey.get("evidence")?.firstTasks || [],
        actions: [],
      },
      {
        key: "signoff",
        title: sourceByKey.get("signoff")?.title || "负责人签字",
        tone: "warning",
        count: Number(sourceByKey.get("signoff")?.count ?? summary.signoffTaskCount) || 0,
        description: sourceByKey.get("signoff")?.nextAction || "完成办公室、仓库/出库、车间、司机、财务、技术/管理负责人确认。",
        firstTasks: sourceByKey.get("signoff")?.firstTasks || [],
        actions: [],
      },
      {
        key: "boundary",
        title: sourceByKey.get("boundary")?.title || "V1/V2 边界",
        tone: "warning",
        count: Number(sourceByKey.get("boundary")?.count ?? summary.boundaryTaskCount) || 0,
        description: sourceByKey.get("boundary")?.nextAction || "确认哪些必须留在 V1 完成，哪些进入计划 V2，避免把上线门禁后移。",
        firstTasks: sourceByKey.get("boundary")?.firstTasks || [],
        actions: [],
      },
    ];
    const releaseCategory = categories.find((item) => item.key === "release");
    const evidenceCategory = categories.find((item) => item.key === "evidence");
    const signoffCategory = categories.find((item) => item.key === "signoff");
    const boundaryCategory = categories.find((item) => item.key === "boundary");

    if (releaseCategory) {
      addPhaseAction(releaseCategory.actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(releaseCategory.actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (evidenceCategory) {
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(evidenceCategory.actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (signoffCategory) {
      addPhaseAction(signoffCategory.actions, {
        key: "open-signoff-progress",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(signoffCategory.actions, {
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (boundaryCategory) {
      if (boundaryItem) {
        addPhaseAction(boundaryCategory.actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(boundaryCategory.actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(boundaryCategory.actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return categories.map((category) => ({
      ...category,
      countLabel: `${category.count} 项`,
      statusLabel: sourceByKey.get(category.key)?.statusLabel || (category.count > 0 ? "待处理" : "已清空"),
      firstTasks: category.firstTasks.slice(0, 3),
    }));
  }

  return {
    buildFieldEvidenceGroupActions,
    buildRoleTaskCategorySummaries,
    buildRoleTaskQuickActions,
  };
}
