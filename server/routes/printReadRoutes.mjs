import { readCompanyPrintProfile } from "../services/companyPrintProfileService.mjs";
import { buildFulfillmentNotePdf, isFulfillmentNoteTemplate } from "../../scripts/fulfillment-note-pdf.mjs";
import { mergeFulfillmentNoteTemplates } from "../../shared/fulfillmentNoteMerge.js";
export async function handlePrintReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendJson,
  sendNotFound,
  paginate,
  findPrintJob,
  findPrintDevice,
  printDriverDiagnosticsService,
}) {
  if (url.pathname === "/api/print-driver/config") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
    sendJson(response, 200, printDriverDiagnosticsService.getConfiguration({ workspace }));
    return true;
  }

  const driverMethod = {
    "/api/print-driver/spool-diagnostics": "getSpoolDiagnostics",
    "/api/print-driver/cups-diagnostics": "getCupsDiagnostics",
    "/api/print-driver/v1-readiness": "getV1Readiness",
  }[url.pathname];
  if (driverMethod) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
    sendJson(
      response,
      200,
      printDriverDiagnosticsService[driverMethod]({
        workspace,
        operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
      }),
    );
    return true;
  }

  // P2-07 单据抬头
  if (url.pathname === "/api/print-settings/company-profile") {
    if (!requireActionPermission(response, permissionContext, "print.read")) return true;
    sendJson(response, 200, { companyPrintProfile: await readCompanyPrintProfile(workspace) });
    return true;
  }

  if (url.pathname === "/api/print-batches") {
    if (!requireActionPermission(response, permissionContext, "print.read")) return true;
    const items = await workspace.printBatchRepository.listPrintBatchRecords({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        todoId: url.searchParams.get("todoId"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/print-devices") {
    if (!requireActionPermission(response, permissionContext, "print.read")) return true;
    const items = await workspace.printDeviceRepository.listPrintDevices({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        deviceType: url.searchParams.get("deviceType"),
        documentType: url.searchParams.get("documentType"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/print-jobs") {
    if (!requireActionPermission(response, permissionContext, "print.read")) return true;
    const items = await workspace.printJobRepository.listPrintJobs({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        targetType: url.searchParams.get("targetType"),
        targetId: url.searchParams.get("targetId"),
        printRecordId: url.searchParams.get("printRecordId"),
        printDeviceId: url.searchParams.get("printDeviceId"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  const deviceFieldTestsMatch = url.pathname.match(/^\/api\/print-devices\/([^/]+)\/field-tests$/);
  if (deviceFieldTestsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recordPrintDeviceFieldTest)) return true;
    const printDeviceId = decodeURIComponent(deviceFieldTestsMatch[1]);
    const printDevice = await findPrintDevice(workspace, printDeviceId);
    if (!printDevice) {
      sendNotFound(response, "PRINT_DEVICE_NOT_FOUND");
      return true;
    }
    const items = await workspace.printerDeviceFieldTestRepository.listPrinterDeviceFieldTests({
      workspace,
      filters: {
        printDeviceId,
        printJobId: url.searchParams.get("printJobId"),
        documentType: url.searchParams.get("documentType"),
        operatorId: url.searchParams.get("operatorId"),
        limit: url.searchParams.get("pageSize"),
      },
    });
    sendJson(response, 200, {
      ...paginate(items, url.searchParams),
      printDevice,
      latestRecord: items[0] ?? null,
    });
    return true;
  }

  // 负责人 2026-11-08：送货单/自提单走办公室电脑的浏览器打印。按打印任务出 PDF；
  // 同一客户、同一种单据的几张可以合成一张（?ids=任务1,任务2）。
  if (url.pathname === "/api/print-jobs/note.pdf") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
    const ids = [...new Set(String(url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 30);
    if (!ids.length) { sendJson(response, 422, { code: "PRINT_JOB_IDS_REQUIRED", message: "请指定要打印的单据。" }); return true; }
    const jobs = [];
    for (const id of ids) {
      const job = await findPrintJob(workspace, id);
      if (!job) { sendNotFound(response, "PRINT_JOB_NOT_FOUND"); return true; }
      jobs.push(job);
    }
    const templates = jobs.map((job) => job.payload?.printTemplate ?? job.payloadSnapshot?.printTemplate);
    if (templates.some((template) => !isFulfillmentNoteTemplate(template))) {
      sendJson(response, 422, { code: "PRINT_JOB_NOT_A_NOTE", message: "只有送货单、自提单能在这里打印。" });
      return true;
    }
    // 客户编号从出库记录里取，不信单据上的客户名字（会重名）。
    const customerIds = jobs.map((job, index) => {
      const fulfillmentId = String((job.targetType === "fulfillment" ? job.targetId : "") || templates[index]?.fields?.fulfillmentId || "").trim();
      const fulfillment = (workspace.fulfillments ?? []).find((row) => (row.fulfillmentId ?? row.id) === fulfillmentId);
      return String(fulfillment?.customerId ?? "").trim();
    });
    const merged = mergeFulfillmentNoteTemplates(templates, { customerIds });
    if (merged.error) { sendJson(response, 422, merged.error); return true; }
    try {
      const pdf = await buildFulfillmentNotePdf(merged.template);
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="note-${encodeURIComponent(ids[0])}.pdf"`,
        "cache-control": "no-store",
      });
      response.end(Buffer.from(pdf));
    } catch (error) {
      sendJson(response, 422, { code: "PRINT_NOTE_RENDER_FAILED", message: error?.message || "单据生成失败。" });
    }
    return true;
  }

  const printJobMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)$/);
  if (!printJobMatch) return false;
  if (!requireActionPermission(response, permissionContext, "print.read")) return true;

  const printJob = await findPrintJob(workspace, decodeURIComponent(printJobMatch[1]));
  if (printJob) sendJson(response, 200, { printJob });
  else sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  return true;
}
