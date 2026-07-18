export function createDemoWorkspaceSeedService(dependencies = {}) {
  const {
    buildOperationLog,
    buildPrintDeviceSnapshot,
    findPrintDevice,
    nextPlainId,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildOperationLog,
    buildPrintDeviceSnapshot,
    findPrintDevice,
    nextPlainId,
    now,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({
    buildInitialTaskSeeds,
    seedPrintJobs,
  });

  function buildInitialTaskSeeds({ workspace, runtimeConfig } = {}) {
    if (isProductionRuntime(runtimeConfig ?? workspace?.runtimeConfig)) {
      return { productionTasks: [], packingTasks: [] };
    }
    return {
      productionTasks: buildInitialProductionTasks(workspace, { nextPlainId, now }),
      packingTasks: buildInitialPackingTasks(workspace, { nextPlainId, now }),
    };
  }

  async function seedPrintJobs(workspace) {
    if (isProductionRuntime(workspace?.runtimeConfig)) {
      return { createdCount: 0, createdPrintJobIds: [], skippedReason: "production_runtime" };
    }
    const createPrintJob = workspace?.printJobRepository?.createPrintJob;
    if (typeof createPrintJob !== "function") {
      return { createdCount: 0, createdPrintJobIds: [], skippedReason: "repository_unavailable" };
    }

    const existingIds = new Set((workspace.printJobs ?? []).map((item) => item.printJobId));
    const labelDevice =
      (await findPrintDevice(workspace, "PRN-LABEL-A")) ??
      (workspace.printDevices ?? []).find((item) => item.deviceType === "label_printer") ??
      (workspace.printDevices ?? [])[0] ??
      null;
    if (!labelDevice) {
      return { createdCount: 0, createdPrintJobIds: [], skippedReason: "print_device_unavailable" };
    }

    const createdAt = new Date(now()).toISOString();
    const demoJobs = [
      buildOfficePrintJobDemoSeed({
        printJobId: "PJ-DEMO-QUEUED-DISPATCH",
        targetId: "F003",
        printDevice: labelDevice,
        jobStatus: "queued",
        driverMode: "system_printer",
        createdAt,
        buildPrintDeviceSnapshot,
        metadata: {
          demoPurpose: "office_print_job_queue_dispatch",
          note: "用于办公室打印作业池派发按钮验收；当前 guarded adapter 会明确返回未配置真实打印驱动。",
        },
      }),
      buildOfficePrintJobDemoSeed({
        printJobId: "PJ-DEMO-FAILED-RETRY",
        targetId: "F004",
        printDevice: labelDevice,
        jobStatus: "failed",
        driverMode: "system_printer",
        createdAt,
        errorCode: "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED",
        errorMessage: "真实打印驱动未配置，等待办公室重试或现场处理。",
        buildPrintDeviceSnapshot,
        metadata: {
          demoPurpose: "office_print_job_queue_retry",
          note: "用于办公室打印作业池重试按钮验收。",
        },
      }),
    ];

    const createdPrintJobIds = [];
    for (const printJob of demoJobs) {
      if (existingIds.has(printJob.printJobId)) continue;
      const operationLog = buildOperationLog(workspace, {
        targetType: "print_job",
        targetId: printJob.printJobId,
        action: "seed_office_print_job_demo",
        operatorId: "U-PRINT-DRIVER-A",
        after: printJob,
        reason: "Seed office print-job queue demo records for queued dispatch and failed retry validation.",
      });
      await createPrintJob.call(workspace.printJobRepository, { workspace, printJob, operationLog });
      createdPrintJobIds.push(printJob.printJobId);
    }
    return {
      createdCount: createdPrintJobIds.length,
      createdPrintJobIds,
      skippedReason: "",
    };
  }
}

export function isProductionRuntime(runtimeConfig = {}) {
  return (
    runtimeConfig?.production === true ||
    runtimeConfig?.isProduction === true ||
    String(runtimeConfig?.mode ?? "").trim().toLowerCase() === "production"
  );
}

export function buildInitialProductionTasks(workspace = {}, dependencies = {}) {
  const { nextPlainId, now = () => new Date() } = dependencies;
  if (typeof nextPlainId !== "function") throw new TypeError("nextPlainId must be a function");
  const productionLines = (workspace.orderLines ?? []).filter((line) => {
    const status = String(line.status ?? line.lineStatus ?? "");
    return status.includes("制袋") || status.includes("丝印") || status.includes("待排产") || status.includes("待补印");
  });
  return productionLines.map((line, index) => {
    const productionTaskId = nextPlainId("PT", line.id ?? line.orderLineId ?? index + 1);
    const status = String(line.status ?? line.lineStatus ?? "");
    const machineId = status.includes("丝印") || status.includes("补印") ? "PRINT-01" : "BAG-01";
    return {
      id: productionTaskId,
      productionTaskId,
      bizNo: productionTaskId,
      orderLineId: line.id ?? line.orderLineId,
      lineId: line.id ?? line.orderLineId,
      taskType: status.includes("丝印") || status.includes("补印") ? "丝印" : "制袋",
      machineId,
      publishedScheduleId: status.includes("待排产")
        ? ""
        : nextPlainId("SCH", `${machineId}-${line.id ?? line.orderLineId ?? index + 1}`),
      plannedQty: Number(line.qty ?? line.originalQty ?? 0),
      qty: Number(line.qty ?? line.originalQty ?? 0),
      taskStatus: status || "待开始",
      status: status || "待开始",
      createdBy: "U-OFFICE-A",
      createdAt: new Date(now()).toISOString(),
    };
  });
}

export function buildInitialPackingTasks(workspace = {}, dependencies = {}) {
  const { nextPlainId, now = () => new Date() } = dependencies;
  if (typeof nextPlainId !== "function") throw new TypeError("nextPlainId must be a function");
  const packingLines = (workspace.orderLines ?? []).filter((line) => {
    const status = String(line.status ?? line.lineStatus ?? "");
    return status.includes("待打包");
  });
  return packingLines.map((line, index) => {
    const orderLineId = line.id ?? line.orderLineId ?? index + 1;
    const packingTaskId = nextPlainId("PKT", orderLineId);
    return {
      id: packingTaskId,
      packingTaskId,
      bizNo: packingTaskId,
      orderLineId,
      lineId: orderLineId,
      plannedQty: Number(line.qty ?? line.originalQty ?? 0),
      actualPackedQty: 0,
      qty: Number(line.qty ?? line.originalQty ?? 0),
      status: "待打包",
      createdBy: "U-OFFICE-A",
      createdAt: new Date(now()).toISOString(),
    };
  });
}

export function buildOfficePrintJobDemoSeed(input = {}) {
  const {
    printJobId,
    targetId,
    printDevice,
    jobStatus,
    driverMode,
    createdAt,
    errorCode = "",
    errorMessage = "",
    metadata = {},
    buildPrintDeviceSnapshot,
  } = input;
  if (typeof buildPrintDeviceSnapshot !== "function") {
    throw new TypeError("buildPrintDeviceSnapshot must be a function");
  }
  const printDeviceSnapshot = buildDemoPrintDeviceSnapshot(printDevice, driverMode, buildPrintDeviceSnapshot);
  const finishedAt = ["failed", "canceled", "printed"].includes(jobStatus) ? createdAt : "";
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: "",
    targetType: "fulfillment",
    targetId,
    documentType: "express_ltl_label",
    templateId: "tpl-p0-express-ltl-label",
    printDeviceId: printDeviceSnapshot.printDeviceId,
    printDeviceSnapshot,
    driverMode,
    jobStatus,
    attemptNo: 1,
    sourcePrintJobId: "",
    requestedBy: "U-PRINT-DRIVER-A",
    queuedAt: jobStatus === "queued" ? createdAt : "",
    sentAt: "",
    finishedAt,
    errorCode,
    errorMessage,
    payload: {
      printTemplate: {
        templateId: "tpl-p0-express-ltl-label",
        documentType: "express_ltl_label",
        title: "快递快运包裹标签演示",
      },
      request: {
        printAction: "first_print",
        packageIds: [],
      },
    },
    metadata: {
      route: "seed_office_print_job_demo",
      driverBoundary: "guarded_system_printer_demo",
      ...metadata,
    },
    operationLogId: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function buildDemoPrintDeviceSnapshot(printDevice, driverMode, buildPrintDeviceSnapshot) {
  const snapshot = buildPrintDeviceSnapshot(printDevice) ?? {
    printDeviceId: "PRN-DEMO",
    name: "演示打印设备",
    settings: {},
  };
  return {
    ...snapshot,
    settings: {
      ...(snapshot.settings ?? {}),
      driverMode,
    },
  };
}
