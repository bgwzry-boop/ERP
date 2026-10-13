import assert from "node:assert/strict";
import { buildXlsxWorkbookFromWorksheets } from "../src/domain/xlsxWorkbook.js";
import {
  precheckRawMaterialSupplierStatementWorkbook,
  normalizeRawMaterialSupplierStatementWorkbook,
} from "../src/domain/rawMaterialSupplierStatementImport.js";
import { initialRawMaterialInbounds } from "../src/data/fixtures.js";

await checkBaihouStatementImport();
await checkBeichenStatementImport();
checkMissingSupplierDocumentNumberCandidateMatching();
checkHistoricalBalanceAdjustmentReference();

console.log("raw-material supplier statement import check passed");

async function checkBaihouStatementImport() {
  const workbook = buildXlsxWorkbookFromWorksheets({
    title: "白侯 7 月对账单",
    worksheets: [
      {
        name: "对账单",
        columns: [90, 110, 110, 130, 80, 60, 70, 70, 70, 70, 70, 80, 70, 80],
        rows: [
          ["制单日期", "单号", "客户名称", "商品名称", "颜色", "数量", "重1", "重2", "重3", "重4", "重5", "总重", "单价", "金额"],
          ["2026-07-04", "BH-240704-015", "虎门工厂", "白色无纺布", "本白", 3, 106.2, 105.8, 106.8, "", "", 318.8, 8.6, 2741.68],
          ["减退货减纸管合计", "", "", "", "", 3, "", "", "", "", "", -10.5, "", -90.3],
        ],
      },
    ],
  });
  const result = await precheckRawMaterialSupplierStatementWorkbook({
    bytes: workbook,
    fileName: "baihou-2026-07.xlsx",
    supplierName: "白侯无纺布",
    existingInbounds: initialRawMaterialInbounds,
    importedAt: "2026-07-04T06:00:00.000Z",
  });

  assert.equal(result.version, "p0-raw-material-supplier-statement-import-v1");
  assert.equal(result.adapter.key, "baihou", "Baihou workbook should use Baihou adapter");
  assert.equal(result.summary.rowCount, 3, "重1-重3 should become three roll-level rows");
  assert.equal(result.summary.matchedRowCount, 3, "Baihou rows should match the ERP inbound by supplier document no");
  assert.equal(result.summary.adjustmentCount, 1, "Baihou footer should become a review adjustment");
  assert.equal(result.summary.totalWeightKg, 318.8, "Baihou roll weights should sum to original total");
  assert.equal(result.rows.every((row) => row.matchedInboundId === "RMI-0704-002"), true);
  assert.equal(result.rows[0].rollLabel, "重1");
  assert.equal(result.rows[0].amount, 913.32, "Baihou amount should be allocated by roll weight");
  assert.match(result.adjustments[0].label, /纸管|减退货/, "Baihou footer should preserve tube deduction context");
  assert.equal(result.adjustments[0].adjustmentType, "paper_tube_deduction", "Baihou tube footer should be classified");
  assert.equal(result.adjustments[0].amount, -10.5, "Baihou tube deduction should use configured 3.5 yuan per piece");
  assert.equal(result.adjustments[0].supplierReportedAmount, -90.3, "supplier footer total should remain visible for review");
  assert.equal(result.adjustments[0].calculatedAmount, -10.5, "configured tube deduction calculation should be preserved");
  assert.equal(result.adjustments[0].calculationBasis.quantity, 3, "tube deduction should read piece count from quantity column");
  assert.equal(result.adjustments[0].calculationBasis.unitRate, 3.5, "tube deduction should use supplier rule unit rate");
  assert.equal(result.adjustments[0].calculationStatus, "different", "mixed footer should flag supplier total mismatch");
  assert(
    result.issues.some((issue) => issue.message.includes("纸管扣项") && issue.message.includes("供应商 footer 金额 -90.3")),
    "mixed tube/return footer should add a manual split warning",
  );
}

