import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  createPaymentScreenshotAttachmentInput,
  createStatementCustomerConfirmationAttachmentInput,
} from "../src/services/officeAttachmentApiClient.js";
import {
  markStatementSent,
  recordStatementCustomerConfirmation,
  recordStatementSendReceipt,
  recordStatementExport,
  syncStatementCustomerConfirmationAttachments,
  syncStatementExportRecords,
  updateStatementCustomerConfirmationAttachmentPreview,
} from "../src/state/officeStatementActions.js";
import {
  buildStatementExcelWorkbook,
  buildStatementPreviewCsv,
  downloadOfficeStatementExport,
  getStatementTemplateId,
  handleOfficeStatementVariance,
  listOfficeStatementExports,
  mapStatementVarianceHandlingResult,
  markOfficeStatementSentViaApi,
  previewOfficeStatement,
  recordOfficeStatementCustomerConfirmation,
  recordOfficeStatementSendReceipt,
  recordOfficeStatementPayment,
  writeOffOfficeStatement,
} from "../src/services/officeStatementApiClient.js";
import { assertStatementXlsxWorkbook } from "./xlsxTestUtils.mjs";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const statement = {
  id: "ST-0629-002",
  customerId: "C002",
  period: "2026-06",
  receivable: 108000,
  received: 0,
  variance: 0,
  status: "待发送",
  lineIds: ["ORD-0629-010-01"],
};
const orderLines = [
  {
    id: "ORD-0629-010-01",
    orderNo: "ORD-0629-010",
    lineNo: "01",
    product: "白鲸活动袋",
    size: "35*27",
    color: "白色",
    handle: "普通提",
    style: "空白袋",
    print: "是",
    printSide: "single",
    printColor: "黑色",
    qty: 1500,
    amount: 108000,
    note: "白印黑",
    exceptions: [],
  },
];

assert(mapStatementVarianceHandlingResult("未收差额转欠款") === "carry_to_debt", "debt variance result was not mapped");
assert(mapStatementVarianceHandlingResult("抹零/减免已审批") === "approved_allowance", "allowance variance result was not mapped");
assert(mapStatementVarianceHandlingResult("账单有误待重算") === "bill_needs_recalc", "recalc variance result was not mapped");
assert(mapStatementVarianceHandlingResult("多笔付款待齐") === "waiting_more_payments", "waiting-payment variance result was not mapped");
assert(mapStatementVarianceHandlingResult("未知") === "other", "unknown variance result should map to other");
assert(getStatementTemplateId("customer_send") === "tpl-p0-statement-customer-send", "customer preview template id is incorrect");
assert(getStatementTemplateId("internal_archive") === "tpl-p0-statement-internal-archive", "internal preview template id is incorrect");

const previewCalls = [];
const previewResult = await previewOfficeStatement(
  {
    authState,
    statement,
    orderLines,
    customer: { id: "C002", name: "李四电商" },
    operatorId: "U-OFFICE-A",
    previewType: "internal_archive",
  },
  {
    fetchImpl: async (url, init) => {
      previewCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        statementId: statement.id,
        previewType: "internal_archive",
        templateId: "tpl-p0-statement-internal-archive",
        templateVersion: "p0-statement-xlsx-v1",
        summary: {
          receivable: 108000,
          received: 0,
          variance: 0,
          lineCount: 1,
        },
        lines: [
          {
            statementLineId: "ST-0629-002-001",
            orderLineId: "ORD-0629-010-01",
            orderNo: "ORD-0629-010",
            productName: "白鲸活动袋",
            goodsSpec: "白鲸活动袋 / 35*27 / 白色 / 单面 / 印黑色 / 1500个",
            billQty: 1500,
            unitPrice: 72,
            amount: 108000,
            adjustmentAmount: 0,
            finalAmount: 108000,
          },
        ],
        downloadToken: "DL-ST-0629-002-INTERNAL",
        operationLogId: "LOG-STATEMENT-PREVIEW-1",
      });
    },
  },
);

