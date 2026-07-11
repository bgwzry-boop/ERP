import { filterPrintDevices } from "../printDeviceRepository.mjs";
import { filterPrinterDeviceFieldTests } from "../printerDeviceFieldTestRepository.mjs";
import { getPrinterDeviceFieldTestEvidenceSummary } from "../../src/services/printerDeviceFieldTestClient.js";

export const v1PrintReadinessDeviceRequirements = Object.freeze([
  {
    key: "express-ltl-label-printer",
    label: "快递/快运标签机",
    deviceType: "label_printer",
    documentTypes: ["express_ltl_label", "package_label"],
    requiredChecks: ["sample_print", "paper_alignment", "barcode_scan", "driver_callback", "legibility", "void_reprint"],
  },
  {
    key: "dot-matrix-notes-printer",
    label: "针式出库/自提/送货单",
    deviceType: "dot_matrix",
    documentTypes: ["outbound_note", "pickup_note", "delivery_note"],
    requiredChecks: ["sample_print", "paper_alignment", "barcode_scan", "driver_callback", "legibility", "void_reprint"],
  },
]);

export function buildPrintDriverV1Readiness({
  workspace = {},
  operatorId = "",
  getConfiguration,
  getSpoolDiagnostics,
  getCupsDiagnostics,
  now = () => new Date(),
} = {}) {
  assertDependency(getConfiguration, "getConfiguration");
  assertDependency(getSpoolDiagnostics, "getSpoolDiagnostics");
  assertDependency(getCupsDiagnostics, "getCupsDiagnostics");

  const checkedAt = now().toISOString();
  const configResponse = getConfiguration(workspace);
  const printDriverAdapter = configResponse.printDriverAdapter;
  const spoolDiagnostics = getSpoolDiagnostics({ workspace, operatorId });
  const cupsDiagnostics = getCupsDiagnostics({ workspace, operatorId });
  const deviceReadiness = v1PrintReadinessDeviceRequirements.map((requirement) =>
    buildDeviceReadiness({ workspace, requirement }),
  );
  const environmentBlockingCount = Number(printDriverAdapter?.environmentPreflight?.summary?.blockingCount ?? 0);
  const configReady = printDriverAdapter?.realDispatchAvailable === true && environmentBlockingCount === 0;
  const criteria = [
    criterion({
      key: "print-driver-config",
      label: "系统打印配置",
      passed: configReady,
      detail: configReady
        ? "打印驱动配置允许 command_bridge 真实派发"
        : printDriverAdapter?.realDispatchAvailable === true
          ? `打印驱动已启用，但环境预检仍有 ${environmentBlockingCount} 项阻断`
          : "系统打印配置仍未达到真实派发条件",
    }),
    criterion({
      key: "spool-status-readback",
      label: "spool 状态回读",
      passed: spoolDiagnostics.ready === true,
      detail: spoolDiagnostics.ready
        ? "诊断 spool 文件可写、pending / completed 可回读且已清理"
        : "spool 状态回读诊断未通过或尚未配置",
      evidence: {
        status: spoolDiagnostics.status,
        writeOk: spoolDiagnostics.writeOk,
        pendingPollOk: spoolDiagnostics.pendingPollOk,
        completedPollOk: spoolDiagnostics.completedPollOk,
        cleanupOk: spoolDiagnostics.cleanupOk,
      },
    }),
    criterion({
      key: "cups-queue-preflight",
      label: "CUPS 队列预检",
      passed: cupsDiagnostics.ready === true,
      detail: cupsDiagnostics.ready
        ? "CUPS 队列状态命令可运行且目标队列命中白名单"
        : "CUPS 队列预检未通过或尚未配置",
      evidence: {
        status: cupsDiagnostics.status,
        cupsPrinterConfigured: cupsDiagnostics.cupsPrinterConfigured,
        cupsPrinterAllowed: cupsDiagnostics.cupsPrinterAllowed,
        cupsStatusCommandConfigured: cupsDiagnostics.cupsStatusCommandConfigured,
        cupsStatusCommandRunnable: cupsDiagnostics.cupsStatusCommandRunnable,
      },
    }),
    ...deviceReadiness.flatMap((item) => item.criteria),
  ];
  const summary = buildSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_print_go_live_readiness",
    summary,
    requiredDocumentTypes: [...new Set(v1PrintReadinessDeviceRequirements.flatMap((item) => item.documentTypes))],
    criteria,
    deviceReadiness,
    printDriverAdapter,
    spoolDiagnostics,
    cupsDiagnostics,
    remainingV1Risks: buildRemainingRisks({ summary, deviceReadiness, spoolDiagnostics, cupsDiagnostics, printDriverAdapter }),
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  };
}

