import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const rawMaterialControllerSource = readFileSync(new URL("../src/app/createOfficeRawMaterialActions.js", import.meta.url), "utf8");
const rawMaterialApiClientSource = readFileSync(new URL("../src/services/officeRawMaterialApiClient.js", import.meta.url), "utf8");
const rawMaterialLocalActionsSource = readFileSync(new URL("../src/domain/rawMaterialInboundLocalActions.js", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const fixturesSource = readFileSync(new URL("../src/data/fixtures.js", import.meta.url), "utf8");
const roleToolReadsSource = readFileSync(new URL("../src/app/useOfficeRoleToolReads.js", import.meta.url), "utf8");
const officePageEntrySource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const rawMaterialPageSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundPage.jsx", import.meta.url), "utf8");
const rawMaterialWorkbenchSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundWorkbench.jsx", import.meta.url), "utf8");
const rawMaterialMobileSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialMobileReceiving.jsx", import.meta.url), "utf8");
const rawMaterialPurchaseSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialPurchasePanel.jsx", import.meta.url), "utf8");
const officePageSource = `${officePageEntrySource}\n${rawMaterialPageSource}\n${rawMaterialWorkbenchSource}\n${rawMaterialMobileSource}`;
const rawMaterialListStateSource = readFileSync(new URL("../src/domain/rawMaterialInboundListState.js", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const roleToolStyleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");
const rawMaterialStyleSource = readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styleSource = `${roleToolStyleSource}\n${rawMaterialStyleSource}`;

assertIncludes(fixturesSource, "initialRawMaterialInbounds", "fixtures should seed raw-material inbound records");
assertIncludes(fixturesSource, "已识别待复核", "fixtures should include OCR review state");
assertIncludes(fixturesSource, "已打印待贴标", "fixtures should include printed-but-not-attached state");
assertIncludes(fixturesSource, "已贴标/可用库存", "fixtures should include attached and usable state");
assertIncludes(fixturesSource, "白侯模板月结时需拆重1-重5", "fixtures should preserve supplier statement matching notes");
assertIncludes(fixturesSource, "北陈月结 Excel 用批号强匹配", "fixtures should preserve batch matching notes");
assertIncludes(fixturesSource, "供应商单号未提供", "fixtures should cover suppliers without delivery-note numbers");

assertIncludes(navigationSource, 'key: "rawMaterials"', "navigation should expose the raw-material page");
assertIncludes(navigationSource, 'label: "原材料"', "navigation should label the raw-material page");
assertIncludes(appSource, "<RawMaterialInboundPage", "App should render the raw-material inbound page");
assertIncludes(appSource, "createOfficeRawMaterialActions", "App should compose the raw-material action controller");
assertExcludes(appSource, "updateOfficeRawMaterialInboundAction", "App should not call the raw-material write client directly");
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
assertIncludes(rawMaterialApiClientSource, "body: { expectedRevision, idempotencyKey, status, reason", "purchase status writes should send the frozen version and idempotency key together");
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
assertIncludes(rawMaterialMobileSource, "原材料收货", "phone layout should expose a dedicated receiving title");
assertIncludes(rawMaterialMobileSource, "拍单", "phone layout should expose the photo step");
assertIncludes(rawMaterialMobileSource, "核对", "phone layout should expose the review step");
assertIncludes(rawMaterialMobileSource, "打印", "phone layout should expose the print step");
assertIncludes(rawMaterialMobileSource, "贴标", "phone layout should expose the attachment step");
for (const label of ["确认创建采购请求", "本次变更", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定内容", "授权依据", "预计影响"]) {
  assertIncludes(rawMaterialPurchaseSource, label, `raw-material purchase confirmation should retain ${label}`);
}
assertIncludes(rawMaterialPurchaseSource, "formatBusinessDecisionChannelAndTime", "purchase confirmation should convert internal decision channels to Chinese labels");
assertIncludes(rawMaterialPurchaseSource, "确认取消采购请求", "purchase cancellation should use the same frozen high-risk confirmation boundary");
assertIncludes(rawMaterialPurchaseSource, "buildPurchaseStatusIdempotencyKey", "purchase status writes should generate a stable per-attempt idempotency key");
assertIncludes(rawMaterialMobileSource, "全部功能", "phone receiving surface should retain a role-scoped all-functions entry");
assertIncludes(rawMaterialMobileSource, "mobile-role-bottom-nav", "phone receiving surface should use the shared current/pending/all role navigation");
assertIncludes(rawMaterialMobileSource, "未完成收货单", "phone receiving surface should expose a resumable pending queue");
assertExcludes(rawMaterialMobileSource, "供应商对账", "phone receiving surface should omit supplier statement work");
assertExcludes(rawMaterialMobileSource, "机边领料", "phone receiving surface should omit machine-side issue work");
assertExcludes(rawMaterialMobileSource, "手机扫码", "phone receiving surface should not require scan as an inbound-availability gate");
assertExcludes(rawMaterialMobileSource, "签单", "phone receiving surface should not require signed notes as an inbound-availability gate");
assertIncludes(rawMaterialMobileSource, "if (canReviewRawMaterialInbound(selected)) return 2", "pending review should activate the second mobile step");
assertIncludes(rawMaterialMobileSource, "if (canPrintRawMaterialLabels(selected)) return 3", "pending label print should activate the third mobile step");
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
assertIncludes(mainSource, 'import "./styles/features/raw-material.css";', "main should import raw-material feature styles");
assert.equal(
  mainSource.indexOf('import "./styles/features/role-tools.css";') < mainSource.indexOf('import "./styles/features/raw-material.css";'),
  true,
  "raw-material overlays should load after the role-tool workbench layer",
);
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