assert(previewResult.source === "api", "statement preview did not use the API response");
assert(previewCalls[0]?.url.endsWith("/api/statements/ST-0629-002/preview"), "statement preview API URL is incorrect");
assert(previewCalls[0]?.body.templateId === "tpl-p0-statement-internal-archive", "statement preview template id is incorrect");
assert(previewCalls[0]?.body.previewType === "internal_archive", "statement preview type is incorrect");
assert(previewResult.preview.downloadToken === "DL-ST-0629-002-INTERNAL", "statement preview download token was not mapped");
assert(previewResult.preview.templateVersion === "p0-statement-xlsx-v1", "statement preview template version was not mapped");
assert(previewResult.preview.lines[0].billQty === 1500, "statement preview line was not mapped");

const csv = buildStatementPreviewCsv(previewResult.preview, {
  statement,
  customer: { name: "李四电商" },
});
assert(csv.startsWith("\uFEFF"), "statement preview CSV should include a UTF-8 BOM for Excel");
assert(csv.includes("李四电商") && csv.includes("白鲸活动袋") && csv.includes("108000"), "statement preview CSV missed expected content");

const workbookBytes = buildStatementExcelWorkbook(previewResult.preview, {
  statement,
  customer: { name: "李四电商" },
});
assertStatementXlsxWorkbook(workbookBytes, {
  templateVersion: "p0-statement-xlsx-v1",
  customerName: "李四电商",
  productName: "白鲸活动袋",
  amount: 108000,
});