function buildDeviceReadiness({ workspace, requirement }) {
  const devices = filterPrintDevices(workspace.printDevices, { status: "active" });
  const device =
    devices.find((item) => item.deviceType === requirement.deviceType && supportsAllDocumentTypes(item, requirement.documentTypes)) ??
    null;
  const latestFieldTestRecord = device
    ? filterPrinterDeviceFieldTests(workspace.printerDeviceFieldTests, {
        printDeviceId: device.printDeviceId,
        limit: 1,
      })[0] ?? device.latestFieldTestRecord ?? null
    : null;
  const driverMode = text(device?.settings?.driverMode) || "preview_only";
  const qaEvaluation = evaluateFieldTest({ record: latestFieldTestRecord, requiredChecks: requirement.requiredChecks });
  const criteria = [
    criterion({
      key: `${requirement.key}-device-configured`,
      label: `${requirement.label}设备资料`,
      passed: Boolean(device),
      detail: device
        ? `已配置 ${device.name}，覆盖 ${requirement.documentTypes.join(" / ")}`
        : `缺少 active ${requirement.deviceType}，需覆盖 ${requirement.documentTypes.join(" / ")}`,
      evidence: {
        printDeviceId: device?.printDeviceId ?? "",
        deviceType: device?.deviceType ?? requirement.deviceType,
        documentTypes: requirement.documentTypes,
      },
    }),
    criterion({
      key: `${requirement.key}-driver-mode`,
      label: `${requirement.label}驱动模式`,
      passed: driverMode === "system_printer",
      detail:
        driverMode === "system_printer"
          ? "设备已设置为 system_printer，可进入真实驱动派发"
          : `设备仍为 ${driverMode}，不会进入真实系统打印`,
      evidence: { printDeviceId: device?.printDeviceId ?? "", driverMode },
    }),
    criterion({
      key: `${requirement.key}-field-qa`,
      label: `${requirement.label}现场 QA`,
      passed: qaEvaluation.ready,
      detail: qaEvaluation.ready ? "最新现场 QA 记录全部关键项通过" : qaEvaluation.detail,
      evidence: {
        printDeviceId: device?.printDeviceId ?? "",
        latestRecordId: latestFieldTestRecord?.recordId ?? "",
        latestCheckedAt: latestFieldTestRecord?.checkedAt ?? "",
        missingChecks: qaEvaluation.missingChecks,
        failedChecks: qaEvaluation.failedChecks,
        blockedChecks: qaEvaluation.blockedChecks,
        untestedChecks: qaEvaluation.untestedChecks,
      },
    }),
  ];
  return {
    key: requirement.key,
    label: requirement.label,
    ready: criteria.every((item) => item.status === "passed"),
    documentTypes: requirement.documentTypes,
    requiredChecks: requirement.requiredChecks,
    printDevice: summarizeDevice(device),
    latestFieldTestRecord: latestFieldTestRecord ?? null,
    latestFieldTestSummary: latestFieldTestRecord?.summary ?? null,
    criteria,
  };
}

function supportsAllDocumentTypes(device, documentTypes) {
  const supported = new Set([...(device?.supportedDocumentTypes ?? []), ...(device?.defaultDocumentTypes ?? [])]);
  return documentTypes.every((documentType) => supported.has(documentType));
}

