// 负责人 2026-11-08：送货单/自提单用办公室电脑的针式打印机打（浏览器打印），打完办公室确认才记已打印。
// 跑完全部迁移的 PostgreSQL：迁移补上了自提单/送货单模板和浏览器打印的针式机；打印任务排队等确认；
// 办公室确认后打印记录变成已打印、纸单变成已打印待交库房；程序回报的打印机不能手工确认；几张同客户的单子合成一张 PDF。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresPrintDeviceRepository } from "../server/printDeviceRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresPrintJobRepository } from "../server/printJobRepository.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { buildFulfillmentNotePdf } from "./fulfillment-note-pdf.mjs";
import { mergeFulfillmentNoteTemplates } from "../shared/fulfillmentNoteMerge.js";
import { handlePrintReadRoutes } from "../server/routes/printReadRoutes.mjs";

const name = `erp-browser-note-${process.pid}-${Date.now()}`;
const docker = args => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
const pdfText = async (bytes) => {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false }).promise;
  let all = "";
  for (let page = 1; page <= doc.numPages; page += 1) all += (await (await doc.getPage(page)).getTextContent()).items.map(item => item.str).join("");
  return all;
};
let pool;
try {
  docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise(r => setTimeout(r, 200)); }
  const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const m of migrations) await pool.query(m.sql);
  // 迁移在空库上补的模板和打印机。
  const device = (await pool.query("SELECT connection_type, settings_json->>'driverMode' AS mode, default_document_types FROM printer_devices WHERE id='PRN-DOT-A'")).rows[0];
  assert.deepEqual([device.connection_type, device.mode], ["browser_download", "browser_download"]);
  assert.ok(device.default_document_types.includes("pickup_note") && device.default_document_types.includes("delivery_note"));
  assert.equal(Number((await pool.query("SELECT count(*) FROM print_templates WHERE id IN ('tpl-p0-pickup-note','tpl-p0-delivery-note')")).rows[0].count), 2);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query(`INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,settings_json) VALUES('PRINT-DRIVER-PAPER','PRINT-DRIVER-PAPER','程序回报的针式机','dot_matrix','system_printer',ARRAY['pickup_note','delivery_note'],'{"driverMode":"system_printer"}');
    INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) VALUES('PRICE-BROWSER-1','ORD-0629-001-01','confirmation',1,0.36,500,180,'U-OFFICE-A');
    INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) SELECT 'PRICE-BROWSER-8', order_line_id, 'confirmation', 1, 0.5, expected_qty, 0.5*expected_qty, 'U-OFFICE-A' FROM fulfillment_records WHERE id='F008';`);
  const client = createPostgresPoolClient({ pool });
  const services = createApiSharedServiceRegistry();
  const prepare = async () => {
    const w = { ...await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState() };
    w.printDeviceRepository = createPostgresPrintDeviceRepository({ postgresClient: client });
    w.fulfillmentActionTransactionRepository = createPostgresFulfillmentActionTransactionRepository({ postgresClient: client });
    w.printJobRepository = createPostgresPrintJobRepository({ postgresClient: client });
    Object.assign(w, await w.printJobRepository.loadState());
    return w;
  };

  // 不指定打印机：自提单走默认的浏览器打印针式机，任务排队等办公室确认。
  const printed = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", pickerName: "印刷工乙", idempotencyKey: "browser-note-print-1" } });
  assert.ok(printed.printJob, JSON.stringify(printed));
  assert.deepEqual([printed.printJob.printDeviceId, printed.printJob.driverMode, printed.printJob.jobStatus], ["PRN-DOT-A", "browser_download", "queued"]);
  const jobId = printed.printJob.printJobId;
  const recordId = printed.printRecord.printRecordId ?? printed.printRecord.id;
  assert.notEqual((await pool.query("SELECT status FROM print_records WHERE id=$1", [recordId])).rows[0].status, "printed", "not printed before the office confirms");

  const lifecycle = services.printJobLifecycleService;
  const unconfirmed = await lifecycle.confirmBrowserPrint({ workspace: await prepare(), printJobId: jobId, operatorId: "U-OFFICE-A", body: { idempotencyKey: "browser-confirm-0" } });
  assert.equal(unconfirmed.code, "PRINT_JOB_BROWSER_CONFIRMATION_REQUIRED");
  const confirmed = await lifecycle.confirmBrowserPrint({ workspace: await prepare(), printJobId: jobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: "browser-confirm-1" } });
  assert.ok(confirmed.printJob, JSON.stringify(confirmed));
  assert.equal(confirmed.printJob.jobStatus, "printed");
  const job = (await pool.query("SELECT job_status, metadata_json AS metadata FROM print_jobs WHERE id=$1", [jobId])).rows[0];
  assert.deepEqual([job.job_status, job.metadata.printConfirmationSource, job.metadata.browserPrintConfirmedBy], ["printed", "office_visual_check", "U-OFFICE-A"]);
  assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1", [recordId])).rows[0].status, "printed");
  const projected = services.fulfillmentReadProjectionService.listFulfillments({ workspace: await prepare(), searchParams: new URLSearchParams() }).items.find(item => item.fulfillmentId === "F001");
  assert.deepEqual([projected.printed, projected.paperOutboundDocument?.status], [true, "已打印待交库房"], "the office can hand the paper to the warehouse now");
  const paper = (await pool.query("SELECT id, document_version, revision FROM paper_outbound_documents WHERE print_record_id=$1", [recordId])).rows[0];
  const fulfillmentRevision = (await pool.query("SELECT revision FROM fulfillment_records WHERE id='F001'")).rows[0].revision;
  const handed = await services.fulfillmentActionCommandService.handoffPaperOutboundDocument({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { expectedRevision: fulfillmentRevision, paperOutboundDocumentId: paper.id, paperDocumentVersion: paper.document_version, paperDocumentRevision: paper.revision, idempotencyKey: "browser-handoff-1" } });
  assert.ok(!handed.code, JSON.stringify(handed));
  assert.equal((await pool.query("SELECT status FROM paper_outbound_documents WHERE id=$1", [paper.id])).rows[0].status, "已交库房");
  const again = await lifecycle.confirmBrowserPrint({ workspace: await prepare(), printJobId: jobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: "browser-confirm-2" } });
  assert.equal(again.alreadyConfirmed, true, "confirming twice changes nothing");

  // 程序回报的打印机：页面上不能确认已打印。
  const driverJob = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: "F008", operatorId: "U-OFFICE-A",
    body: { documentType: "delivery_note", printDeviceId: "PRINT-DRIVER-PAPER", idempotencyKey: "driver-note-print-1" } });
  assert.ok(driverJob.printJob, JSON.stringify(driverJob));
  {
    const refused = await lifecycle.confirmBrowserPrint({ workspace: await prepare(), printJobId: driverJob.printJob.printJobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: "driver-confirm-1" } });
    assert.equal(refused.code, "PRINT_JOB_NOT_BROWSER_PRINT");
  }

  // 同一个客户的几样货合成一张：明细都在，合计重新加；不同客户不能合。
  const template = printed.printTemplate;
  const second = structuredClone(template);
  second.fields.lineItems = second.fields.lineItems.map(item => ({ ...item, size: "45*37*10", color: "黑色", deliveredQtyText: "300", chargeableQtyText: "300", deliveredQty: 300, chargeableQty: 300, amount: 147, amountText: "147.00" }));
  second.fields.totalAmount = 147; second.fields.totalQuantity = 300; second.fields.documentNo = "PR-SECOND";
  const merged = mergeFulfillmentNoteTemplates([template, second], { customerIds: ["C001", "C001"] });
  assert.equal(merged.template.fields.lineItems.length, 2);
  assert.equal(merged.template.fields.totalAmount, Math.round((Number(template.fields.totalAmount) + 147) * 100) / 100);
  const text = await pdfText(await buildFulfillmentNotePdf(merged.template));
  assert.match(text, /45\*37\*10/u);
  assert.match(text, /印刷工乙/u);
  // 判断同一个客户只看客户编号：名字一样、编号不同也不能合；编号缺了不合；同客户地址联系人不同也不合。
  assert.equal(mergeFulfillmentNoteTemplates([template, second], { customerIds: ["C001", "C099"] }).error.code, "PRINT_NOTE_CUSTOMERS_DIFFER");
  assert.equal(mergeFulfillmentNoteTemplates([template, second]).error.code, "PRINT_NOTE_CUSTOMER_UNKNOWN");
  assert.equal(mergeFulfillmentNoteTemplates([template, second], { customerIds: ["C001", ""] }).error.code, "PRINT_NOTE_CUSTOMER_UNKNOWN");
  const elsewhere = structuredClone(second); elsewhere.fields.address = "另一个仓库地址";
  assert.equal(mergeFulfillmentNoteTemplates([template, elsewhere], { customerIds: ["C001", "C001"] }).error.code, "PRINT_NOTE_CONTACTS_DIFFER");

  // 走真实的 PDF 接口复现测试站发现的问题：两个客户同名（都叫「张三服饰」）、编号不同，不能合成一张。
  const callNotePdf = async (ids, extraJobs) => {
    const workspace = await prepare();
    workspace.printJobs = [...(workspace.printJobs ?? []), ...extraJobs];
    const out = { status: 0, body: null, headers: {} };
    const response = { writeHead(status, headers) { out.status = status; out.headers = headers; }, end(body) { out.body = body; } };
    await handlePrintReadRoutes({
      url: new URL(`http://test/api/print-jobs/note.pdf?ids=${ids.join(",")}`), response, workspace,
      permissionContext: {}, authContext: {}, writeActionPermissions: { printFulfillment: "print.fulfillment" },
      requireActionPermission: () => true, getPermissionOperatorId: () => "U-OFFICE-A",
      sendJson: (_res, status, body) => { out.status = status; out.body = body; }, sendNotFound: (_res, code) => { out.status = 404; out.body = { code }; },
      paginate: (items) => ({ items }), findPrintJob: services.printJobLifecycleService.findPrintJob ?? (async (w, id) => (w.printJobs ?? []).find(row => row.printJobId === id) ?? null),
      findPrintDevice: async () => null, printDriverDiagnosticsService: {},
    });
    return out;
  };
  const baseJob = (await prepare()).printJobs.find(row => row.printJobId === jobId);
  assert.ok(baseJob, "the queued note job is in the workspace");
  const sameNameJob = structuredClone(baseJob);
  sameNameJob.printJobId = "PJ-SAME-NAME"; sameNameJob.id = "PJ-SAME-NAME"; sameNameJob.targetId = "F-LIVE-EXPORT-001";
  sameNameJob.payload.printTemplate.fields.fulfillmentId = "F-LIVE-EXPORT-001";
  sameNameJob.payload.printTemplate.fields.documentNo = "PR-SAME-NAME";
  assert.equal(sameNameJob.payload.printTemplate.fields.customerName, baseJob.payload.printTemplate.fields.customerName, "same name on the note");
  const sameName = await callNotePdf([jobId, "PJ-SAME-NAME"], [sameNameJob]);
  assert.deepEqual([sameName.status, sameName.body?.code], [422, "PRINT_NOTE_CUSTOMERS_DIFFER"], "same name, different customer numbers: refused");
  const sameCustomerJob = structuredClone(baseJob);
  sameCustomerJob.printJobId = "PJ-SAME-CUSTOMER"; sameCustomerJob.id = "PJ-SAME-CUSTOMER";
  const sameCustomer = await callNotePdf([jobId, "PJ-SAME-CUSTOMER"], [sameCustomerJob]);
  assert.equal(sameCustomer.status, 200, JSON.stringify(sameCustomer.body));
  assert.equal(sameCustomer.headers["content-type"], "application/pdf");
  const single = await callNotePdf([jobId], []);
  assert.equal(single.status, 200, "one note prints on its own");

  console.log(`PASS browser note print PG (${migrations.length} migrations): dot-matrix browser device and note templates seeded, job waits for office confirmation, confirmation marks record printed and paper ready for the warehouse, driver printers refused, one customer's notes merged into one sheet; customers with the same name but different numbers are never merged (checked through the real PDF route).`);
} finally {
  await pool?.end().catch(() => {});
  spawnSync("docker", ["rm", "-f", name]);
}
