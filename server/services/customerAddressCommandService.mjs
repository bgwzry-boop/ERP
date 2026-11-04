import { randomUUID } from "node:crypto";
import { DELIVERY_ADDRESS_MAX_LENGTH, customerDeliveryAddresses, customerWithAddresses } from "../../shared/deliveryAddress.js";

// 负责人 2026-11-04：客户资料不指望一步填齐。办公室开单时另填的地址、办公室事后补的地址、
// 以后小程序客户自己填的地址，都追加成这个客户的收货地址；不改已经开出的送货单。
const ADDRESS_SOURCES = new Set(["order_entry", "office", "driver_delivery", "miniapp"]);

export function createCustomerAddressCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");
  return { addDeliveryAddress };

  async function addDeliveryAddress({ workspace, customerId, body = {}, operatorId }) {
    const id = clean(customerId);
    const customer = (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === id);
    if (!customer) return { notFound: true, code: "CUSTOMER_NOT_FOUND" };
    const address = clean(body.address).replace(/\s+/gu, " ");
    if (address.length < 2) return businessError(422, "CUSTOMER_ADDRESS_REQUIRED", "请填写送货地址（至少 2 个字）。");
    if (address.length > DELIVERY_ADDRESS_MAX_LENGTH) return businessError(422, "CUSTOMER_ADDRESS_TOO_LONG", `送货地址最多 ${DELIVERY_ADDRESS_MAX_LENGTH} 个字。`);
    const source = ADDRESS_SOURCES.has(clean(body.source)) ? clean(body.source) : "office";
    const existing = customerDeliveryAddresses(customerWithAddresses(workspace, customer))
      .find((item) => item.address.replace(/\s+/gu, "") === address.replace(/\s+/gu, ""));
    // The same address typed again is the address already on file, not a second one.
    if (existing) return { statusCode: 200, response: { address: existing, created: false } };
    const record = {
      id: `CA-${randomUUID()}`,
      customerId: id,
      contactId: "",
      address,
      area: clean(body.area).slice(0, 40),
      defaultFulfillmentMethod: "送货",
      isDefault: customerDeliveryAddresses(customerWithAddresses(workspace, customer)).length === 0,
      remark: clean(body.remark).slice(0, 60) || sourceLabel(source),
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "customer",
      targetId: id,
      action: "add_customer_delivery_address",
      operatorId,
      before: null,
      after: { addressId: record.id, address, source },
      reason: sourceLabel(source),
      pageKey: "customer",
    });
    try {
      const saved = await workspace.masterDataImportTransactionRepository.applyImportExecution({
        workspace,
        importExecution: {
          executionId: `MDE-ADDRESS-${record.id}`,
          status: "ready_for_transaction_writer",
          officialImportEnabled: true,
          officialWriterKind: workspace.masterDataImportTransactionRepository?.kind || "local_transaction",
          summary: { failedRowCount: 0 },
          failedRows: [],
          importPayload: { targetRecords: { customerAddresses: [record] } },
          writeBatches: [],
        },
        operationLog,
      });
      return {
        statusCode: 201,
        response: {
          address: { addressId: record.id, address, area: record.area, isDefault: record.isDefault, remark: record.remark },
          created: true,
          operationLogId: clean(saved?.operationLogId),
        },
      };
    } catch (error) {
      return businessError(409, "CUSTOMER_ADDRESS_WRITE_FAILED", clean(error?.message) || "送货地址保存失败，请稍后重试。");
    }
  }
}

function sourceLabel(source) {
  return { order_entry: "开单时补充", office: "办公室补充", driver_delivery: "司机送货时补充", miniapp: "客户在小程序填写" }[source] ?? "办公室补充";
}

function clean(value) {
  return String(value ?? "").trim();
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