const exportCalls = [];
const exportResult = await downloadOfficeStatementExport(
  {
    authState,
    statement,
    preview: previewResult.preview,
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      exportCalls.push({ url, init });
      return createBinaryResponse(200, workbookBytes, {
        "content-disposition": "attachment; filename*=UTF-8''statement-ST-0629-002-%E6%9D%8E%E5%9B%9B%E7%94%B5%E5%95%86.xlsx",
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    },
  },
);

assert(exportResult.source === "api", "statement export file download did not use the API response");
assert(exportCalls[0]?.url.endsWith("/api/statements/ST-0629-002/exports/DL-ST-0629-002-INTERNAL"), "statement export file API URL is incorrect");
assert(exportCalls[0]?.init.method === "GET", "statement export file API method is incorrect");
assert(exportCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "statement export file API did not send seed user header");
assertStatementXlsxWorkbook(exportResult.workbookData, { customerName: "李四电商" });
assert(exportResult.fileName === "statement-ST-0629-002-李四电商.xlsx", "statement export filename was not parsed");

const historyDownloadCalls = [];
const historyDownloadResult = await downloadOfficeStatementExport(
  {
    authState,
    statement,
    exportRecord: {
      statementId: statement.id,
      downloadToken: "DL-ST-0629-002-HISTORY",
      fileName: "statement-ST-0629-002-历史留档.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    operatorId: "U-OFFICE-A",
    allowLocalFallback: false,
  },
  {
    fetchImpl: async (url, init) => {
      historyDownloadCalls.push({ url, init });
      return createBinaryResponse(200, workbookBytes, {
        "content-disposition": "attachment; filename*=UTF-8''statement-ST-0629-002-history.xlsx",
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    },
  },
);
assert(historyDownloadResult.source === "api", "statement history export download did not use API response");
assert(historyDownloadCalls[0]?.url.endsWith("/api/statements/ST-0629-002/exports/DL-ST-0629-002-HISTORY"), "statement history export download URL is incorrect");
assert(historyDownloadCalls[0]?.init.method === "GET", "statement history export download method is incorrect");
assert(historyDownloadResult.fileName === "statement-ST-0629-002-history.xlsx", "statement history export filename was not parsed");

const historyDownloadUnavailable = await downloadOfficeStatementExport(
  {
    authState,
    statement,
    exportRecord: { downloadToken: "DL-ST-0629-002-HISTORY" },
    operatorId: "U-OFFICE-A",
    allowLocalFallback: false,
  },
  {
    fetchImpl: async () => {
      throw new Error("network down");
    },
  },
);
assert(historyDownloadUnavailable.source === "api_unavailable", "history export download should not silently regenerate local files");

const missingTokenExport = await downloadOfficeStatementExport({
  authState,
  statement,
  preview: { ...previewResult.preview, downloadToken: "" },
  operatorId: "U-OFFICE-A",
});
assert(missingTokenExport.source === "local_fallback", "missing statement export token should fall back locally");

const deniedExport = await downloadOfficeStatementExport(
  {
    authState,
    statement,
    preview: previewResult.preview,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: statement.preview",
        requiredPermission: "statement.preview",
      }),
  },
);
assert(deniedExport.blocked === true, "statement export permission denial should block local fallback");
assert(deniedExport.error.requiredPermission === "statement.preview", "statement export permission denial was not surfaced");

const exportListCalls = [];
const customerSendFileName = "statement-ST-0629-002-李四电商-客户发送版.xlsx";
const exportListResult = await listOfficeStatementExports(
  {
    authState,
    statement,
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      exportListCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            statementId: statement.id,
            previewType: "internal_archive",
            downloadToken: previewResult.preview.downloadToken,
            operationLogId: "LOG-STATEMENT-PREVIEW-1",
            fileName: exportResult.fileName,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            createdAt: "2026-07-01T10:30:00.000Z",
            templateId: "tpl-p0-statement-internal-archive",
            templateVersion: "p0-statement-xlsx-v1",
            workbookFormat: "XLSX Office Open XML",
            worksheetNames: ["对账汇总", "交付明细"],
            storageProvider: "local_fs",
            storageKeyStored: true,
            contentDigest: "sha256:statement-internal-digest",
            contentLength: 4096,
          },
          {
            statementId: statement.id,
            previewType: "customer_send",
            downloadToken: "DL-ST-0629-002-CUSTOMER",
            operationLogId: "LOG-STATEMENT-PREVIEW-CUSTOMER",
            fileName: customerSendFileName,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            createdAt: "2026-07-01T10:20:00.000Z",
            templateId: "tpl-p0-statement-customer-send",
            templateVersion: "p0-statement-xlsx-v1",
            workbookFormat: "XLSX Office Open XML",
            worksheetNames: ["对账汇总", "交付明细"],
            storageProvider: "local_fs",
            storageKeyStored: true,
            contentDigest: "sha256:statement-customer-digest",
            contentLength: 4096,
          },
        ],
        total: 2,
      });
    },
  },
);
assert(exportListResult.source === "api", "statement export list did not use the API response");
assert(exportListCalls[0]?.url.endsWith("/api/statements/ST-0629-002/exports"), "statement export list API URL is incorrect");
assert(exportListCalls[0]?.init.method === "GET", "statement export list API method is incorrect");
assert(exportListResult.total === 2, "statement export list total was not mapped");
assert(exportListResult.items[0].fileName === exportResult.fileName, "statement export list filename was not mapped");
assert(exportListResult.items[0].templateVersion === "p0-statement-xlsx-v1", "statement export template version was not mapped");
assert(exportListResult.items[0].worksheetNames.includes("交付明细"), "statement export worksheet names were not mapped");
assert(exportListResult.items[0].storageProvider === "local_fs", "statement export storage provider was not mapped");
assert(exportListResult.items[0].storageKeyStored === true, "statement export storage key flag was not mapped");
assert(exportListResult.items[0].contentDigest.startsWith("sha256:"), "statement export content digest was not mapped");
assert(exportListResult.items[0].contentLength === 4096, "statement export content length was not mapped");

const syncedStatements = syncStatementExportRecords([statement], statement, exportListResult.items);
assert(syncedStatements[0].exportRecords.length === 2, "statement export records were not stored");
assert(syncedStatements[0].exportArchiveStatus.includes("已生成 2 版"), "statement export archive status was not derived from list");
assert(syncedStatements[0].lastExportToken === previewResult.preview.downloadToken, "statement export token was not stored from list");
assert(syncedStatements[0].exportRecords[0].templateVersion === "p0-statement-xlsx-v1", "statement export template metadata was not stored");

const deniedExportList = await listOfficeStatementExports(
  {
    authState,
    statement,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: statement.preview",
        requiredPermission: "statement.preview",
      }),
  },
);
assert(deniedExportList.blocked === true, "statement export list permission denial should block local fallback");
assert(deniedExportList.error.requiredPermission === "statement.preview", "statement export list permission denial was not surfaced");

