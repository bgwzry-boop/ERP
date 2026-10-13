import { classifyRawMaterialSupplierReturnCategory } from "../../shared/rawMaterialSupplierReturn.js";

export function applyRawMaterialInboundLocalDraftAction(item = {}, input = {}) {
  const { action, now, operatorName, options = {} } = input;
  if (action === "纠正为供应商退货") {
    if (item.status !== "已识别待复核" || item.documentDirection === "supplier_return") {
      return { handled: true, updatedItem: null };
    }
    const correctedLines = (item.ocrLines ?? []).map((line) => {
      const values = line.values ?? {};
      return {
        ...line,
        values: {
          ...values,
          totalWeightKg: toLocalReturnNumber(values.totalWeightKg),
          amount: toLocalReturnNumber(values.amount),
          rollWeightsKg: (Array.isArray(values.rollWeightsKg) ? values.rollWeightsKg : []).map(toLocalReturnNumber),
          returnMaterialCategory: classifyRawMaterialSupplierReturnCategory({
            ...values,
            sourceText: line.sourceText,
          }),
        },
      };
    });
    return {
      handled: true,
      updatedItem: {
        ...item,
        documentDirection: "supplier_return",
        documentDirectionSource: "operator_review_correction",
        documentTypeLabel: "退货单",
        totalWeightKg: toLocalReturnNumber(item.totalWeightKg),
        amount: toLocalReturnNumber(item.amount),
        ocrReviewFields: (item.ocrReviewFields ?? []).map((field) => ({
          ...field,
          required: ["supplierName", "materialType", "productName", "rollCount", "unit"].includes(field.key),
        })),
        ocrLines: correctedLines,
        rolls: [],
        nextStep: "按退货单逐项核对；规格可空，布料类别、重量、单价和金额仍需确认。",
      },
    };
  }
  if (action === "作废误录草稿") {
    const reason = String(options.reason ?? "").trim();
    if (item.status !== "已识别待复核" || !reason || (item.rolls ?? []).some((roll) => roll.inventoryStatus === "可用")) {
      return { handled: true, updatedItem: null };
    }
    return {
      handled: true,
      updatedItem: {
        ...item,
        status: "已作废",
        voidReason: reason,
        voidedBy: operatorName,
        voidedAt: now,
        nextStep: "误录草稿已作废；原图和操作记录继续保留用于审计，不形成库存。",
        rolls: (item.rolls ?? []).map((roll) => ({
          ...roll,
          inventoryStatus: "不可用",
          labelStatus: "草稿已作废",
        })),
      },
    };
  }
  return { handled: false, updatedItem: null };
}

function toLocalReturnNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? -Math.abs(number) : 0;
}
