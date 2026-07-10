import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const fixturesSource = readFileSync(new URL("../src/data/fixtures.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const rawMaterialListStateSource = readFileSync(new URL("../src/domain/rawMaterialInboundListState.js", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assertIncludes(fixturesSource, "initialRawMaterialInbounds", "fixtures should seed raw-material inbound records");
assertIncludes(fixturesSource, "已识别待复核", "fixtures should include OCR review state");
assertIncludes(fixturesSource, "已打印待贴标", "fixtures should include printed-but-not-attached state");
assertIncludes(fixturesSource, "已贴标入库/可用", "fixtures should include attached and usable state");
assertIncludes(fixturesSource, "白侯模板月结时需拆重1-重5", "fixtures should preserve supplier statement matching notes");
assertIncludes(fixturesSource, "北陈月结 Excel 用批号强匹配", "fixtures should preserve batch matching notes");
assertIncludes(fixturesSource, "供应商单号未提供", "fixtures should cover suppliers without delivery-note numbers");

assertIncludes(appSource, '{ key: "rawMaterials", label: "原材料"', "navigation should expose the raw-material page");
assertIncludes(appSource, "<RawMaterialInboundPage", "App should render the raw-material inbound page");
assertIncludes(appSource, "updateRawMaterialInbound", "App should own raw-material local action state");
assertIncludes(appSource, "listOfficeRawMaterialInbounds", "App should refresh raw-material inbounds through API client");
assertIncludes(appSource, "updateOfficeRawMaterialInboundAction", "App should submit raw-material actions through API client");
assertIncludes(appSource, "listOfficeRawMaterialSupplierStatementReviews", "App should refresh supplier statement review drafts through API client");
assertIncludes(appSource, "createOfficeRawMaterialSupplierStatementReviewDraft", "App should save supplier statement review drafts through API client");
assertIncludes(appSource, "confirmOfficeRawMaterialSupplierStatementReview", "App should confirm supplier statement review drafts through API client");
assertIncludes(appSource, "confirmOfficeRawMaterialSupplierStatement", "App should confirm reviewed supplier statements through API client");
assertIncludes(appSource, "generateOfficeRawMaterialSupplierPayableDraft", "App should generate supplier payable drafts through API client");
assertIncludes(appSource, "confirmOfficeRawMaterialSupplierPayment", "App should confirm supplier payments through API client");
assertIncludes(appSource, "打印只是待贴标状态，不能直接作为可用库存", "print action must not imply available inventory");
assertIncludes(appSource, "手机扫码并上传签单信息后再入库可用", "attach action should be required before availability");
assertIncludes(appSource, "机边领料", "App should support raw-material machine-side issue actions");
assertIncludes(appSource, "不生成成品数量或成本分摊", "machine-side issue should not imply finished output or cost allocation");
assertIncludes(appSource, "拆卷领料", "App should support split-roll partial raw-material issue");
assertIncludes(appSource, "部分消耗", "App should support partial raw-material consumption");
assertIncludes(appSource, "rawMaterialSplitRecords", "App should preserve split-roll trace records");
assertIncludes(appSource, "确认消耗", "App should support raw-material consumption confirmation actions");
assertIncludes(appSource, "余料退回", "App should support raw-material leftover return actions");
assertIncludes(appSource, "不自动变可用库存", "leftover return should not imply available inventory");
assertIncludes(appSource, "复核余料可用", "App should support raw-material leftover review actions");
assertIncludes(appSource, "转回可用库存", "leftover review should explicitly restore available inventory only after review");
assertIncludes(appSource, "供应商未提供单号", "App toasts should fall back when supplier note number is missing");

assertIncludes(officePageSource, "export function RawMaterialInboundPage", "office pages should export RawMaterialInboundPage");
assertIncludes(officePageSource, "OCR 仅预填", "page should clearly label OCR as prefill only");
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
assertIncludes(officePageSource, "机边领料 / 消耗", "page should show raw-material machine-side issue records");
assertIncludes(officePageSource, "全部机边领料", "page should expose all-available-roll issue action");
assertIncludes(officePageSource, "部分领料", "page should expose split-roll partial issue action");
assertIncludes(officePageSource, "部分消耗", "page should expose measured partial consumption action");
assertIncludes(officePageSource, "buildRawMaterialPartialIssueOptions", "page should build partial issue options");
assertIncludes(officePageSource, "buildRawMaterialPartialConsumptionOptions", "page should build partial consumption options");
assertIncludes(officePageSource, "canIssueRawMaterialToMachine", "page should guard issue action by available inventory");
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

assertIncludes(styleSource, ".raw-material-inbound-page", "styles should cover raw-material page");
assertIncludes(styleSource, ".raw-material-roll-row", "styles should cover roll rows");
assertIncludes(styleSource, ".supplier-statement-preview", "styles should cover supplier statement import preview");
assertIncludes(styleSource, ".supplier-statement-review-list", "styles should cover supplier statement review list");
assertIncludes(styleSource, ".supplier-statement-review-actions", "styles should cover supplier statement review actions");

console.log("raw-material inbound page check passed");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}