const exportedStatements = recordStatementExport([statement], statement, {
  fileName: exportResult.fileName,
  source: "后端 API 文件",
  downloadToken: previewResult.preview.downloadToken,
  previewType: previewResult.preview.previewType,
});
assert(exportedStatements[0].exportVersionCount === 1, "statement export version count was not recorded");
assert(exportedStatements[0].exportArchiveStatus.includes("statement-ST-0629-002-李四电商.xlsx"), "statement export filename was not surfaced in state");
assert(exportedStatements[0].lastExportSource === "后端 API 文件", "statement export source was not recorded");

const sentCalls = [];
const sentResult = await markOfficeStatementSentViaApi(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.statement-check" },
    },
    statement,
    operatorId: "U-OFFICE-A",
    channel: "wechat",
    sentTo: "李四电商财务",
    remark: "API client check send",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      sentCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        statementId: statement.id,
        status: "已发送",
        sendRecordId: "SEND-ST-0629-002",
        operationLogId: "LOG-STATEMENT-SEND-1",
      });
    },
  },
);

assert(sentResult.source === "api", "statement send did not use the API response");
assert(sentCalls[0]?.url === "http://127.0.0.1:8787/api/statements/ST-0629-002/mark-sent", "statement send API URL is incorrect");
assert(sentCalls[0]?.init.method === "POST", "statement send API method is incorrect");
assert(sentCalls[0]?.init.headers.authorization === "Bearer seed-session.statement-check", "statement send did not use bearer auth");
assert(sentCalls[0]?.body.channel === "wechat", "statement send request channel is incorrect");
assert(sentCalls[0]?.body.operatorId === "U-OFFICE-A", "statement send request missed operatorId");
assert(sentResult.sendRecordId === "SEND-ST-0629-002" && sentResult.operationLogId === "LOG-STATEMENT-SEND-1", "statement send response was not mapped");

const sentStatements = markStatementSent(syncedStatements, statement.id, {
  sendRecordId: sentResult.sendRecordId,
  channel: "微信",
  sentTo: "李四电商财务",
  operatorName: "办公室A",
});
assert(sentStatements[0].sendRecordId === "SEND-ST-0629-002", "statement send record id was not stored");
assert(sentStatements[0].sendChannel === "微信", "statement send channel was not stored");
assert(sentStatements[0].sendRecipient === "李四电商财务", "statement send recipient was not stored");
assert(sentStatements[0].sendExportFileName === customerSendFileName, "statement send archive did not link the customer export file");
assert(sentStatements[0].sendArchiveStatus.includes(customerSendFileName), "statement send archive status did not surface the export file");

const fallbackSentStatements = markStatementSent(syncedStatements, statement.id, {
  channel: "微信",
  sentTo: "李四电商财务",
  operatorName: "办公室A",
});
assert(fallbackSentStatements[0].sendRecordId === "SEND-LOCAL-ST-0629-002", "local statement send should create a fallback send record id");

const receiptCalls = [];
const receiptResult = await recordOfficeStatementSendReceipt(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.statement-check" },
    },
    statement: sentStatements[0],
    operatorId: "U-OFFICE-A",
    receiptStatus: "read",
    remark: "客户微信已读",
  },
  {
    fetchImpl: async (url, init) => {
      receiptCalls.push({ url, init, body: JSON.parse(init.body) });
      assert(url.endsWith("/api/statements/ST-0629-002/send-receipt"), "statement send receipt API URL is incorrect");
      const body = receiptCalls[0].body;
      assert(body.sendRecordId === "SEND-ST-0629-002", "statement send receipt request missed sendRecordId");
      assert(body.receiptStatus === "read", "statement send receipt request status is incorrect");
      return createJsonResponse(200, {
        statementId: statement.id,
        status: "已发送",
        sendRecordId: "SEND-ST-0629-002",
        receiptStatus: "read",
        receiptAt: "2026-07-01T11:00:00.000Z",
        operationLogId: "LOG-STATEMENT-RECEIPT-1",
      });
    },
  },
);
assert(receiptResult.source === "api", "statement send receipt did not use the API response");
assert(receiptCalls[0]?.init.method === "POST", "statement send receipt API method is incorrect");
assert(receiptCalls[0]?.init.headers.authorization === "Bearer seed-session.statement-check", "statement send receipt did not use bearer auth");
assert(receiptResult.receiptStatus === "read" && receiptResult.operationLogId === "LOG-STATEMENT-RECEIPT-1", "statement send receipt response was not mapped");

