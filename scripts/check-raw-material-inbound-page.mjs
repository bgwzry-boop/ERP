import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeRawMaterialOcrAngle,
  orientRawMaterialOcrSourceBounds,
  resolveRawMaterialOcrSourceFrame,
  shouldRotateRawMaterialSourcePreview,
  tightenRawMaterialOcrSourceRowBounds,
} from "../shared/rawMaterialOcrSourceCrop.js";
import { resolveOfficeWorkbenchNavigation } from "../src/app/useOfficeWorkbenchNavigation.js";
import { updateOfficeRawMaterialPurchaseRequestStatus } from "../src/services/officeRawMaterialApiClient.js";
import { getRolePermissionSet } from "../shared/auth/roleCatalog.js";

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
const rawMaterialControllerSource = readFileSync(new URL("../src/app/createOfficeRawMaterialActions.js", import.meta.url), "utf8");
const rawMaterialLocalActionsSource = readFileSync(new URL("../src/domain/rawMaterialInboundLocalActions.js", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const fixturesSource = readFileSync(new URL("../src/data/fixtures.js", import.meta.url), "utf8");
const roleToolReadsSource = readFileSync(new URL("../src/app/useOfficeRoleToolReads.js", import.meta.url), "utf8");
const officePageEntrySource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const rawMaterialInboundPageSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundPage.jsx", import.meta.url), "utf8");
const rawMaterialPageSource = [
  rawMaterialInboundPageSource,
  readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundReceivingSections.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundSupportingSections.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/rawMaterialInboundOcrDraft.js", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/RawMaterialSupplierStatementReview.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/rawMaterialInboundWorkflow.js", import.meta.url), "utf8"),
].join("\n");
const rawMaterialWorkbenchSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundWorkbench.jsx", import.meta.url), "utf8");
const rawMaterialRouteSource = readFileSync(new URL("../src/app/routes/RawMaterialRoute.jsx", import.meta.url), "utf8");
const rawMaterialMobileSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialMobileReceiving.jsx", import.meta.url), "utf8");
const rawMaterialMobileOcrReviewSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialMobileOcrReview.jsx", import.meta.url), "utf8");
const rawMaterialPurchaseSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialPurchasePanel.jsx", import.meta.url), "utf8");
const officePageSource = `${officePageEntrySource}\n${rawMaterialPageSource}\n${rawMaterialWorkbenchSource}\n${rawMaterialMobileSource}\n${rawMaterialMobileOcrReviewSource}`;
const rawMaterialListStateSource = readFileSync(new URL("../src/domain/rawMaterialInboundListState.js", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const roleToolStyleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");
const rawMaterialBaseStyleSource = readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8");
const rawMaterialMobileStyleSource = readFileSync(new URL("../src/styles/features/raw-material-mobile.css", import.meta.url), "utf8");
const rawMaterialMobileAtlasStyleSource = readFileSync(new URL("../src/styles/features/raw-material-mobile-atlas.css", import.meta.url), "utf8");
const rawMaterialPrintStyleSource = readFileSync(new URL("../src/styles/features/raw-material-print.css", import.meta.url), "utf8");
const rawMaterialStyleSource = [
  rawMaterialBaseStyleSource,
  rawMaterialMobileStyleSource,
  rawMaterialMobileAtlasStyleSource,
  rawMaterialPrintStyleSource,
  readFileSync(new URL("../src/styles/features/raw-material-color-mapping.css", import.meta.url), "utf8"),
].join("\n");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styleSource = `${roleToolStyleSource}\n${rawMaterialStyleSource}`;

let purchaseStatusRequest;
const purchaseStatusResult = await updateOfficeRawMaterialPurchaseRequestStatus({
  operatorId: "U-MANAGER-A",
  requestId: "RMP-001",
  expectedRevision: 7,
  idempotencyKey: "purchase-status-001",
  status: "approved",
  reason: "负责人已批准",
}, {
  apiBaseUrl: "http://erp.test/api",
  fetchImpl: async (url, init) => {
    purchaseStatusRequest = { url, init };
    return new Response(JSON.stringify({ purchaseRequest: { requestId: "RMP-001", status: "approved" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
assert.equal(purchaseStatusResult.source, "api");
assert.equal(purchaseStatusRequest.url, "http://erp.test/api/raw-material-purchase-requests/RMP-001/status");
assert.equal(purchaseStatusRequest.init.method, "POST");
assert.equal(purchaseStatusRequest.init.headers["idempotency-key"], "purchase-status-001");
assert.deepEqual(JSON.parse(purchaseStatusRequest.init.body), {
  expectedRevision: 7,
  idempotencyKey: "purchase-status-001",
  status: "approved",
  reason: "负责人已批准",
});

assertIncludes(fixturesSource, "initialRawMaterialInbounds", "fixtures should seed raw-material inbound records");
assertIncludes(fixturesSource, "已识别待复核", "fixtures should include OCR review state");
assertIncludes(fixturesSource, "已打印待贴标", "fixtures should include printed-but-not-attached state");
assertIncludes(fixturesSource, "已贴标/可用库存", "fixtures should include attached and usable state");
assertIncludes(fixturesSource, "白侯模板月结时需拆重1-重5", "fixtures should preserve supplier statement matching notes");
assertIncludes(fixturesSource, "北陈月结 Excel 用批号强匹配", "fixtures should preserve batch matching notes");
assertIncludes(fixturesSource, "供应商单号未提供", "fixtures should cover suppliers without delivery-note numbers");

assertIncludes(navigationSource, 'key: "rawMaterials"', "navigation should expose the raw-material page");
assertIncludes(navigationSource, 'label: "原材料"', "navigation should label the raw-material page");
assertIncludes(navigationSource, 'if (defaultRole === "office") return "rawMaterials";', "office phones should enter the existing raw-material mobile flow instead of a compressed PC table");
assertIncludes(rawMaterialRouteSource, "<RawMaterialInboundPage", "raw-material route should render the inbound page");
const officePermissionContext = {
  ...getRolePermissionSet(["office"]),
  user: { defaultRole: "office", userId: "U-OFFICE-A" },
};
assert.equal(
  resolveOfficeWorkbenchNavigation({
    activePage: "orders",
    mobileViewport: true,
    permissionContext: officePermissionContext,
  }).renderedPage,
  "rawMaterials",
  "office phones should reuse the raw-material business route",
);
assertIncludes(rawMaterialRouteSource, "onDeliveryNoteRecognize={actions.onDeliveryNoteRecognize}", "desktop and phone raw-material entry should share the formal server OCR action through the route adapter");
assertIncludes(roleToolReadsSource, "listOfficeRawMaterialInbounds", "role-tool reads should refresh raw-material inbounds through API client");
assertIncludes(roleToolReadsSource, "listOfficeRawMaterialSupplierStatementReviews", "role-tool reads should refresh supplier statement review drafts through API client");
assertIncludes(rawMaterialControllerSource, "updateOfficeRawMaterialInboundAction", "raw-material controller should submit actions through API client");
assertIncludes(rawMaterialControllerSource, "recognizeOfficeRawMaterialDeliveryNote", "raw-material controller should submit delivery-note OCR through API client");
assertIncludes(rawMaterialControllerSource, "createOfficeRawMaterialSupplierStatementReviewDraft", "raw-material controller should save supplier statement review drafts through API client");
assertIncludes(rawMaterialControllerSource, "confirmOfficeRawMaterialSupplierStatementReview", "raw-material controller should confirm supplier statement review drafts through API client");
assertIncludes(rawMaterialControllerSource, "confirmOfficeRawMaterialSupplierStatement", "raw-material controller should confirm reviewed supplier statements through API client");
assertIncludes(rawMaterialControllerSource, "generateOfficeRawMaterialSupplierPayableDraft", "raw-material controller should generate supplier payable drafts through API client");
assertIncludes(rawMaterialControllerSource, "confirmOfficeRawMaterialSupplierPayment", "raw-material controller should confirm supplier payments through API client");
assertIncludes(rawMaterialControllerSource, "生产/正式后端模式禁止本地降级", "production raw-material actions should fail closed when the API is unavailable");
assertIncludes(rawMaterialLocalActionsSource, "打印只是待贴标状态，不能直接作为可用库存", "print action must not imply available inventory");
assertIncludes(rawMaterialLocalActionsSource, "贴标确认必须逐卷/逐件进行", "attach action should be required before availability");
assertIncludes(rawMaterialLocalActionsSource, "机边领料", "raw-material projection should support machine-side issue actions");
assertIncludes(rawMaterialLocalActionsSource, "不生成成品数量或成本分摊", "machine-side issue should not imply finished output or cost allocation");
assertIncludes(rawMaterialLocalActionsSource, "拆卷领料", "raw-material projection should support split-roll partial issue");
assertIncludes(rawMaterialLocalActionsSource, "部分消耗", "raw-material projection should support partial consumption");
assertIncludes(rawMaterialLocalActionsSource, "rawMaterialSplitRecords", "raw-material projection should preserve split-roll trace records");
assertIncludes(rawMaterialLocalActionsSource, "确认消耗", "raw-material projection should support consumption confirmation actions");
assertIncludes(rawMaterialLocalActionsSource, "余料退回", "raw-material projection should support leftover return actions");
assertIncludes(rawMaterialLocalActionsSource, "不自动变可用库存", "leftover return should not imply available inventory");
assertIncludes(rawMaterialLocalActionsSource, "复核余料可用", "raw-material projection should support leftover review actions");
assertIncludes(rawMaterialLocalActionsSource, "转回可用库存", "leftover review should restore available inventory only after review");
assertIncludes(rawMaterialLocalActionsSource, "供应商未提供单号", "raw-material toasts should fall back when supplier note number is missing");

assertIncludes(officePageSource, "export function RawMaterialInboundPage", "office pages should export RawMaterialInboundPage");
assertIncludes(rawMaterialWorkbenchSource, "RawMaterialInboundListPane", "raw-material list composition should live outside the main page");
assertIncludes(rawMaterialWorkbenchSource, "RawMaterialDetailOverview", "raw-material fixed detail facts should live outside the main page");
assertIncludes(rawMaterialInboundPageSource, "RawMaterialInboundReceivingSections", "raw-material receiving actions should live outside the main page");
assertIncludes(rawMaterialInboundPageSource, "RawMaterialInboundSupportingSections", "raw-material cost, traceability and statement sections should live outside the main page");
assert.ok(rawMaterialInboundPageSource.split("\n").length <= 900, "raw-material main page should remain a compact composition layer");
assertIncludes(rawMaterialWorkbenchSource, "raw-material-view-tabs", "raw-material views should expose count-bearing tabs");
assertIncludes(rawMaterialWorkbenchSource, "buildRawMaterialInboundViewItems(inbounds)", "raw-material view counts should use the tested list-state projection");
assertIncludes(rawMaterialPageSource, "raw-material-detail-scroll", "raw-material detail actions should scroll independently");
assertIncludes(officePageSource, "OCR 仅预填", "page should clearly label OCR as prefill only");
assertIncludes(officePageSource, "直接拍照", "page should expose a direct mobile-camera OCR entry");
assertIncludes(rawMaterialPageSource, 'capture="environment"', "direct photo input should request the rear camera");
assertIncludes(officePageSource, "相册 / PDF", "page should retain gallery and PDF upload beside direct capture");
assertIncludes(rawMaterialPageSource, "识别成功：", "successful mobile OCR should expose an inline draft result");
assertIncludes(rawMaterialPageSource, 'setActiveTab("入库单")', "successful OCR should return to the inbound list view");
assertIncludes(rawMaterialPageSource, 'setSelectedId(inbound.id)', "successful OCR should select the generated draft");
assertIncludes(rawMaterialPageSource, "setMobileDetailOpen(true)", "successful mobile OCR should open the focused verification view automatically");
assertIncludes(rawMaterialPageSource, "const updatedInbound = await onAction?.(\"复核送货单\"", "mobile OCR review should await the authoritative review result");
assertIncludes(rawMaterialPageSource, "if (!updatedInbound?.id) {", "failed mobile OCR review should remain on the review page");
assertIncludes(rawMaterialPageSource, "setOcrReviewSubmitError", "failed mobile OCR review should explain that the server did not save it");
assertIncludes(rawMaterialPageSource, "meta.error || ocrReviewSubmitError", "mobile OCR review should show the backend validation reason instead of masking it with a generic save failure");
assertIncludes(rawMaterialPageSource, "setMobileDetailOpen(false)", "successful mobile OCR review should return to the receiving flow");
assertIncludes(rawMaterialPageSource, "mobileOcrReviewOpen ? \"is-mobile-detail-open\"", "mobile detail mode should remain scoped to an active OCR review");
assertIncludes(rawMaterialPageSource, "RawMaterialMobileOcrReview", "raw-material page should mount the focused mobile OCR review flow");
assertIncludes(rawMaterialPageSource, "prepareRawMaterialDeliveryNotePages", "mobile capture should split PDF pages while preserving per-page source images and OCR derivatives");
assertExcludes(rawMaterialPageSource, "1500", "the shared business page must not restore the review prototype's blanket 1500-meter filler");
assertIncludes(rawMaterialMobileSource, "录原材料", "phone layout should expose the approved field-task title");
assertIncludes(rawMaterialMobileSource, "拍单", "phone layout should expose the photo step");
assertIncludes(rawMaterialMobileSource, "核对", "phone layout should expose the review step");
assertIncludes(rawMaterialMobileSource, "打印", "phone layout should expose the print step");
assertIncludes(rawMaterialMobileSource, "贴标", "phone layout should expose the attachment step");
for (const [label, icon] of [
  ["拍单", "CameraOutlined"],
  ["核对", "CheckCircleOutlined"],
  ["打印", "PrinterOutlined"],
  ["贴标", "TagOutlined"],
]) {
  assertIncludes(rawMaterialMobileSource, `["${label}", ${icon}]`, `phone receiving step ${label} should retain its approved icon`);
}
assertExcludes(rawMaterialMobileSource, "TagsOutlined", "phone attachment actions should avoid the ambiguous overlapping-tags icon");
assertIncludes(rawMaterialMobileSource, '<span><Icon aria-hidden="true" /></span>', "phone progress icons should remain decorative for assistive technology");
assertIncludes(rawMaterialMobileSource, "逐卷无序贴标", "phone label verification should expose one unordered all-roll page");
assertIncludes(rawMaterialMobileSource, "确认已贴", "each printable roll should expose an explicit success action");
assertIncludes(rawMaterialMobileSource, "一键确认", "phone label verification should expose the approved batch attachment action");
assertIncludes(rawMaterialMobileSource, "标签/实物不符", "each printable roll should expose an explicit mismatch action");
assertIncludes(rawMaterialMobileSource, "只隔离这一卷", "a mismatched roll should not block correct rolls");
assertIncludes(rawMaterialMobileSource, "张不同卷标", "print copy should explain that one unique label is printed per roll");
assertIncludes(rawMaterialMobileSource, "raw-material-mobile-print-success", "normal print completion should use a compact modal on the print page");
assertIncludes(rawMaterialMobileSource, "开始贴标", "normal print completion should expose one primary next action");
assertIncludes(rawMaterialMobileSource, "mobilePrinterReady", "mobile printing should fail closed until a selected device passes field acceptance");
for (const label of ["颜色", "规格 / 宽幅", "本卷重量 kg"]) {
  assertIncludes(rawMaterialMobileOcrReviewSource, label, `focused mobile OCR review should expose ${label} on the first screen`);
}
assertIncludes(rawMaterialMobileOcrReviewSource, "核对送货单", "mobile OCR review should use the approved delivery-note verification title");
assertIncludes(rawMaterialMobileOcrReviewSource, "核对退货单", "supplier returns should reuse the approved mobile review anatomy with return-specific copy");
assertIncludes(rawMaterialMobileOcrReviewSource, "documentDirection", "mobile OCR review should project and validate rows with the server-authoritative document direction");
assertIncludes(rawMaterialMobileOcrReviewSource, "原单未写规格", "supplier returns should keep absent specifications visible without inventing or blocking them");
assertIncludes(rawMaterialMobileOcrReviewSource, "Math.abs(Number(roll.weightKg))", "supplier return rows should accept and preserve signed non-zero weights");
assertIncludes(rawMaterialPageSource, 'completedInbound.status === "已入库待补打标签" ? "label-deferred" : "print"', "reviewed delivery notes should automatically bypass unavailable onsite printing and remain pending label completion");
assertIncludes(rawMaterialPageSource, 'isSupplierReturn ? "return-complete"', "reviewed supplier returns must terminate before printing and inventory");
assertIncludes(rawMaterialMobileSource, "退货单已复核", "the mobile receiving flow should expose a terminal reviewed-return result");
assertIncludes(rawMaterialMobileSource, "不生成进货卷码、标签和库存；作为负数厂家对账依据", "the terminal return state should separate no-inbound effects from negative supplier reconciliation");
assertIncludes(rawMaterialMobileOcrReviewSource, "放大查看", "mobile OCR review should keep the real delivery note as the evidence anchor");
assertIncludes(rawMaterialMobileOcrReviewSource, "逐卷核对", "mobile OCR review should start with an all-roll verification ledger");
assertIncludes(rawMaterialMobileOcrReviewSource, "projectRawMaterialOcrPhysicalRollReviewRows", "mobile OCR review should expand source lines into one row per physical roll");
assertIncludes(rawMaterialMobileOcrReviewSource, "raw-material-mobile-review-line-summary", "every physical roll should expose color, specification, its own weight and status in the overview");
assertIncludes(rawMaterialMobileOcrReviewSource, "raw-material-mobile-review-source-crop", "every physical roll should retain its source-row evidence when coordinates are available");
assertExcludes(rawMaterialMobileOcrReviewSource, "厂家一行有多卷时会先拆开", "the default mobile ledger should not repeat routine instructional prose");
assertIncludes(rawMaterialMobileOcrReviewSource, "formatRawMaterialMobileSpec", "mobile OCR review should use the shared 克重*宽度*米数 display grammar");
assertIncludes(rawMaterialMobileOcrReviewSource, "厂家行总重 kg（不进入卷标）", "source-line totals should remain audit-only metadata");
assertExcludes(rawMaterialMobileOcrReviewSource, 'className="line-roll-count"', "a physical-roll row should not display a roll-count field");
assertExcludes(rawMaterialMobileOcrReviewSource, "确认并看下一卷", "mobile OCR review should not force a one-roll-at-a-time pager");
assertIncludes(rawMaterialMobileOcrReviewSource, "其他字段与 OCR 原文", "secondary OCR fields should use progressive disclosure");
assertIncludes(rawMaterialMobileOcrReviewSource, "单据信息", "supplier, document and audit metadata should be collapsed away from the primary review fields");
assertIncludes(rawMaterialMobileOcrReviewSource, "reviewedCount === activeReviewRolls.length", "final OCR review submission should remain gated on every active physical roll being explicitly confirmed");
assertIncludes(rawMaterialMobileOcrReviewSource, "核对正确", "complete physical rolls should expose a direct one-tap confirmation in the ledger");
assertIncludes(rawMaterialMobileOcrReviewSource, "删除误识别卷", "false-positive OCR rolls should expose the approved audited removal path");
assertIncludes(rawMaterialMobileOcrReviewSource, "excludedRolls", "removed OCR rows should stay explicit in the review submission contract");
assertIncludes(rawMaterialMobileOcrReviewSource, "hasReviewableRawMaterialSpec", "mobile OCR review should not accept nonnumeric fragments as a material specification");
assertIncludes(rawMaterialMobileOcrReviewSource, "规格没看清", "ambiguous material specifications should remain visibly blocked");
assertExcludes(rawMaterialMobileOcrReviewSource, "米数待补", "an omitted handle-strip meter length should remain absent without blocking confirmation");
assertExcludes(rawMaterialMobileOcrReviewSource, "待补米数", "fixed handle strips should remain on the direct confirmation path");
assertIncludes(rawMaterialMobileOcrReviewSource, "orientRawMaterialSourcePreview", "OCR angle metadata should orient the real delivery note before preview and row evidence rendering");
assertIncludes(rawMaterialMobileOcrReviewSource, "getOcrPageMeta(selected, sourcePageIndex).angle", "mobile evidence orientation should use the server-projected angle for the exact source page");
assertIncludes(rawMaterialMobileOcrReviewSource, "sourceAttachmentIds", "multi-page source evidence should retain every ordered source attachment");
assertIncludes(rawMaterialMobileSource, "没有第二页，开始识别", "the ordinary one-page path should stay explicit while allowing a rare second page");
assertIncludes(rawMaterialMobileSource, "还有第二页", "the mobile capture flow should allow another page without forcing it on every receipt");
assertIncludes(rawMaterialMobileSource, "raw-material-mobile-capture-previews", "captured delivery or return pages should expose immediate ordered thumbnail previews");
assertIncludes(rawMaterialMobileSource, "查看${isSupplierReturn ? \"退货单\" : \"送货单\"}第", "each captured page should open a readable full preview before OCR");
assertIncludes(rawMaterialMobileSource, "删除${isSupplierReturn ? \"退货单\" : \"送货单\"}第", "each captured page should be removable before OCR");
assertIncludes(rawMaterialMobileSource, "页面没有遗漏", "multi-page capture should explicitly prevent partial-note recognition");
assertIncludes(rawMaterialMobileSource, "供应商退货", "the operator must explicitly choose the supplier-return direction before capture");
assertIncludes(rawMaterialMobileSource, "暂不打印，保存为待补标", "printing may be deferred without falsely marking labels as printed");
assertIncludes(rawMaterialMobileOcrReviewSource, "厂内标准色", "inventory color should require an explicit canonical factory-color confirmation");
assertIncludes(rawMaterialPageSource, "handleDeliveryNotePageRemove", "the capture flow should remove only the selected page without clearing the receipt");
assertIncludes(rawMaterialMobileOcrReviewSource, "orientRawMaterialOcrSourceBounds", "row evidence bounds should rotate into the same coordinate space as the oriented delivery note");
assertIncludes(rawMaterialMobileOcrReviewSource, 'preserveAspectRatio="none"', "source evidence should map the oriented image into the OCR coordinate space without off-screen percentage offsets");
assertIncludes(rawMaterialMobileOcrReviewSource, "sourceCoordinateFrame", "legacy OCR rows should use the real OCR derivative frame instead of the table polygon extent");
assert.equal(normalizeRawMaterialOcrAngle(90.54107), 90, "real OCR deskew angles should normalize to the displayed quarter turn");
assert.deepEqual(
  orientRawMaterialOcrSourceBounds({
    top: 605,
    left: 1184,
    right: 1271,
    bottom: 3072,
    imageWidth: 1787,
    imageHeight: 3080,
  }, 90.54107, { imageWidth: 2400, imageHeight: 3200 }),
  {
    left: 605,
    top: 1129,
    right: 3072,
    bottom: 1216,
    imageWidth: 3200,
    imageHeight: 2400,
  },
  "the deployed Renyi row evidence should remain visible after the portrait source is deskewed counter-clockwise",
);
const renyiLegacyLines = [
  { sourceBounds: { top: 286, left: 1267, right: 1437, bottom: 3071, imageWidth: 1787, imageHeight: 3080 } },
  { sourceBounds: { top: 284, left: 1267, right: 1349, bottom: 2667, imageWidth: 1787, imageHeight: 3080 } },
  { sourceBounds: { top: 605, left: 1184, right: 1271, bottom: 3072, imageWidth: 1787, imageHeight: 3080 } },
  { sourceBounds: { top: 605, left: 1098, right: 1191, bottom: 3074, imageWidth: 1787, imageHeight: 3080 } },
];
assert.deepEqual(
  resolveRawMaterialOcrSourceFrame({
    sourceWidth: 3072,
    sourceHeight: 4096,
    sourceFileSize: 8_996_691,
    normalizedBinaryBytes: 7.5 * 1024 * 1024,
    normalizedMaxEdge: 3200,
    lines: renyiLegacyLines,
  }),
  { imageWidth: 2400, imageHeight: 3200 },
  "the Renyi source image must use the 2400x3200 OCR derivative frame instead of its 3072x4096 attachment frame",
);
assert.deepEqual(
  resolveRawMaterialOcrSourceFrame({
    sourceWidth: 4096,
    sourceHeight: 3072,
    normalizedMaxEdge: 3200,
    lines: renyiLegacyLines,
  }),
  { imageWidth: 2400, imageHeight: 3200 },
  "legacy bounds should recover the OCR frame even when a mobile decoder reports auto-oriented dimensions",
);
assert.equal(shouldRotateRawMaterialSourcePreview({
  sourceWidth: 3072,
  sourceHeight: 4096,
  sourceFrame: { imageWidth: 2400, imageHeight: 3200 },
  rawAngle: 90.54107,
}), true);
assert.equal(shouldRotateRawMaterialSourcePreview({
  sourceWidth: 4096,
  sourceHeight: 3072,
  sourceFrame: { imageWidth: 2400, imageHeight: 3200 },
  rawAngle: 90.54107,
}), false, "a decoder that already applied quarter-turn orientation must not be rotated twice");
assert.deepEqual(
  tightenRawMaterialOcrSourceRowBounds(
    orientRawMaterialOcrSourceBounds(renyiLegacyLines[0].sourceBounds, 90.54107, { imageWidth: 2400, imageHeight: 3200 }),
    orientRawMaterialOcrSourceBounds(renyiLegacyLines[1].sourceBounds, 90.54107, { imageWidth: 2400, imageHeight: 3200 }),
  ),
  { left: 286, top: 963, right: 3071, bottom: 1051, imageWidth: 3200, imageHeight: 2400 },
  "a merged amount cell must not make the seventh roll crop include the next source row",
);
for (const angle of [0, 90, 180, 270]) {
  const orientedBounds = orientRawMaterialOcrSourceBounds({
    top: 284,
    left: 1267,
    right: 1349,
    bottom: 2667,
    imageWidth: 1787,
    imageHeight: 3080,
  }, angle, { imageWidth: 2400, imageHeight: 3200 });
  assert.ok(orientedBounds, `source crop should survive ${angle}-degree orientation`);
  assert.ok(orientedBounds.left >= 0 && orientedBounds.right <= orientedBounds.imageWidth, `${angle}-degree crop should stay inside the oriented image width`);
  assert.ok(orientedBounds.top >= 0 && orientedBounds.bottom <= orientedBounds.imageHeight, `${angle}-degree crop should stay inside the oriented image height`);
}
assertIncludes(rawMaterialMobileOcrReviewSource, "确认送货单（", "mobile OCR review should keep one sticky progress-aware confirmation action");
for (const label of ["确认创建采购请求", "本次变更", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定内容", "授权依据", "预计影响"]) {
  assertIncludes(rawMaterialPurchaseSource, label, `raw-material purchase confirmation should retain ${label}`);
}
assertIncludes(rawMaterialPurchaseSource, "formatBusinessDecisionChannelAndTime", "purchase confirmation should convert internal decision channels to Chinese labels");
assertIncludes(rawMaterialPurchaseSource, "确认取消采购请求", "purchase cancellation should use the same frozen high-risk confirmation boundary");
assertIncludes(rawMaterialPurchaseSource, "buildPurchaseStatusIdempotencyKey", "purchase status writes should generate a stable per-attempt idempotency key");
assertIncludes(rawMaterialMobileSource, "未完成", "phone receiving surface should retain access to every unfinished note");
assert.ok(
  rawMaterialMobileSource.indexOf('aria-label="未完成的原材料收货单"')
    < rawMaterialMobileSource.indexOf("<CaptureDeliveryNote"),
  "phone receiving start page should place resumable notes before capture",
);
assert.ok(
  rawMaterialMobileSource.indexOf("<CaptureDeliveryNote")
    < rawMaterialMobileSource.indexOf('aria-label="最近完成的原材料收货单"'),
  "phone receiving start page should place capture before recent completions",
);
for (const stage of ["print-success", "print-result", "receive-partial", "receive-complete"]) {
  assertIncludes(rawMaterialMobileSource, stage, `phone receiving should retain the ${stage} result state`);
}
assertIncludes(rawMaterialMobileSource, "if (!updatedInbound?.id) return", "phone label verification should only advance after a server-authoritative update");
assertExcludes(rawMaterialMobileSource, "全部功能", "raw-material field utility should not mix unrelated role navigation into the four-step flow");
assertExcludes(rawMaterialMobileSource, "mobile-role-bottom-nav", "raw-material field utility should not retain the rejected current/pending/all bottom navigation");
assertExcludes(rawMaterialMobileSource, "供应商对账", "phone receiving surface should omit supplier statement work");
assertExcludes(rawMaterialMobileSource, "机边领料", "phone receiving surface should omit machine-side issue work");
assertExcludes(rawMaterialMobileSource, "手机扫码", "phone receiving surface should not require scan as an inbound-availability gate");
assertExcludes(rawMaterialMobileSource, "签单", "phone receiving surface should not require signed notes as an inbound-availability gate");
assertIncludes(rawMaterialMobileSource, "if (canReviewRawMaterialInbound(selected)) return 2", "pending review should activate the second mobile step");
assertIncludes(rawMaterialMobileSource, "if (canPrintRawMaterialLabels(selected)) return 3", "pending label print should activate the third mobile step");
assertIncludes(rawMaterialPageSource, "printerDeviceQa={printerDeviceQa}", "raw-material mobile printing should receive dynamic printer state");
assertIncludes(appSource, "printerDeviceQa={printerDeviceQa}", "App should pass dynamic printer state into raw-material receiving");
assertIncludes(officePageSource, "确认人工复核", "page should require explicit review of OCR fields");
assertIncludes(rawMaterialPageSource, "OCR 逐行复核", "page should expose editable OCR line reviews");
assertIncludes(rawMaterialPageSource, "lineReviews", "page should submit every OCR line review with the header review");
assertIncludes(rawMaterialPageSource, "分卷重量 kg", "page should allow exact per-roll weights to be reviewed");
assertIncludes(officePageSource, "识别不会直接入库", "page should keep OCR separate from inventory availability");
assertIncludes(officePageSource, "打印标签只是待贴标", "page should keep print separate from attach confirmation");
assertIncludes(rawMaterialListStateSource, "后端 API 已同步", "raw-material list state should expose API sync source");
assertIncludes(officePageSource, "一卷一标", "page should expose one-label-per-roll rule");
assertIncludes(officePageSource, "成本权限可见", "page should hide cost without permission");
assertIncludes(officePageSource, "供应商月结对账只确认", "page should separate supplier matching from payment");
assertIncludes(officePageSource, "供应商原始单号有则录、没有就留空", "page should state supplier delivery-note numbers are optional");
assertIncludes(officePageSource, "外部/内部单号", "page should distinguish supplier and ERP numbers");
assertIncludes(officePageSource, "precheckRawMaterialSupplierStatementWorkbook", "page should import supplier statement Excel precheck adapter");
assertIncludes(officePageSource, "上传月结 Excel", "page should expose supplier statement Excel upload entry");
assertIncludes(officePageSource, "支持白侯重1-重5", "page should explain supported supplier statement templates");
assertIncludes(officePageSource, "保存复核草稿", "page should let operators save supplier statement precheck as review draft");
assertIncludes(officePageSource, "月结复核草稿", "page should show persisted supplier statement review drafts");
assertIncludes(officePageSource, "不会写库存、应付或付款", "page should keep supplier review drafts non-accounting");
assertIncludes(officePageSource, "确认对账", "page should let operators confirm a reviewed consistent supplier statement");
assertIncludes(officePageSource, "待财务付款确认", "page should keep supplier statement confirmation separate from payment");
assertIncludes(officePageSource, "生成应付", "page should expose finance-only supplier payable draft generation");
assertIncludes(officePageSource, "待财务复核", "page should keep generated supplier payable drafts pending finance review");
assertIncludes(officePageSource, "确认付款", "page should expose finance-only supplier payment confirmation");
assertIncludes(officePageSource, "已确认付款", "page should display supplier payment confirmation status");
assertIncludes(rawMaterialPageSource, "确认已实际向", "supplier payment should require an explicit actual-payment confirmation");
assertIncludes(rawMaterialPageSource, "付款金额：", "supplier payment confirmation should show the payable amount");
assertIncludes(rawMaterialPageSource, "不会影响原材料库存", "supplier payment confirmation should keep its inventory boundary explicit");
assertIncludes(rawMaterialPageSource, "Number(review.supplierPayableDraft.payableAmount) > 0", "supplier payment should require a positive payable amount before enabling confirmation");
assertIncludes(officePageSource, "机边领料 / 消耗", "page should show raw-material machine-side issue records");
assertExcludes(officePageSource, "全部机边领料", "page must not allow one action to issue every available roll");
assertIncludes(officePageSource, "部分领料", "page should expose split-roll partial issue action");
assertIncludes(officePageSource, "部分消耗", "page should expose measured partial consumption action");
assertIncludes(officePageSource, "buildRawMaterialPartialIssueOptions", "page should build partial issue options");
assertIncludes(officePageSource, "buildRawMaterialPartialConsumptionOptions", "page should build partial consumption options");
assertIncludes(officePageSource, "canIssueRawMaterialRoll", "page should guard single-roll issue action by available inventory");
assertIncludes(officePageSource, "确认消耗", "page should expose machine-side consumption confirmation");
assertIncludes(officePageSource, "余料退回", "page should expose leftover return action");
assertIncludes(officePageSource, "复核余料", "page should expose leftover review action");
assertIncludes(officePageSource, "canConfirmRawMaterialConsumptionRoll", "page should guard consumption confirmation by machine-side state");
assertIncludes(officePageSource, "formatRawMaterialLeftoverReturnRecord", "page should format leftover return records");
assertIncludes(officePageSource, "formatRawMaterialSplitRecord", "page should format split records");
assertIncludes(officePageSource, "canReviewRawMaterialLeftoverRoll", "page should guard leftover review by pending-leftover state");
assertIncludes(officePageSource, "formatRawMaterialLeftoverReviewRecord", "page should format leftover review records");
assertIncludes(officePageSource, "formatSupplierStatementAdjustment", "page should format structured supplier statement adjustments");
assertIncludes(officePageSource, "纸管扣项", "page should show paper tube deduction adjustment type");
assertIncludes(officePageSource, "仅参考不进本期应付", "page should explain reference balance exclusion from current payable");

assertIncludes(permissionSource, "raw_material.inbound.review", "permissions should guard inbound review");
assertIncludes(permissionSource, "raw_material.label.print", "permissions should guard label printing");
assertIncludes(permissionSource, "raw_material.label.attach_confirm", "permissions should guard attach confirmation");
assertIncludes(permissionSource, "raw_material.issue.create", "permissions should guard machine-side raw-material issue");
assertIncludes(permissionSource, "raw_material.consumption.confirm", "permissions should guard raw-material consumption confirmation");
assertIncludes(permissionSource, "raw_material.leftover.return", "permissions should guard raw-material leftover returns");
assertIncludes(permissionSource, "raw_material.leftover.review", "permissions should guard raw-material leftover reviews");
assertIncludes(permissionSource, "raw_material.cost.view", "permissions should guard cost visibility");
assertIncludes(permissionSource, "raw_material.supplier_payable.create", "permissions should guard supplier payable draft generation");
assertIncludes(permissionSource, "raw_material.supplier_payment.confirm", "permissions should guard supplier payment confirmation");

assertIncludes(styleSource, ".raw-material-workbench", "styles should cover raw-material page");
assertIncludes(rawMaterialStyleSource, "grid-template-columns: minmax(0, 1.62fr) minmax(420px, 1fr)", "raw-material desktop should reserve a usable detail width");
assertIncludes(rawMaterialStyleSource, ".raw-material-detail-scroll", "styles should own independent raw-material detail scrolling");
assertIncludes(rawMaterialStyleSource, ".raw-material-ocr-review-panel", "styles should cover the OCR review surface");
assertIncludes(rawMaterialStyleSource, ".raw-material-view-tabs", "styles should own count-bearing raw-material views");
assertIncludes(rawMaterialStyleSource, ".raw-material-table-cell", "styles should own two-line raw-material table cells");
assertIncludes(rawMaterialStyleSource, ".raw-material-inbound-table .data-row > span:nth-child(5)", "1024 layout should hide only the next-step column");
assertIncludes(rawMaterialStyleSource, "grid-template-columns: minmax(92px, 1.15fr) minmax(106px, 1.25fr) 66px 72px", "390 layout should keep four essential columns without table overflow");
assertIncludes(styleSource, ".raw-material-roll-row", "styles should cover roll rows");
assertIncludes(styleSource, ".supplier-statement-preview", "styles should cover supplier statement import preview");
assertIncludes(styleSource, ".supplier-statement-review-list", "styles should cover supplier statement review list");
assertIncludes(styleSource, ".supplier-statement-review-actions", "styles should cover supplier statement review actions");
assert.equal(mainSource.includes('import "./styles/features/raw-material.css";'), false, "raw-material styles should not load with the initial shell");
assertIncludes(rawMaterialRouteSource, 'import "../../styles/features/raw-material.css";', "raw-material route should load its styles with the workbench");
assertIncludes(rawMaterialRouteSource, 'import "../../styles/features/raw-material-mobile.css";', "raw-material route should load mobile workflow styles with the workbench");
assertIncludes(rawMaterialRouteSource, 'import "../../styles/features/raw-material-mobile-atlas.css";', "raw-material route should load approved mobile atlas styles after base mobile styles");
assertIncludes(rawMaterialRouteSource, 'import "../../styles/features/raw-material-print.css";', "raw-material route should load roll-label print styles with the workbench");
assertIncludes(rawMaterialRouteSource, 'import "../../styles/features/raw-material-color-mapping.css";', "raw-material route should load supplier color maintenance styles with the workbench");
const rawMaterialRouteStyleImports = [
  "raw-material.css",
  "raw-material-mobile.css",
  "raw-material-mobile-atlas.css",
  "raw-material-print.css",
  "raw-material-color-mapping.css",
];
for (let index = 1; index < rawMaterialRouteStyleImports.length; index += 1) {
  assert.ok(
    rawMaterialRouteSource.indexOf(rawMaterialRouteStyleImports[index - 1]) < rawMaterialRouteSource.indexOf(rawMaterialRouteStyleImports[index]),
    `${rawMaterialRouteStyleImports[index]} should preserve the original raw-material cascade order`,
  );
}
assert.ok(rawMaterialBaseStyleSource.split("\n").length <= 2300, "raw-material base styles should stay below 2300 lines");
assert.ok(rawMaterialMobileStyleSource.split("\n").length <= 2700, "raw-material mobile compatibility styles should stay below 2700 lines");
assert.ok(rawMaterialMobileAtlasStyleSource.split("\n").length <= 1500, "raw-material approved mobile atlas should stay below 1500 lines");
assert.ok(rawMaterialPrintStyleSource.split("\n").length <= 150, "raw-material label print styles should stay below 150 lines");
for (const selector of [
  ".raw-material-roll-row",
  ".raw-material-view-tabs",
  ".raw-material-detail-scroll",
  ".raw-material-table-cell",
  ".raw-material-statement-import",
  ".file-upload-button",
  ".supplier-statement-preview",
  ".supplier-statement-review-actions",
  ".supplier-statement-row",
  ".supplier-statement-review-list",
]) {
  assertIncludes(rawMaterialStyleSource, selector, `raw-material styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}

console.log("raw-material inbound page check passed");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}

function assertExcludes(source, expected, message) {
  if (source.includes(expected)) {
    throw new Error(`${message}: found ${expected}`);
  }
}
