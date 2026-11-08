// 负责人 2026-11-08：同一个客户同一次拿的几样货合成一张自提单/送货单。
// 每样货仍各有自己的出库任务和打印记录；纸面上合成一张，明细按顺序排在一起，合计重新加。
const text = (value) => String(value ?? "").trim();

/**
 * Merges note templates of one customer and one document type into one sheet template.
 * `customerIds` are the customer numbers of each template's fulfillment, read by the server
 * from the fulfillment records (not from the note): a name can be shared by two customers.
 * Returns { template } or { error: { code, message } }.
 */
export function mergeFulfillmentNoteTemplates(templates = [], { customerIds } = {}) {
  const list = templates.filter(Boolean);
  if (!list.length) return { error: { code: "PRINT_NOTE_EMPTY", message: "没有可打印的单据。" } };
  if (list.length === 1) return { template: list[0] };
  const [first] = list;
  const documentTypes = new Set(list.map((template) => text(template.documentType)));
  if (documentTypes.size > 1) return { error: { code: "PRINT_NOTE_TYPES_DIFFER", message: "送货单和自提单不能合成一张。" } };
  // 2026-11-08：按客户编号判断是不是同一个客户。同名不同编号的两个客户不能合成一张，
  // 否则会用第一个客户的地址电话。编号缺了也不合并。
  const ids = Array.isArray(customerIds) ? customerIds.map(text) : [];
  if (ids.length !== list.length || ids.some((id) => !id)) {
    return { error: { code: "PRINT_NOTE_CUSTOMER_UNKNOWN", message: "有单据查不到客户编号，不能合成一张，请分开打印。" } };
  }
  if (new Set(ids).size > 1) return { error: { code: "PRINT_NOTE_CUSTOMERS_DIFFER", message: "不同客户的货不能合成一张单子。" } };
  // 同一个客户但收货地址、联系人或电话不一样（比如送两个地方），也不合成一张。
  for (const field of ["address", "contactName", "phoneTail"]) {
    if (new Set(list.map((template) => text(template.fields?.[field]))).size > 1) {
      return { error: { code: "PRINT_NOTE_CONTACTS_DIFFER", message: "这几样货的收货地址或联系人不一样，不能合成一张，请分开打印。" } };
    }
  }
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
