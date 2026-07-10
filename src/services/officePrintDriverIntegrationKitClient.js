import {
  getPrintDriverReadinessSummary,
  normalizePrintDriverConfigForClient,
} from "./officePrintDriverConfigApiClient.js";

export const OFFICE_PRINT_DRIVER_INTEGRATION_KIT_VERSION = "p0-print-driver-integration-kit-v1.1";

const commandBridgeArgTemplate = [
  "--print-job-id",
  "{printJobId}",
  "--print-device-id",
  "{printDeviceId}",
  "--print-device-name",
  "{printDeviceName}",
];

const statusMappings = [
  {
    bridgeStatus: "queued / pending / processing / submitted / accepted",
    erpPrintJobStatus: "sent",
    meaning: "命令桥已接单，但不能证明纸张已打出",
  },
  {
    bridgeStatus: "completed / complete / printed / done / success / succeeded",
    erpPrintJobStatus: "printed",
    meaning: "spool 明确完成后，ERP 才可回写已打印",
  },
  {
    bridgeStatus: "failed / error / errored",
    erpPrintJobStatus: "failed",
    meaning: "spool 明确失败后，ERP 回写打印失败",
  },
  {
    bridgeStatus: "canceled / cancelled",
    erpPrintJobStatus: "canceled",
    meaning: "spool 明确取消后，ERP 回写已取消",
  },
];

export function buildOfficePrintDriverIntegrationKit(input = {}) {
  const config = normalizeConfigForKit(input.config);
  const samplePrintJob = buildSamplePrintJob(input.samplePrintJob);
  const readinessSummary = getPrintDriverReadinessSummary(config);
  const dispatchReady =
    config.configurationAvailable &&
    config.systemPrinterEnabled &&
    config.systemPrinterAdapterKind === "command_bridge" &&
    config.systemPrinterCommandConfigured &&
    config.systemPrinterCommandArgsConfigured &&
    config.allowedPrinterNames.length > 0 &&
    config.realDispatchAvailable;
  const statusReady = dispatchReady && config.commandBridgeStatusReadbackAvailable;

  const items = [
    {
      key: "command_bridge_dispatch",
      label: "命令桥派发",
      ready: dispatchReady,
      tone: dispatchReady ? "success" : "warning",
      adapterKind: "command_bridge",
      driverMode: "system_printer",
      entrypoint: "server/printDriverAdapter.mjs dispatchPrintJob(...)",
      commandContract: {
        commandValue: "<server-only absolute command; never exposed to browser>",
        argumentTemplate: [...commandBridgeArgTemplate],
        bridgeModes: ["spool_only", "cups_lp"],
        cupsLpMode:
          "Optional real CUPS submission mode. It must keep its own printer allowlist and still returns sent, not printed.",
        stdinPayloadShape: buildCommandBridgePayloadShape(samplePrintJob),
      },
      expectedResultShape: {
        adapterStatus: "command_sent",
        jobStatus: "sent",
        externalJobId: `PCB-${samplePrintJob.printJobId}-{digest}`,
        metadata: {
          commandBridge: {
            exitCode: 0,
            stdoutJsonOnly: true,
          },
        },
      },
      description: dispatchReady ? "可提交真实命令桥" : "仍处保护或待配置",
    },
    {
      key: "command_bridge_status_readback",
      label: "spool 状态回读",
      ready: statusReady,
      tone: statusReady ? "success" : "warning",
      adapterKind: "command_bridge",
      readback: "spool_file",
      pollingApi: "POST /api/print-jobs/{printJobId}/poll-status",
      servicePermission: "print.job.callback",
      statusMappings,
      lifecycleActions: ["status", "complete", "fail", "cancel"],
      description: statusReady ? "可通过 spool 文件回写终态" : "状态回读仍未满足",
    },
  ];

  return {
    title: "打印联调包",
    version: OFFICE_PRINT_DRIVER_INTEGRATION_KIT_VERSION,
    adapterName: config.adapterName,
    adapterKind: config.systemPrinterAdapterKind,
    ready: items.every((item) => item.ready),
    readinessSummary,
    allowedPrinterCount: config.allowedPrinterNames.length,
    commandBridge: {
      mode: "spool_only / cups_lp",
      argumentTemplate: [...commandBridgeArgTemplate],
      statusMappings,
    },
    environment: {
      ERP_SYSTEM_PRINTER_ENABLED: "true",
      ERP_SYSTEM_PRINTER_ADAPTER: "command_bridge",
      ERP_SYSTEM_PRINTER_COMMAND: "<server-only absolute command>",
      ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: JSON.stringify(commandBridgeArgTemplate),
      ERP_SYSTEM_PRINTER_ALLOWLIST: "<printer id/name allowlist on server>",
      ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: "<server-only local spool directory>",
      ERP_PRINT_COMMAND_BRIDGE_MODE: "spool_only | cups_lp",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_COMMAND: "lp",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "<cups printer name allowlist on server>",
    },
    safeguards: {
      commandValueExposed: false,
      rawCommandArgsExposed: false,
      spoolPathExposed: false,
      payloadContentsExposed: false,
      physicalPrinterProofRequired: true,
    },
    items,
  };
}

export function getOfficePrintDriverIntegrationKitSummary(kit = {}) {
  const items = Array.isArray(kit.items) ? kit.items : [];
  if (!items.length) return "未生成打印联调包";
  return items
    .map((item) => `${cleanText(item.label)} ${item.key === "command_bridge_status_readback" ? "spool_file" : "command_bridge"}`)
    .join(" / ");
}

function normalizeConfigForKit(value) {
  if (isPlainObject(value)) return normalizePrintDriverConfigForClient(value);
  return normalizePrintDriverConfigForClient({
    adapterName: "print-driver-integration-kit-unavailable",
    configurationAvailable: false,
    systemPrinterEnabled: false,
    systemPrinterAdapterKind: "unknown",
    systemPrinterCommandConfigured: false,
    systemPrinterCommandArgsConfigured: false,
    commandBridgeStatusReadbackAvailable: false,
    allowedPrinterNames: [],
    realDispatchAvailable: false,
    safeguards: {
      commandValueExposed: false,
      physicalPrinterCallsBlocked: true,
    },
  });
}

function buildSamplePrintJob(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    printJobId: cleanText(source.printJobId) || "PJ-SAMPLE-COMMAND-BRIDGE-001",
    printDeviceId: cleanText(source.printDeviceId) || "PRN-SAMPLE-LABEL-A",
    printDeviceName: cleanText(source.printDeviceName) || "Sample Label Printer",
    driverName: cleanText(source.driverName) || "Sample 203dpi Driver",
    connectionUri: cleanText(source.connectionUri) || "system://sample-label-printer",
    documentType: cleanText(source.documentType) || "express_ltl_label",
    targetType: cleanText(source.targetType) || "fulfillment",
    targetId: cleanText(source.targetId) || "FUL-SAMPLE-001",
  };
}

function buildCommandBridgePayloadShape(samplePrintJob) {
  return {
    printJobId: samplePrintJob.printJobId,
    printDeviceId: samplePrintJob.printDeviceId,
    printDeviceName: samplePrintJob.printDeviceName,
    driverName: samplePrintJob.driverName,
    connectionUri: samplePrintJob.connectionUri,
    documentType: samplePrintJob.documentType,
    targetType: samplePrintJob.targetType,
    targetId: samplePrintJob.targetId,
    payloadSnapshot: "{ templateId, documentNo, packageIds, labelTextHash }",
    printDeviceSnapshot: "{ printDeviceId, name, driverName, connectionUri, settings }",
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