const receiptStatements = recordStatementSendReceipt(sentStatements, statement.id, {
  receiptStatus: receiptResult.receiptStatus,
  receiptAt: receiptResult.receiptAt,
  operatorName: "办公室A",
  remark: "客户微信已读",
});
assert(receiptStatements[0].sendReceiptStatus === "客户已读", "statement send receipt status was not stored");
assert(receiptStatements[0].sendReceiptNote === "客户微信已读", "statement send receipt note was not stored");
assert(receiptStatements[0].sendArchiveStatus.includes("客户已读"), "statement send archive status did not include receipt");
const repeatedReceiptStatements = recordStatementSendReceipt(receiptStatements, statement.id, {
  receiptStatus: "read",
  operatorName: "办公室A",
});
assert(
  repeatedReceiptStatements[0].sendArchiveStatus.split("客户已读").length === 2,
  "statement send receipt archive status should not duplicate the same receipt label",
);

const confirmationCalls = [];
const confirmationResult = await recordOfficeStatementCustomerConfirmation(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.statement-check" },
    },
    statement: receiptStatements[0],
    operatorId: "U-OFFICE-A",
    channel: "wechat",
    confirmedByCustomer: "李四电商财务",
    content: "客户回复确认无误",
    attachmentIds: ["ATT-CHAT-CONFIRM-1"],
    remark: "客户微信确认",
  },
  {
    fetchImpl: async (url, init) => {
      confirmationCalls.push({ url, init, body: JSON.parse(init.body) });
      assert(url.endsWith("/api/statements/ST-0629-002/customer-confirmation"), "statement customer confirmation API URL is incorrect");
      const body = confirmationCalls[0].body;
      assert(body.sendRecordId === "SEND-ST-0629-002", "statement customer confirmation request missed sendRecordId");
      assert(body.content === "客户回复确认无误", "statement customer confirmation request content is incorrect");
      assert(body.attachmentIds?.[0] === "ATT-CHAT-CONFIRM-1", "statement customer confirmation request missed attachment ids");
      return createJsonResponse(200, {
        statementId: statement.id,
        status: "客户已确认",
        sendRecordId: "SEND-ST-0629-002",
        receiptStatus: "confirmed",
        confirmationRecordId: "SCONF-ST-0629-002",
        confirmationRecord: {
          confirmationRecordId: "SCONF-ST-0629-002",
          statementId: statement.id,
          sendRecordId: "SEND-ST-0629-002",
          confirmationType: "customer_reply",
          channel: "wechat",
          confirmedByCustomer: "李四电商财务",
          confirmedAt: "2026-07-01T11:10:00.000Z",
          content: "客户回复确认无误",
          attachmentIds: ["ATT-CHAT-CONFIRM-1"],
          recordedBy: "U-OFFICE-A",
          operationLogId: "LOG-STATEMENT-CONFIRM-1",
        },
        operationLogId: "LOG-STATEMENT-CONFIRM-1",
      });
    },
  },
);
assert(confirmationResult.source === "api", "statement customer confirmation did not use the API response");
assert(confirmationCalls[0]?.init.method === "POST", "statement customer confirmation API method is incorrect");
assert(confirmationCalls[0]?.init.headers.authorization === "Bearer seed-session.statement-check", "statement customer confirmation did not use bearer auth");
assert(confirmationResult.receiptStatus === "confirmed", "statement customer confirmation receipt status was not mapped");
assert(confirmationResult.confirmationRecordId === "SCONF-ST-0629-002", "statement customer confirmation record id was not mapped");

