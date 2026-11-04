import { randomUUID } from "node:crypto";
import { DELIVERY_ADDRESS_MAX_LENGTH, customerDeliveryAddresses, customerWithAddresses } from "../../shared/deliveryAddress.js";

// 负责人 2026-11-04：客户资料不指望一步填齐。办公室开单时另填的地址、办公室事后补的地址、
// 以后小程序客户自己填的地址，都追加成这个客户的收货地址；不改已经开出的送货单。
export const SETTLEMENT_CYCLE_OPTIONS = Object.freeze(["每单结清", "7天一结", "15天一结", "月结"]);

function projectProfile(workspace, customer) {
  const customerId = clean(customer.id ?? customer.customerId);
  const contact = (workspace.customerContacts ?? []).filter((row) => clean(row.customerId ?? row.customer_id) === customerId)
    .sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true))[0];
  return {
    customerId,
    name: clean(customer.name),
    shortName: clean(customer.shortName) || clean(customer.name),
    settlementCycle: clean(customer.settlementCycle ?? customer.cycle) || "未设置",
    contactName: clean(contact?.contactName ?? contact?.name ?? customer.contact),
    phone: clean(contact?.phone ?? customer.phone),
  };
}

const ADDRESS_SOURCES = new Set(["order_entry", "office", "driver_delivery", "miniapp"]);

