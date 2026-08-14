import { createHash, randomUUID } from "node:crypto";

const SOURCE_ORDER_PATTERN = /^WT\d{8}[A-F0-9]{10}$/;
const ERP_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RECONCILIATION_ORDERS = 20_000;
const MAX_RECONCILIATION_WINDOW_MS = 31 * 24 * 60 * 60 * 1_000;

export class BagwinErpIntegrationError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "BagwinErpIntegrationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function fail(code, message) {
  throw new BagwinErpIntegrationError(422, code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, field) {
  if (!isRecord(value)) fail("BAGWIN_ORDER_SCHEMA_INVALID", `${field} must be an object.`);
  return value;
}

function requireExactKeys(value, keys, field) {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.has(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", `${field} contains missing or unsupported fields.`);
  }
}

function requireString(value, field, options = {}) {
  const text = String(value ?? "").trim();
  const min = Number(options.min ?? 1);
  const max = Number(options.max ?? 200);
  if (text.length < min || text.length > max || (options.pattern && !options.pattern.test(text))) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", `${field} is invalid.`);
  }
  return text;
}

function optionalString(value, field, max = 500) {
  if (value === null || value === undefined) return null;
  return requireString(value, field, { min: 0, max });
}

function requireMoney(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100_000_000) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", `${field} is invalid.`);
  }
  return number;
}

function requireInteger(value, field, minimum = 1, maximum = 10_000_000) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", `${field} is invalid.`);
  }
  return number;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalBagwinJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function bagwinPayloadSha256(value) {
  return createHash("sha256").update(canonicalBagwinJson(value)).digest("hex");
}

function validateOrderLine(value, index) {
  const line = requireRecord(value, `order.lines[${index}]`);
  requireExactKeys(line, [
    "sourceLineId", "clientLineId", "productType", "productName", "skuId", "size",
    "colorId", "bagColor", "handleId", "handleColor", "quantity", "artworkFileId", "artwork",
    "specification", "quoteSnapshot", "inventorySnapshot", "estimatedAmount",
  ], `order.lines[${index}]`);
  const artworkFileId = optionalString(line.artworkFileId, `order.lines[${index}].artworkFileId`, 160);
  let artwork = null;
  if (line.artwork !== null) {
    const record = requireRecord(line.artwork, `order.lines[${index}].artwork`);
    requireExactKeys(record, ["fileId", "fileName", "mimeType", "byteSize", "sha256"], `order.lines[${index}].artwork`);
    artwork = {
      fileId: requireString(record.fileId, `order.lines[${index}].artwork.fileId`, { max: 160, pattern: ERP_IDENTIFIER_PATTERN }),
      fileName: requireString(record.fileName, `order.lines[${index}].artwork.fileName`, { max: 240 }),
      mimeType: requireString(record.mimeType, `order.lines[${index}].artwork.mimeType`, { max: 160 }),
      byteSize: requireInteger(record.byteSize, `order.lines[${index}].artwork.byteSize`, 1, 209_715_200),
      sha256: requireString(record.sha256, `order.lines[${index}].artwork.sha256`, { max: 64, pattern: DIGEST_PATTERN }),
    };
  }
  if ((artworkFileId === null) !== (artwork === null) ||
      (artwork && artwork.fileId !== artworkFileId)) {
    fail("BAGWIN_ORDER_ARTWORK_REFERENCE_INVALID", `order.lines[${index}] artwork identity is inconsistent.`);
  }
  return {
    sourceLineId: requireString(line.sourceLineId, `order.lines[${index}].sourceLineId`, { max: 160, pattern: ERP_IDENTIFIER_PATTERN }),
    clientLineId: requireString(line.clientLineId, `order.lines[${index}].clientLineId`, { max: 120 }),
    productType: requireString(line.productType, `order.lines[${index}].productType`, { max: 80 }),
    productName: requireString(line.productName, `order.lines[${index}].productName`, { max: 160 }),
    skuId: optionalString(line.skuId, `order.lines[${index}].skuId`, 160),
    size: requireString(line.size, `order.lines[${index}].size`, { max: 120 }),
    colorId: requireString(line.colorId, `order.lines[${index}].colorId`, { max: 120 }),
    bagColor: requireString(line.bagColor, `order.lines[${index}].bagColor`, { max: 120 }),
    handleId: requireString(line.handleId, `order.lines[${index}].handleId`, { max: 120 }),
    handleColor: requireString(line.handleColor, `order.lines[${index}].handleColor`, { max: 120 }),
    quantity: requireInteger(line.quantity, `order.lines[${index}].quantity`),
    artworkFileId,
    artwork,
    specification: requireRecord(line.specification, `order.lines[${index}].specification`),
    quoteSnapshot: requireRecord(line.quoteSnapshot, `order.lines[${index}].quoteSnapshot`),
    inventorySnapshot: requireRecord(line.inventorySnapshot, `order.lines[${index}].inventorySnapshot`),
    estimatedAmount: requireMoney(line.estimatedAmount, `order.lines[${index}].estimatedAmount`),
  };
}