const confirmedStatements = recordStatementCustomerConfirmation(receiptStatements, statement.id, {
  confirmationRecordId: confirmationResult.confirmationRecordId,
  channel: "微信",
  confirmedByCustomer: confirmationResult.confirmationRecord.confirmedByCustomer,
  confirmedAt: confirmationResult.confirmationRecord.confirmedAt,
  content: confirmationResult.confirmationRecord.content,
  attachmentIds: confirmationResult.confirmationRecord.attachmentIds,
  attachmentFiles: [
    {
      attachmentId: "ATT-CHAT-CONFIRM-1",
      ownerType: "statement",
      ownerId: statement.id,
      purpose: "statement_customer_confirmation",
      fileName: "customer-confirmation-chat.png",
      mimeType: "image/png",
      fileSize: 2048,
      hasContent: true,
    },
  ],
  operatorName: "办公室A",
});
assert(confirmedStatements[0].status === "客户已确认", "statement customer confirmation status was not stored");
assert(confirmedStatements[0].sendReceiptStatus === "客户已确认", "statement customer confirmation did not upgrade receipt status");
assert(confirmedStatements[0].customerConfirmationContent === "客户回复确认无误", "statement customer confirmation content was not stored");
assert(confirmedStatements[0].customerConfirmationAttachmentIds[0] === "ATT-CHAT-CONFIRM-1", "statement customer confirmation attachment ids were not stored");
assert(
  confirmedStatements[0].customerConfirmationAttachmentFiles?.[0]?.fileName === "customer-confirmation-chat.png",
  "statement customer confirmation attachment files were not stored",
);
assert(confirmedStatements[0].sendArchiveStatus.includes("客户确认"), "statement send archive status did not include customer confirmation");

const customerConfirmationAttachmentInput = createStatementCustomerConfirmationAttachmentInput({
  statement,
  operatorId: "U-OFFICE-A",
  remark: "客户确认截图",
  file: {
    name: "wechat-confirm.png",
    type: "image/png",
    size: 4096,
    contentDataUrl: "data:image/png;base64,Y29uZmlybQ==",
  },
});
assert(
  customerConfirmationAttachmentInput.purpose === "statement_customer_confirmation" &&
    customerConfirmationAttachmentInput.ownerType === "statement" &&
    customerConfirmationAttachmentInput.ownerId === statement.id &&
    customerConfirmationAttachmentInput.fileType === "image" &&
    customerConfirmationAttachmentInput.contentDataUrl.includes("base64"),
  "statement customer confirmation attachment input was not built correctly",
);

const customerConfirmationPdfAttachmentInput = createStatementCustomerConfirmationAttachmentInput({
  statement,
  operatorId: "U-OFFICE-A",
  remark: "客户确认 PDF",
  file: {
    name: "wechat-confirm.pdf",
    type: "application/pdf",
    size: 8192,
    contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
  },
});
assert(
  customerConfirmationPdfAttachmentInput.fileType === "pdf" &&
    customerConfirmationPdfAttachmentInput.mimeType === "application/pdf" &&
    customerConfirmationPdfAttachmentInput.contentDataUrl.startsWith("data:application/pdf"),
  "statement customer confirmation PDF attachment input was not mapped as a PDF",
);

const paymentSpreadsheetAttachmentInput = createPaymentScreenshotAttachmentInput({
  statement,
  operatorId: "U-FINANCE-A",
  remark: "付款表格附件",
  file: {
    name: "payment-confirm.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 12000,
    contentDataUrl: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBA==",
  },
});
assert(
  paymentSpreadsheetAttachmentInput.fileType === "spreadsheet" &&
    paymentSpreadsheetAttachmentInput.contentDataUrl.includes("spreadsheetml.sheet"),
  "payment non-image attachment input was not mapped as a spreadsheet",
);