async function checkBeichenStatementImport() {
  const workbook = buildXlsxWorkbookFromWorksheets({
    title: "北陈 7 月每日发货明细",
    worksheets: [
      {
        name: "每日发货明细",
        columns: [90, 110, 110, 130, 110, 70, 60, 110, 80, 70, 80],
        rows: [
          ["日期", "单号", "客户名称", "商品名称", "规格", "颜色", "数量", "批号", "总重", "单价", "金额"],
          ["2026-07-04", "BC-240704-029", "虎门工厂", "黑色加长提手", "5cm*加长提", "黑", 4, "批号BC029-1", 0, 0.18, 720],
          ["退货明细"],
          ["日期", "单号", "客户名称", "商品名称", "规格", "颜色", "数量", "批号", "总重", "单价", "金额"],
          ["2026-07-05", "BC-240704-RET", "虎门工厂", "黑色加长提手", "5cm*加长提", "黑", 1, "批号BC029-4", 0, 0.18, 180],
        ],
      },
      {
        name: "每日发货统计",
        rows: [
          ["日期", "发货件数", "发货金额"],
          ["2026-07-04", 4, 720],
        ],
      },
    ],
  });
  const result = await precheckRawMaterialSupplierStatementWorkbook({
    bytes: workbook,
    fileName: "beichen-2026-07.xlsx",
    supplierName: "北陈辅料",
    existingInbounds: initialRawMaterialInbounds,
    importedAt: "2026-07-04T06:00:00.000Z",
  });

  assert.equal(result.adapter.key, "beichen", "Beichen workbook should use Beichen adapter");
  assert.equal(result.summary.rowCount, 2, "Beichen detail and return segment should become two normalized rows");
  assert.equal(result.summary.returnRowCount, 1, "Beichen shifted return segment should be recognized");
  assert.equal(result.summary.matchedRowCount, 2, "Beichen rows should match by document no or batch no");
  assert.equal(result.rows[0].productName, "黑色加长提手", "supplier wording should remain intact as reconciliation evidence");
  assert.equal(result.rows[0].matchedRollId, "RM-240704-003-01", "Beichen batch no should match roll label");
  assert.equal(result.rows[1].lineType, "return", "Beichen return row should keep return type");
  assert.equal(result.rows[1].amount, -180, "positive printed return magnitude should normalize to negative direction");
  assert.equal(result.summary.totalAmount, 540, "Shipment and return amount should net in summary");
}

function checkMissingSupplierDocumentNumberCandidateMatching() {
  const workbook = {
    sheets: [
      {
        name: "宏尚月结",
        rows: [
          { rowNumber: 1, cells: ["日期", "客户名称", "商品名称", "规格", "颜色", "数量", "总重", "单价", "金额"] },
          { rowNumber: 2, cells: ["2026-07-04", "虎门工厂", "无纺布卷料", "78*90g*1500m", "大红", "2", "212.4", "9", "1911.6"] },
        ],
      },
    ],
  };
  const result = normalizeRawMaterialSupplierStatementWorkbook(workbook, {
    fileName: "hongshang-no-doc.xlsx",
    supplierName: "宏尚布业",
    existingInbounds: initialRawMaterialInbounds,
    importedAt: "2026-07-04T06:00:00.000Z",
  });

  assert.equal(result.adapter.key, "generic", "missing supplier document number sample should use generic adapter");
  assert.equal(result.summary.rowCount, 1);
  assert.notEqual(result.summary.status, "blocked", "missing supplier document number must not block import precheck");
  assert.equal(result.rows[0].documentNo, "", "supplier document number may be blank");
  assert.equal(result.rows[0].matchingStatus, "candidate", "ERP should still produce candidate matching without supplier document no");
  assert.equal(result.rows[0].matchedInboundId, "RMI-0704-001", "candidate should use supplier/spec/color/weight evidence");
}

function checkHistoricalBalanceAdjustmentReference() {
  const workbook = {
    sheets: [
      {
        name: "宏尚月结",
        rows: [
          { rowNumber: 1, cells: ["日期", "客户名称", "商品名称", "规格", "颜色", "数量", "总重", "单价", "金额"] },
          { rowNumber: 2, cells: ["2026-07-04", "虎门工厂", "无纺布卷料", "78*90g*1500m", "大红", "2", "212.4", "9", "1911.6"] },
          { rowNumber: 3, cells: ["历史欠款余额", "", "", "", "", "", "", "", "300"] },
        ],
      },
    ],
  };
  const result = normalizeRawMaterialSupplierStatementWorkbook(workbook, {
    fileName: "hongshang-balance.xlsx",
    supplierName: "宏尚布业",
    existingInbounds: initialRawMaterialInbounds,
    importedAt: "2026-07-04T06:00:00.000Z",
  });

  assert.equal(result.adjustments.length, 1, "history balance row should become one adjustment reference");
  assert.equal(result.adjustments[0].adjustmentType, "reference_balance");
  assert.equal(result.adjustments[0].isCurrentPeriod, false, "history balance must not enter current payable draft");
  assert.equal(result.adjustments[0].amount, 300);
  assert.match(result.adjustments[0].note, /仅作参考/, "history balance note should explain payable exclusion");
}
