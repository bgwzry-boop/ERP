// 负责人 2026-11-08：同一个客户同一次拿的几样货合成一张自提单/送货单。
// 每样货仍各有自己的出库任务和打印记录；纸面上合成一张，明细按顺序排在一起，合计重新加。
const text = (value) => String(value ?? "").trim();

/**
 * Merges note templates of one customer and one document type into one sheet template.
 * Returns { template } or { error: { code, message } }.
 */
export function mergeFulfillmentNoteTemplates(templates = []) {
  const list = templates.filter(Boolean);
  if (!list.length) return { error: { code: "PRINT_NOTE_EMPTY", message: "没有可打印的单据。" } };
  if (list.length === 1) return { template: list[0] };
  const [first] = list;
  const documentTypes = new Set(list.map((template) => text(template.documentType)));
  if (documentTypes.size > 1) return { error: { code: "PRINT_NOTE_TYPES_DIFFER", message: "送货单和自提单不能合成一张。" } };
  const customers = new Set(list.map((template) => text(template.fields?.customerName)));
  if (customers.size > 1) return { error: { code: "PRINT_NOTE_CUSTOMERS_DIFFER", message: "不同客户的货不能合成一张单子。" } };
  const lineItems = list.flatMap((template) => template.fields?.lineItems ?? []);
  const amounts = list.map((template) => template.fields?.totalAmount);
  const totalAmount = amounts.every((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    ? Math.round(amounts.reduce((sum, value) => sum + Number(value), 0) * 100) / 100
    : null;
  const totalQuantity = list.reduce((sum, template) => sum + (Number(template.fields?.totalQuantity) || 0), 0);
  const pickerName = list.map((template) => text(template.fields?.pickerName)).find(Boolean) ?? "";
  const batchNotes = [...new Set(list.map((template) => text(template.fields?.batchProgressText)).filter(Boolean))];
  return {
    template: {
      ...first,
      fields: {
        ...first.fields,
        documentNo: list.map((template) => text(template.fields?.documentNo)).filter(Boolean)[0] ?? "",
        mergedDocumentNos: list.map((template) => text(template.fields?.documentNo)).filter(Boolean),
        pickerName,
        lineItems,
        totalQuantity,
        totalQuantityText: `${totalQuantity}个`,
        totalAmount,
        // 大写金额由 PDF 按合计重算。
        totalAmountUppercase: "",
        totalAmountText: totalAmount === null ? "待核价" : totalAmount.toFixed(2),
        batchProgressText: batchNotes.join("；"),
      },
    },
  };
}