export function validateBagwinCreateEnvelope(value) {
  const envelope = requireRecord(value, "request");
  requireExactKeys(envelope, ["schemaVersion", "sourceOrderNo", "payloadSha256", "order"], "request");
  if (envelope.schemaVersion !== 1) fail("BAGWIN_ORDER_SCHEMA_INVALID", "schemaVersion must be 1.");
  const sourceOrderNo = requireString(envelope.sourceOrderNo, "sourceOrderNo", { pattern: SOURCE_ORDER_PATTERN, max: 20 });
  const payloadSha256 = requireString(envelope.payloadSha256, "payloadSha256", { pattern: DIGEST_PATTERN, max: 64 });

  const order = requireRecord(envelope.order, "order");
  requireExactKeys(order, [
    "schemaVersion", "sourceSystem", "sourceOrderNo", "submittedAt", "customer",
    "placedBy", "delivery", "pricing", "lines",
  ], "order");
  if (order.schemaVersion !== 1 || order.sourceSystem !== "miniapp" || order.sourceOrderNo !== sourceOrderNo) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", "Order source identity does not match the request envelope.");
  }
  const submittedAt = requireString(order.submittedAt, "order.submittedAt", { max: 40 });
  if (Number.isNaN(Date.parse(submittedAt))) fail("BAGWIN_ORDER_SCHEMA_INVALID", "order.submittedAt is invalid.");

  const customer = requireRecord(order.customer, "order.customer");
  requireExactKeys(customer, ["miniappCustomerId", "erpCustomerId", "companyName", "contactName", "mobileMasked"], "order.customer");
  const erpCustomerId = requireString(customer.erpCustomerId, "order.customer.erpCustomerId", { max: 160, pattern: ERP_IDENTIFIER_PATTERN });
  const miniappCustomerId = requireString(customer.miniappCustomerId, "order.customer.miniappCustomerId", { max: 160, pattern: ERP_IDENTIFIER_PATTERN });
  requireString(customer.companyName, "order.customer.companyName", { max: 200 });
  requireString(customer.contactName, "order.customer.contactName", { max: 100 });
  requireString(customer.mobileMasked, "order.customer.mobileMasked", { max: 50 });

  const placedBy = requireRecord(order.placedBy, "order.placedBy");
  requireExactKeys(placedBy, ["name", "phoneMasked", "role"], "order.placedBy");
  requireString(placedBy.name, "order.placedBy.name", { max: 100 });
  requireString(placedBy.phoneMasked, "order.placedBy.phoneMasked", { max: 50 });
  requireString(placedBy.role, "order.placedBy.role", { max: 80 });

  const delivery = requireRecord(order.delivery, "order.delivery");
  requireExactKeys(delivery, ["method", "desiredDate", "desiredTime", "addressSnapshot", "packagingPreference"], "order.delivery");
  requireString(delivery.method, "order.delivery.method", { max: 80 });
  if (delivery.desiredDate !== null) requireString(delivery.desiredDate, "order.delivery.desiredDate", { pattern: DATE_PATTERN, max: 10 });
  if (delivery.desiredTime !== null) requireString(delivery.desiredTime, "order.delivery.desiredTime", { pattern: TIME_PATTERN, max: 5 });
  requireRecord(delivery.addressSnapshot, "order.delivery.addressSnapshot");
  optionalString(delivery.packagingPreference, "order.delivery.packagingPreference", 500);

  const pricing = requireRecord(order.pricing, "order.pricing");
  requireExactKeys(pricing, ["priceVersion", "priceReleaseSha256", "estimatedAmount", "confirmedAmount"], "order.pricing");
  requireString(pricing.priceVersion, "order.pricing.priceVersion", { max: 160 });
  requireString(pricing.priceReleaseSha256, "order.pricing.priceReleaseSha256", { pattern: DIGEST_PATTERN, max: 64 });
  requireMoney(pricing.estimatedAmount, "order.pricing.estimatedAmount");
  if (pricing.confirmedAmount !== null) requireMoney(pricing.confirmedAmount, "order.pricing.confirmedAmount");

  if (!Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > 100) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", "order.lines must contain between 1 and 100 items.");
  }
  const lines = order.lines.map(validateOrderLine);
  if (new Set(lines.map((line) => line.sourceLineId)).size !== lines.length ||
      new Set(lines.map((line) => line.clientLineId)).size !== lines.length) {
    fail("BAGWIN_ORDER_SCHEMA_INVALID", "Order line identifiers must be unique.");
  }
  if (bagwinPayloadSha256(order) !== payloadSha256) {
    throw new BagwinErpIntegrationError(409, "BAGWIN_ORDER_PAYLOAD_DIGEST_CONFLICT", "Order payload digest does not match the submitted order.");
  }
  return { sourceOrderNo, payloadSha256, order, lines, erpCustomerId, miniappCustomerId, submittedAt };
}