const syncedConfirmationAttachments = syncStatementCustomerConfirmationAttachments(confirmedStatements, statement.id, [
  {
    attachmentId: "ATT-CHAT-CONFIRM-2",
    ownerType: "statement",
    ownerId: statement.id,
    purpose: "statement_customer_confirmation",
    fileName: "wechat-confirm-2.png",
    mimeType: "image/png",
    hasContent: true,
  },
]);
assert(
  syncedConfirmationAttachments[0].customerConfirmationAttachmentIds.includes("ATT-CHAT-CONFIRM-2"),
  "statement customer confirmation attachment sync did not add the attachment id",
);
const previewedConfirmationAttachments = updateStatementCustomerConfirmationAttachmentPreview(
  syncedConfirmationAttachments,
  statement.id,
  "ATT-CHAT-CONFIRM-2",
  {
    previewDataUrl: "data:image/png;base64,cHJldmlldw==",
    previewStatus: "已加载预览",
  },
);
assert(
  previewedConfirmationAttachments[0].customerConfirmationAttachmentFiles.find((file) => file.attachmentId === "ATT-CHAT-CONFIRM-2")?.previewStatus === "已加载预览",
  "statement customer confirmation attachment preview was not stored",
);
const previewedPdfConfirmationAttachments = updateStatementCustomerConfirmationAttachmentPreview(
  syncedConfirmationAttachments,
  statement.id,
  "ATT-CHAT-CONFIRM-2",
  {
    previewDataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
    previewStatus: "已读取内容，可下载原文件",
    contentType: "application/pdf",
  },
);
assert(
  previewedPdfConfirmationAttachments[0].customerConfirmationAttachmentFiles.find((file) => file.attachmentId === "ATT-CHAT-CONFIRM-2")?.contentType === "application/pdf",
  "statement customer confirmation non-image preview metadata was not stored",
);

const paymentCalls = [];
const paymentResult = await recordOfficeStatementPayment(
  {
    authState,
    statement,
    amount: 80000,
    reason: "客户少付，差额待确认",
    operatorId: "U-FINANCE-A",
    method: "bank_transfer",
    attachmentIds: ["ATT-PAYMENT-SCREENSHOT-1"],
  },
  {
    fetchImpl: async (url, init) => {
      paymentCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        payment: {
          paymentRecordId: "PAY-ST-0629-002",
          statementId: statement.id,
          amount: 80000,
          paidAt: "2026-07-01T00:00:00.000Z",
          method: "bank_transfer",
          status: "recorded",
          attachmentIds: ["ATT-PAYMENT-SCREENSHOT-1"],
        },
        statementStatus: "差额待确认",
        varianceAmount: 28000,
        todoId: "T-PAYMENT-VARIANCE-1",
        operationLogId: "LOG-STATEMENT-PAYMENT-1",
      });
    },
  },
);

assert(paymentCalls[0]?.url.endsWith("/api/statements/ST-0629-002/payments"), "payment API URL is incorrect");
assert(paymentCalls[0]?.init.headers["x-erp-user-id"] === "U-FINANCE-A", "payment API did not send seed user header");
assert(paymentCalls[0]?.body.amount === 80000, "payment request amount is incorrect");
assert(paymentCalls[0]?.body.method === "bank_transfer", "payment request method is incorrect");
assert(paymentCalls[0]?.body.remark === "客户少付，差额待确认", "payment request remark is incorrect");
assert(paymentCalls[0]?.body.attachmentIds?.[0] === "ATT-PAYMENT-SCREENSHOT-1", "payment request missed attachment ids");
assert(paymentResult.payment.paymentRecordId === "PAY-ST-0629-002" && paymentResult.varianceAmount === 28000, "payment response was not mapped");

const varianceCalls = [];
const varianceResult = await handleOfficeStatementVariance(
  {
    authState,
    statement: { ...statement, received: 80000, variance: 28000, status: "差额待确认" },
    varianceAmount: 28000,
    reason: "未收差额转欠款",
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async (url, init) => {
      varianceCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        varianceRecord: {
          varianceRecordId: "VAR-ST-0629-002",
          statementId: statement.id,
          amount: 28000,
          handlingResult: "carry_to_debt",
          reason: "未收差额转欠款",
        },
        statementStatus: "有欠款",
        debtAmount: 28000,
        operationLogId: "LOG-STATEMENT-VARIANCE-1",
      });
    },
  },
);

assert(varianceCalls[0]?.url.endsWith("/api/statements/ST-0629-002/variance"), "variance API URL is incorrect");
assert(varianceCalls[0]?.body.handlingResult === "carry_to_debt", "variance request handling result is incorrect");
assert(varianceCalls[0]?.body.varianceAmount === 28000, "variance request amount is incorrect");
assert(varianceResult.varianceRecord.varianceRecordId === "VAR-ST-0629-002" && varianceResult.debtAmount === 28000, "variance response was not mapped");