function evaluateFieldTest({ record, requiredChecks }) {
  if (!record) {
    return {
      ready: false,
      detail: "尚未记录现场 QA，无法证明样张、对位、扫码、回写、清晰度、作废重打和证据签认已通过",
      missingChecks: requiredChecks,
      failedChecks: [],
      blockedChecks: [],
      untestedChecks: [],
      missingEvidence: [],
    };
  }
  const byKey = new Map((record.checks ?? []).map((check) => [text(check.key), check]));
  const missingChecks = requiredChecks.filter((key) => !byKey.has(key));
  const failedChecks = [];
  const blockedChecks = [];
  const untestedChecks = [];
  for (const key of requiredChecks) {
    const status = text(byKey.get(key)?.status);
    if (status === "failed") failedChecks.push(key);
    if (status === "blocked") blockedChecks.push(key);
    if (!status || status === "untested") untestedChecks.push(key);
  }
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(record.evidence ?? record.summary?.evidence);
  const missingEvidence = evidenceSummary.missingKeys ?? [];
  const ready = !missingChecks.length && !failedChecks.length && !blockedChecks.length && !untestedChecks.length && evidenceSummary.complete;
  return {
    ready,
    detail: ready
      ? "最新现场 QA 记录全部关键项通过，且证据摘要完整"
      : `现场 QA 未通过：缺 ${missingChecks.length} 项，失败 ${failedChecks.length} 项，受限 ${blockedChecks.length} 项，未测 ${untestedChecks.length} 项，证据缺 ${missingEvidence.length} 项`,
    missingChecks,
    failedChecks,
    blockedChecks,
    untestedChecks,
    missingEvidence,
  };
}

function summarizeDevice(device) {
  if (!device) return null;
  return {
    printDeviceId: device.printDeviceId,
    name: device.name,
    deviceType: device.deviceType,
    status: device.status,
    connectionType: device.connectionType,
    driverName: device.driverName,
    supportedDocumentTypes: device.supportedDocumentTypes ?? [],
    defaultDocumentTypes: device.defaultDocumentTypes ?? [],
    paperWidthMm: device.paperWidthMm,
    paperHeightMm: device.paperHeightMm,
    paperName: device.paperName,
    isContinuous: Boolean(device.isContinuous),
    driverMode: text(device.settings?.driverMode) || "preview_only",
  };
}

function buildRemainingRisks({ summary, deviceReadiness, spoolDiagnostics, cupsDiagnostics, printDriverAdapter }) {
  const risks = [];
  if (printDriverAdapter?.realDispatchAvailable !== true) risks.push("系统打印 command_bridge 尚未达到真实派发条件");
  if (spoolDiagnostics.ready !== true) risks.push("spool 状态回读诊断未通过或未配置");
  if (cupsDiagnostics?.ready !== true) risks.push("CUPS 队列预检未通过或未配置");
  for (const item of deviceReadiness) {
    if (!item.printDevice) risks.push(`${item.label}缺少 active 设备资料`);
    if (item.printDevice && item.printDevice.driverMode !== "system_printer") {
      risks.push(`${item.label}仍是 ${item.printDevice.driverMode} 模式，未接真实系统打印`);
    }
    if (!item.latestFieldTestRecord) risks.push(`${item.label}缺少现场 QA 记录`);
    if (item.latestFieldTestRecord && !item.ready) risks.push(`${item.label}现场 QA 仍有未通过项目`);
  }
  if (summary.blockingCount === 0) risks.push("仍需保留现场抽检、纸张耗材更换后复验和异常重打演练");
  return [...new Set(risks)];
}

function criterion({ key, label, passed, detail, evidence = {} }) {
  return { key, label, status: passed ? "passed" : "pending", tone: passed ? "success" : "warning", blocking: true, detail, evidence };
}

function buildSummary(criteria) {
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCount = criteria.filter((item) => item.blocking && item.status !== "passed").length;
  return {
    label: `${passedCount}/${criteria.length} 通过`,
    passedCount,
    totalCount: criteria.length,
    blockingCount,
    tone: blockingCount ? "danger" : "success",
  };
}

function assertDependency(value, name) {
  if (typeof value !== "function") throw new Error(`print driver V1 readiness requires ${name}`);
}

function text(value) {
  return String(value ?? "").trim();
}