export function validateBagwinReconciliationRequest(value, now = new Date()) {
  const request = requireRecord(value, "request");
  requireExactKeys(request, ["schemaVersion", "window"], "request");
  if (request.schemaVersion !== 1) fail("BAGWIN_RECONCILIATION_SCHEMA_INVALID", "schemaVersion must be 1.");
  const window = requireRecord(request.window, "request.window");
  requireExactKeys(window, ["from", "to"], "request.window");
  const fromText = requireString(window.from, "request.window.from", { max: 40 });
  const toText = requireString(window.to, "request.window.to", { max: 40 });
  const from = new Date(fromText);
  const to = new Date(toText);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    fail("BAGWIN_RECONCILIATION_WINDOW_INVALID", "The reconciliation window is invalid.");
  }
  if (to.getTime() - from.getTime() > MAX_RECONCILIATION_WINDOW_MS) {
    fail("BAGWIN_RECONCILIATION_WINDOW_INVALID", "The reconciliation window cannot exceed 31 days.");
  }
  if (to > now) {
    fail("BAGWIN_RECONCILIATION_WINDOW_INCOMPLETE", "The reconciliation window must be complete before export.");
  }
  return { from, to };
}

function readStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function lineSpecificationText(specification, key, max = 500) {
  const value = specification?.[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toRepositoryInput(parsed, priceRelease) {
  const normalizedLines = parsed.lines.map((line) => ({
    clientLineId: line.clientLineId,
    sourceLineId: line.sourceLineId,
    productType: line.productType,
    productName: line.productName,
    skuId: line.skuId,
    size: line.size,
    colorId: line.colorId,
    color: line.bagColor,
    handleId: line.handleId,
    handle: line.handleId,
    handleColor: line.handleColor,
    quantity: line.quantity,
    artworkToken: line.artworkFileId || "",
    artwork: line.artwork,
    printContent: lineSpecificationText(line.specification, "printContent"),
    printColor: lineSpecificationText(line.specification, "printColor"),
    printSide: lineSpecificationText(line.specification, "printSide"),
    printSideMode: lineSpecificationText(line.specification, "printSideMode"),
    specialRequirements: readStringList(line.specification?.specialRequirements).slice(0, 20),
    specialRequirementNote: lineSpecificationText(line.specification, "specialRequirementNote"),
    quoteSnapshot: line.quoteSnapshot,
    inventorySnapshot: line.inventorySnapshot,
    estimatedAmount: line.estimatedAmount,
  }));
  const inventoryStates = parsed.lines.map((line) => String(line.inventorySnapshot?.status ?? "").trim().toLowerCase());
  const inventoryAvailable = inventoryStates.length > 0 && inventoryStates.every((status) => ["available", "sufficient", "库存充足"].includes(status));
  return {
    sourceOrderNo: parsed.sourceOrderNo,
    customerId: parsed.erpCustomerId,
    payloadSha256: parsed.payloadSha256,
    rawPayload: parsed.order,
    normalizedPayload: {
      deliveryMethod: parsed.order.delivery.method,
      desiredDate: parsed.order.delivery.desiredDate || "",
      desiredTime: parsed.order.delivery.desiredTime || "",
      addressId: "",
      address: parsed.order.delivery.addressSnapshot,
      packagingPreference: parsed.order.delivery.packagingPreference,
      customerSnapshot: parsed.order.customer,
      placedBySnapshot: parsed.order.placedBy,
      lines: normalizedLines,
    },
    serverQuote: {
      amount: parsed.order.pricing.estimatedAmount,
      confirmedAmount: parsed.order.pricing.confirmedAmount,
      priceVersion: parsed.order.pricing.priceVersion,
      priceReleaseId: priceRelease.id,
      priceReleaseSha256: parsed.order.pricing.priceReleaseSha256,
      authoritative: true,
      lines: normalizedLines.map((line) => ({
        sourceLineId: line.sourceLineId,
        amount: line.estimatedAmount,
        snapshot: line.quoteSnapshot,
      })),
    },
    inventory: {
      status: inventoryAvailable ? "available" : "confirm",
      label: inventoryAvailable ? "库存充足" : "库存需确认",
      lines: normalizedLines.map((line) => ({ sourceLineId: line.sourceLineId, snapshot: line.inventorySnapshot })),
    },
    receivedAt: new Date(parsed.submittedAt).toISOString(),
  };
}

function statusContains(values, pattern) {
  return readStringList(values).some((value) => pattern.test(value));
}

function shanghaiDateTime(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function projectBagwinPublicStatus(facts, now = new Date()) {
  const intakeStatus = String(facts?.intakeStatus ?? "").trim();
  const draftStatus = String(facts?.draftStatus ?? "").trim();
  const orderStatuses = readStringList(facts?.orderStatuses);
  const lineStatuses = readStringList(facts?.lineStatuses);
  const productionStatuses = readStringList(facts?.productionStatuses);
  const fulfillmentStatuses = readStringList(facts?.fulfillmentStatuses);
  const formalOrderCount = Math.max(0, Number(facts?.formalOrderCount ?? 0));
  const allOrdersCancelled = orderStatuses.length > 0 && orderStatuses.every((value) => /已取消|作废|取消/.test(value));
  const allLinesCancelled = lineStatuses.length > 0 && lineStatuses.every((value) => /已取消|作废/.test(value));
  const allOrdersCompleted = orderStatuses.length > 0 && orderStatuses.every((value) => /已完成|已交付|已关闭/.test(value));
  const allLinesCompleted = lineStatuses.length > 0 && lineStatuses.every((value) => /已完成|已交付|已关闭/.test(value));
  const allFulfillmentsCompleted = fulfillmentStatuses.length > 0 && fulfillmentStatuses.every((value) => /已完成|已交付/.test(value));
  const isTransporting = statusContains(fulfillmentStatuses, /配送中|运输中|已发车|已揽收/);
  const isReadyForDelivery =
    statusContains(fulfillmentStatuses, /已备货|待出库|已出库|待提货|待自提|待发货|待交付/) ||
    statusContains(lineStatuses, /待出库|待交付确认|待交付|待自提|待提货/);
  const isInProductionFlow =
    statusContains(lineStatuses, /待排产|已排产|丝印中|印刷中|待制袋|制袋中|生产中|待打包|补印|跨日继续|待完工确认|异常暂停|数量差异待处理/) ||
    statusContains(productionStatuses, /已发布|待开始|进行中|丝印中|印刷中|制袋中|生产中|跨日继续|待完工确认|异常暂停|数量差异待处理/);

  let status = "confirming";
  if (/rejected/.test(intakeStatus) || /取消|作废|拒绝/.test(draftStatus) || allOrdersCancelled || allLinesCancelled) status = "cancelled";
  else if (/returned/.test(intakeStatus) || /退回|补充/.test(draftStatus)) status = "needs_information";
  else if (allOrdersCompleted || allLinesCompleted || allFulfillmentsCompleted) status = "completed";
  else if (isTransporting) status = "transporting";
  else if (isReadyForDelivery) status = "delivery";
  else if (isInProductionFlow) status = "production";
  else if (formalOrderCount > 0) status = "stocking";

  const notes = {
    confirming: "工厂正在核对价格、库存和交期",
    needs_information: "订单需要补充资料，请联系工厂",
    stocking: "订单已确认，正在备货",
    production: "订单已进入生产流程",
    delivery: "货品已进入交付准备",
    transporting: "货品正在运输中",
    completed: "订单已完成",
    cancelled: "订单已取消",
  };
  const expectedAt = facts?.expectedAt ? new Date(facts.expectedAt) : null;
  const hasExpectedAt = expectedAt && !Number.isNaN(expectedAt.getTime());
  const expected = hasExpectedAt ? shanghaiDateTime(expectedAt) : null;
  const observedAt = facts?.observedAt ? new Date(facts.observedAt) : now;
  return {
    schemaVersion: 1,
    sourceOrderNo: facts.sourceOrderNo,
    erpOrderId: facts.erpOrderId,
    status,
    publicNote: notes[status],
    observedAt: (Number.isNaN(observedAt.getTime()) ? now : observedAt).toISOString(),
    ...(hasExpectedAt ? {
      expectedDeliveryDate: expected.date,
      expectedDeliveryTime: expected.time,
    } : {}),
  };
}

export function createBagwinErpIntegrationService(options = {}) {
  const repository = options.repository;
  const now = options.now ?? (() => new Date());
  if (!repository) throw new Error("A Bagwin ERP integration repository is required.");

  return Object.freeze({
    async findBySourceOrderNo(sourceOrderNo) {
      const normalized = requireString(sourceOrderNo, "sourceOrderNo", { pattern: SOURCE_ORDER_PATTERN, max: 20 });
      const existing = await repository.findBySourceOrderNo(normalized);
      if (!existing) throw new BagwinErpIntegrationError(404, "BAGWIN_ORDER_NOT_FOUND", "Order intake was not found.");
      return { schemaVersion: 1, ...existing };
    },

    async createOrder(value) {
      const parsed = validateBagwinCreateEnvelope(value);
      const existing = await repository.findBySourceOrderNo(parsed.sourceOrderNo);
      if (existing) {
        if (existing.payloadSha256 !== parsed.payloadSha256) {
          throw new BagwinErpIntegrationError(409, "BAGWIN_ORDER_PAYLOAD_CONFLICT", "The source order already exists with a different payload digest.");
        }
        return { schemaVersion: 1, ...existing, disposition: "existing" };
      }
      if (!await repository.customerExists(parsed.erpCustomerId)) {
        throw new BagwinErpIntegrationError(422, "BAGWIN_ERP_CUSTOMER_NOT_FOUND", "The mapped ERP customer does not exist or is not ready for intake.");
      }
      if (!await repository.customerMappingExists({
        miniappCustomerId: parsed.miniappCustomerId,
        erpCustomerId: parsed.erpCustomerId,
      })) {
        throw new BagwinErpIntegrationError(
          422,
          "BAGWIN_CUSTOMER_MAPPING_MISMATCH",
          "The mini-program customer is not mapped to the submitted ERP customer.",
        );
      }
      const priceRelease = await repository.findEffectivePriceRelease({
        priceVersion: parsed.order.pricing.priceVersion,
        payloadSha256: parsed.order.pricing.priceReleaseSha256,
        submittedAt: parsed.submittedAt,
      });
      if (!priceRelease) {
        throw new BagwinErpIntegrationError(
          409,
          "BAGWIN_PRICE_RELEASE_NOT_AUTHORITATIVE",
          "The submitted price version and digest are not authoritative for the order time.",
        );
      }
      const created = await repository.createOrderIntake(toRepositoryInput(parsed, priceRelease));
      return { schemaVersion: 1, ...created };
    },

    async getOrderStatus({ sourceOrderNo, erpOrderId }) {
      const source = requireString(sourceOrderNo, "sourceOrderNo", { pattern: SOURCE_ORDER_PATTERN, max: 20 });
      const erpId = requireString(erpOrderId, "erpOrderId", { pattern: ERP_IDENTIFIER_PATTERN, max: 160 });
      const facts = await repository.getStatus({ sourceOrderNo: source, erpOrderId: erpId });
      if (!facts) throw new BagwinErpIntegrationError(404, "BAGWIN_ORDER_NOT_FOUND", "Order intake was not found.");
      return projectBagwinPublicStatus(facts, now());
    },

    async exportReconciliation(value) {
      const exportedAt = now();
      const window = validateBagwinReconciliationRequest(value, exportedAt);
      const snapshot = await repository.exportReconciliation({
        from: window.from,
        to: window.to,
        limit: MAX_RECONCILIATION_ORDERS + 1,
      });
      const facts = Array.isArray(snapshot?.orders) ? snapshot.orders : [];
      const sourceOrderCount = Number(snapshot?.sourceOrderCount ?? facts.length);
      if (!Number.isSafeInteger(sourceOrderCount) || sourceOrderCount !== facts.length) {
        throw new BagwinErpIntegrationError(500, "BAGWIN_RECONCILIATION_INCOMPLETE", "Reconciliation export completeness could not be proven.");
      }
      if (facts.length > MAX_RECONCILIATION_ORDERS) {
        throw new BagwinErpIntegrationError(422, "BAGWIN_RECONCILIATION_WINDOW_TOO_LARGE", "The reconciliation window contains too many orders; use a smaller window.");
      }
      const orders = facts.map((item) => {
        const projected = projectBagwinPublicStatus(item, exportedAt);
        const sourceSubmittedAt = new Date(item.sourceSubmittedAt);
        if (Number.isNaN(sourceSubmittedAt.getTime()) || sourceSubmittedAt < window.from || sourceSubmittedAt >= window.to) {
          throw new BagwinErpIntegrationError(500, "BAGWIN_RECONCILIATION_INCOMPLETE", "Reconciliation export contains an order outside the requested window.");
        }
        const lines = Array.isArray(item.lines) ? item.lines.map((line) => ({
          skuId: line?.skuId === null || line?.skuId === undefined || String(line.skuId).trim() === ""
            ? null
            : requireString(line.skuId, "reconciliation.lines[].skuId", { max: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/ }),
          quantity: requireInteger(line?.quantity, "reconciliation.lines[].quantity", 1, 1_000_000),
        })) : [];
        if (lines.length < 1 || lines.length > 100) {
          throw new BagwinErpIntegrationError(500, "BAGWIN_RECONCILIATION_INCOMPLETE", "Reconciliation order line evidence is incomplete.");
        }
        const confirmedAmount = item.confirmedAmount === null || item.confirmedAmount === undefined
          ? null
          : requireMoney(item.confirmedAmount, "reconciliation.confirmedAmount");
        return {
          sourceOrderNo: projected.sourceOrderNo,
          sourceSubmittedAt: sourceSubmittedAt.toISOString(),
          erpOrderId: projected.erpOrderId,
          payloadSha256: requireString(item.payloadSha256, "reconciliation.payloadSha256", { max: 64, pattern: DIGEST_PATTERN }),
          status: projected.status,
          observedAt: projected.observedAt,
          confirmedAmount,
          lines,
        };
      }).sort((left, right) => left.sourceOrderNo.localeCompare(right.sourceOrderNo));
      return {
        schemaVersion: 1,
        sourceSystem: "erp",
        exportId: randomUUID(),
        exportedAt: exportedAt.toISOString(),
        window: { from: window.from.toISOString(), to: window.to.toISOString() },
        completeness: {
          status: "complete",
          sourceOrderCount: orders.length,
          exportedOrderCount: orders.length,
          pageCount: 1,
          nextCursor: null,
        },
        orders,
      };
    },
  });
}