const writeOffCalls = [];
const writeOffResult = await writeOffOfficeStatement(
  {
    authState,
    statement: { ...statement, received: 80000, variance: 28000, varianceHandling: "未收差额转欠款", status: "有欠款" },
    operatorId: "U-FINANCE-A",
    confirmReason: "API client check write-off",
  },
  {
    fetchImpl: async (url, init) => {
      writeOffCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        statementId: statement.id,
        status: "已确认欠款",
        receivable: 108000,
        received: 80000,
        variance: 28000,
        debtAmount: 28000,
        operationLogId: "LOG-STATEMENT-WRITEOFF-1",
      });
    },
  },
);

assert(writeOffCalls[0]?.url.endsWith("/api/statements/ST-0629-002/write-off"), "write-off API URL is incorrect");
assert(writeOffCalls[0]?.body.confirmReason === "API client check write-off", "write-off request reason is incorrect");
assert(writeOffResult.status === "已确认欠款" && writeOffResult.debtAmount === 28000, "write-off response was not mapped");

const deniedResult = await recordOfficeStatementPayment(
  {
    authState,
    statement,
    amount: 100,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: statement.payment.record",
        requiredPermission: "statement.payment.record",
      }),
  },
);

assert(deniedResult.blocked === true, "statement API permission denial should block local fallback");
assert(deniedResult.error.requiredPermission === "statement.payment.record", "statement permission denial was not surfaced");

const fallbackResult = await writeOffOfficeStatement(
  {
    authState,
    statement,
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "statement network failure should fall back locally");

const previewFallback = await previewOfficeStatement(
  {
    authState,
    statement,
    orderLines,
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("preview api offline");
    },
  },
);

assert(previewFallback.source === "local_fallback", "statement preview network failure should fall back locally");
assert(previewFallback.preview.lines.length === 1, "local statement preview fallback should keep statement lines");

const strictWriteChecks = [
  {
    name: "statement send",
    expectedCode: "STATEMENT_MARK_SENT_API_UNAVAILABLE",
    invoke: () => markOfficeStatementSentViaApi({ authState, statement, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "send receipt",
    expectedCode: "STATEMENT_SEND_RECEIPT_API_UNAVAILABLE",
    invoke: () => recordOfficeStatementSendReceipt({ authState, statement, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "customer confirmation",
    expectedCode: "STATEMENT_CUSTOMER_CONFIRMATION_API_UNAVAILABLE",
    invoke: () => recordOfficeStatementCustomerConfirmation({ authState, statement, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "payment",
    expectedCode: "STATEMENT_PAYMENT_API_UNAVAILABLE",
    invoke: () => recordOfficeStatementPayment({ authState, statement, amount: 100, operatorId: "U-FINANCE-A" }, strictOfflineOptions()),
  },
  {
    name: "variance",
    expectedCode: "STATEMENT_VARIANCE_API_UNAVAILABLE",
    invoke: () => handleOfficeStatementVariance({ authState, statement, varianceAmount: 10, reason: "其他", operatorId: "U-FINANCE-A" }, strictOfflineOptions()),
  },
  {
    name: "write-off",
    expectedCode: "STATEMENT_WRITE_OFF_API_UNAVAILABLE",
    invoke: () => writeOffOfficeStatement({ authState, statement, operatorId: "U-FINANCE-A" }, strictOfflineOptions()),
  },
  {
    name: "preview",
    expectedCode: "STATEMENT_PREVIEW_API_UNAVAILABLE",
    invoke: () => previewOfficeStatement({ authState, statement, orderLines, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
];

for (const check of strictWriteChecks) {
  const result = await check.invoke();
  assert(result.blocked === true, `strict ${check.name} must not use the local projection`);
  assert(result.source === "api_error", `strict ${check.name} should report an API error`);
  assert(result.error?.code === check.expectedCode, `strict ${check.name} reported the wrong API error`);
}

console.log("Frontend statement API client check passed: preview/export file/history download, send/receipt/customer confirmation, payment, variance, write-off, denial blocking, and local fallback are covered.");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

function createBinaryResponse(status, body, headers = {}) {
  const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body ?? ""));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? "";
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(bytes));
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