export function createCustomerAddressCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");
  return { addDeliveryAddress, learnLocationFromDelivery, updateDeliveryAddress, readCustomerProfile, updateCustomerProfile };

  function readCustomerProfile({ workspace, customerId }) {
    const customer = (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === clean(customerId));
    if (!customer) return { notFound: true, code: "CUSTOMER_NOT_FOUND" };
    return { statusCode: 200, response: { profile: projectProfile(workspace, customer), settlementCycleOptions: SETTLEMENT_CYCLE_OPTIONS } };
  }

  // 负责人 2026-11-04：客户资料可以编辑——名称、简称、结算周期、默认联系人和电话。
  // 价格表、欠款、风险等级不在这里改；已开出的订单和送货单保留开单时的客户快照。
  async function updateCustomerProfile({ workspace, customerId, body = {}, operatorId }) {
    const id = clean(customerId);
    const customer = (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === id);
    if (!customer) return { notFound: true, code: "CUSTOMER_NOT_FOUND" };
    const current = projectProfile(workspace, customer);
    const expected = body.expected ?? {};
    if (["name", "shortName", "settlementCycle", "contactName", "phone"].some((key) => clean(expected[key]) !== current[key])) {
      return businessError(409, "CUSTOMER_PROFILE_CHANGED", "客户资料刚被别人改过，请刷新后再改。");
    }
    const next = {};
    for (const key of ["name", "shortName", "settlementCycle", "contactName", "phone"]) {
      if (body[key] === undefined) continue;
      const value = clean(body[key]).replace(/\s+/gu, " ");
      if (value !== current[key]) next[key] = value;
    }
    if (next.name !== undefined && (next.name.length < 1 || next.name.length > 40)) return businessError(422, "CUSTOMER_NAME_INVALID", "客户名称要填 1–40 个字。");
    if (next.shortName !== undefined && next.shortName.length > 20) return businessError(422, "CUSTOMER_SHORT_NAME_INVALID", "简称最多 20 个字。");
    if (next.settlementCycle !== undefined && (next.settlementCycle.length < 1 || next.settlementCycle.length > 20)) return businessError(422, "CUSTOMER_SETTLEMENT_CYCLE_INVALID", "请选择或填写结算周期（最多 20 个字）。");
    if (next.contactName !== undefined && next.contactName.length > 20) return businessError(422, "CUSTOMER_CONTACT_INVALID", "联系人最多 20 个字。");
    if (next.phone !== undefined && next.phone && !/^[0-9+\-\s()]{5,20}$/u.test(next.phone)) return businessError(422, "CUSTOMER_PHONE_INVALID", "电话只能填数字（可带 - 或 +），5–20 位。");
    if (!Object.keys(next).length) return { statusCode: 200, response: { profile: current, changed: false } };
    const operationLog = buildOperationLog(workspace, {
      targetType: "customer", targetId: id, action: "update_customer_profile", operatorId,
      before: current, after: next, reason: "修改客户资料", pageKey: "customer",
    });
    try {
      const saved = await workspace.masterDataImportTransactionRepository.updateCustomerProfile({
        workspace, customerId: id, ...next, newContactId: `CC-${randomUUID()}`, expected: current, operationLog,
      });
      return { statusCode: 200, response: { profile: saved.profile, changed: true } };
    } catch (error) {
      if (String(error?.message) === "CUSTOMER_PROFILE_CHANGED") return businessError(409, "CUSTOMER_PROFILE_CHANGED", "客户资料刚被别人改过，请刷新后再改。");
      if (String(error?.message) === "CUSTOMER_NOT_FOUND") return { notFound: true, code: "CUSTOMER_NOT_FOUND" };
      return businessError(409, "CUSTOMER_PROFILE_WRITE_FAILED", clean(error?.message) || "客户资料保存失败，请稍后重试。");
    }
  }

  // 负责人 2026-11-04：客户资料可以编辑。改地址文字（改了就清掉旧定位，下次送到重新记）、
  // 设为默认、单独清除定位。已开出的送货单地址不变。
  async function updateDeliveryAddress({ workspace, customerId, addressId, body = {}, operatorId }) {
    const id = clean(customerId);
    const customer = (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === id);
    if (!customer) return { notFound: true, code: "CUSTOMER_NOT_FOUND" };
    const current = customerDeliveryAddresses(customerWithAddresses(workspace, customer)).find((item) => item.addressId === clean(addressId));
    if (!current) return { notFound: true, code: "CUSTOMER_ADDRESS_NOT_FOUND" };
    const expected = body.expected ?? {};
    if (clean(expected.address) !== current.address || (expected.isDefault === true) !== current.isDefault || (expected.located === true) !== current.located) {
      return businessError(409, "CUSTOMER_ADDRESS_CHANGED", "这个地址刚被别人改过，请刷新后再改。");
    }
    const nextAddress = body.address === undefined ? null : clean(body.address).replace(/\s+/gu, " ");
    if (nextAddress !== null && nextAddress.length < 2) return businessError(422, "CUSTOMER_ADDRESS_REQUIRED", "请填写送货地址（至少 2 个字）。");
    if (nextAddress !== null && nextAddress.length > DELIVERY_ADDRESS_MAX_LENGTH) return businessError(422, "CUSTOMER_ADDRESS_TOO_LONG", `送货地址最多 ${DELIVERY_ADDRESS_MAX_LENGTH} 个字。`);
    const addressChanged = nextAddress !== null && nextAddress.replace(/\s+/gu, "") !== current.address.replace(/\s+/gu, "");
    const change = {
      address: addressChanged ? nextAddress : null,
      remark: body.remark === undefined ? null : clean(body.remark).slice(0, 60),
      makeDefault: body.makeDefault === true && !current.isDefault,
      clearLocation: current.located && (body.clearLocation === true || addressChanged),
    };
    if (change.address === null && change.remark === null && !change.makeDefault && !change.clearLocation) {
      return { statusCode: 200, response: { address: current, changed: false } };
    }
    const operationLog = buildOperationLog(workspace, {
      targetType: "customer",
      targetId: id,
      action: "update_customer_delivery_address",
      operatorId,
      before: current,
      after: { addressId: current.addressId, ...change },
      reason: change.clearLocation && !addressChanged ? "清除旧定位，下次送到重新记" : addressChanged ? "修改收货地址" : change.makeDefault ? "设为默认地址" : "修改地址备注",
      pageKey: "customer",
    });
    try {
      const saved = await workspace.masterDataImportTransactionRepository.updateCustomerAddress({
        workspace, customerId: id, addressId: current.addressId, ...change, expected: { address: current.address, isDefault: current.isDefault, located: current.located }, operationLog,
      });
      return { statusCode: 200, response: { address: saved.address, changed: true, locationCleared: change.clearLocation } };
    } catch (error) {
      if (String(error?.message) === "CUSTOMER_ADDRESS_CHANGED") return businessError(409, "CUSTOMER_ADDRESS_CHANGED", "这个地址刚被别人改过，请刷新后再改。");
      if (String(error?.message) === "CUSTOMER_ADDRESS_NOT_FOUND") return { notFound: true, code: "CUSTOMER_ADDRESS_NOT_FOUND" };
      return businessError(409, "CUSTOMER_ADDRESS_WRITE_FAILED", clean(error?.message) || "送货地址保存失败，请稍后重试。");
    }
  }

  // 负责人 2026-11-04：司机首次送到并拍送货照时，把手机定位记到这单送去的客户地址上，
  // 下次谁送都能直接导航。只补空的定位，不覆盖已有的；失败也不影响送货本身。
  async function learnLocationFromDelivery({ workspace, fulfillmentId, body = {} }) {
    const point = parseGeoPoint(body.watermarkGeoPoint ?? body.geoPoint);
    if (!point || !workspace.masterDataImportTransactionRepository?.recordCustomerAddressLocation) return { recorded: false, reason: "no_location" };
    try {
      return await workspace.masterDataImportTransactionRepository.recordCustomerAddressLocation({
        workspace, fulfillmentId, latitude: point.latitude, longitude: point.longitude, capturedAt: now().toISOString(),
      });
    } catch (error) {
      return { recorded: false, reason: clean(error?.message) || "location_write_failed" };
    }
  }

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
      // Never set here: two first addresses added at once must not both become the default. A
      // customer without a flagged default is delivered to the first address; the office can set one.
      isDefault: false,
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

export function parseGeoPoint(value) {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(value ?? ""));
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
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
