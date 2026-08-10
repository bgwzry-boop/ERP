import { createHash, randomUUID } from "node:crypto";

import { MiniappApiError } from "./miniappApiError.mjs";
import { fingerprintWechatSubject } from "./miniappIdentityService.mjs";

const CUSTOMER_FORBIDDEN_FIELDS = new Set([
  "cost", "costPrice", "materialCost", "margin", "grossMargin", "profit",
  "onHandQty", "reservedQty", "waitingPickupLockedQty", "pendingHandlingQty", "availableQty",
  "zone", "warehouseZone", "inventoryState", "trustLevel", "priceTableId",
  "storageKey", "contentDigest", "employeeId", "employeeName", "machineId", "operatorId",
  "createdBy", "updatedBy", "internalNote", "operationLogs", "auditLogs", "todos",
]);

const MINIAPP_PRODUCT_TYPES = new Set([
  "stock_plain", "stock_printed", "custom_print",
  "laminated_plain", "laminated_printed", "laminated_custom",
]);
const CUSTOM_PRINT_TYPES = new Set(["custom_print", "laminated_custom"]);
const STOCK_PRINTED_TYPES = new Set(["stock_printed", "laminated_printed"]);
const PRINT_SIDE_MODES = new Set(["single", "double", "double_different"]);
const PRINT_POSITION_MODES = new Set(["artwork_default", "factory_standard", "other"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

export function hashMiniappRequest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function projectMiniappCustomerValue(value) {
  if (Array.isArray(value)) return value.map(projectMiniappCustomerValue);
  if (!value || typeof value !== "object") return value;
  return Object.entries(value).reduce((result, [key, item]) => {
    if (!CUSTOMER_FORBIDDEN_FIELDS.has(key)) result[key] = projectMiniappCustomerValue(item);
    return result;
  }, {});
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeSpecialRequirements(value) {
  const allowed = new Set(["extended_handle", "snap_button"]);
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => allowed.has(item)))];
}

function normalizeLine(rawLine, index) {
  const quantity = Number(rawLine && rawLine.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MiniappApiError(422, "LINE_QUANTITY_INVALID", `第 ${index + 1} 项数量必须为大于 0 的整数`, { lineIndex: index, field: "quantity" });
  }
  const productType = text(rawLine.productType);
  const size = text(rawLine.size);
  if (!productType || !size) {
    throw new MiniappApiError(422, "LINE_REQUIRED_FIELD_MISSING", `第 ${index + 1} 项缺少商品类型或尺寸`, { lineIndex: index });
  }
  if (!MINIAPP_PRODUCT_TYPES.has(productType)) {
    throw new MiniappApiError(422, "LINE_PRODUCT_TYPE_INVALID", `第 ${index + 1} 项商品类型不可用`, { lineIndex: index, field: "productType" });
  }
  const normalized = {
    clientLineId: text(rawLine.clientLineId, `L${index + 1}`),
    productType,
    productName: text(rawLine.productName),
    size,
    colorGroup: text(rawLine.colorGroup),
    colorId: text(rawLine.colorId),
    color: text(rawLine.color || rawLine.bagColor),
    handleId: text(rawLine.handleId),
    handle: text(rawLine.handle),
    handleColorId: text(rawLine.handleColorId),
    handleColor: text(rawLine.handleColor),
    patternId: text(rawLine.patternId),
    patternName: text(rawLine.patternName),
    quantity,
    artworkToken: text(rawLine.artworkToken),
    printContent: text(rawLine.printContent),
    printColor: text(rawLine.printColor),
    printColors: Array.isArray(rawLine.printColors) ? rawLine.printColors.map((item) => text(item)).filter(Boolean).slice(0, 4) : [],
    printColorCount: Math.min(4, Math.max(1, Number(rawLine.printColorCount) || 1)),
    printSide: text(rawLine.printSide),
    printSideMode: text(rawLine.printSideMode),
    printPositionMode: text(rawLine.printPositionMode),
    printPositionNote: text(rawLine.printPositionNote),
    specialRequirements: normalizeSpecialRequirements(rawLine.specialRequirements),
    specialRequirementNote: text(rawLine.specialRequirementNote),
  };
  if (!normalized.colorId && !normalized.color) {
    throw new MiniappApiError(422, "LINE_COLOR_REQUIRED", `第 ${index + 1} 项请选择袋子颜色`, { lineIndex: index, field: "colorId" });
  }
  if (!normalized.handleId && !normalized.handle) {
    throw new MiniappApiError(422, "LINE_HANDLE_REQUIRED", `第 ${index + 1} 项请选择提手`, { lineIndex: index, field: "handleId" });
  }
  if (STOCK_PRINTED_TYPES.has(productType) && !normalized.patternId && !normalized.patternName) {
    throw new MiniappApiError(422, "LINE_PATTERN_REQUIRED", `第 ${index + 1} 项请选择现货印刷图案`, { lineIndex: index, field: "patternId" });
  }
  if (CUSTOM_PRINT_TYPES.has(productType)) {
    const required = [
      ["artworkToken", normalized.artworkToken, "请上传印刷稿件"],
      ["printContent", normalized.printContent, "请填写印刷内容"],
      ["printColors", normalized.printColors.length, "请选择印刷颜色"],
      ["printSideMode", normalized.printSideMode, "请选择印刷面"],
      ["printPositionMode", normalized.printPositionMode, "请选择印刷位置"],
    ].find(([, value]) => !value);
    if (required) {
      throw new MiniappApiError(422, "CUSTOM_PRINT_FIELD_REQUIRED", `第 ${index + 1} 项${required[2]}`, { lineIndex: index, field: required[0] });
    }
    if (normalized.printColors.length !== normalized.printColorCount) {
      throw new MiniappApiError(422, "PRINT_COLOR_COUNT_MISMATCH", `第 ${index + 1} 项印刷色数与所选颜色不一致`, { lineIndex: index, field: "printColors" });
    }
    if (!PRINT_SIDE_MODES.has(normalized.printSideMode)) {
      throw new MiniappApiError(422, "PRINT_SIDE_INVALID", `第 ${index + 1} 项印刷面不可用`, { lineIndex: index, field: "printSideMode" });
    }
    if (!PRINT_POSITION_MODES.has(normalized.printPositionMode)) {
      throw new MiniappApiError(422, "PRINT_POSITION_INVALID", `第 ${index + 1} 项印刷位置不可用`, { lineIndex: index, field: "printPositionMode" });
    }
    if (normalized.printPositionMode === "other" && !normalized.printPositionNote) {
      throw new MiniappApiError(422, "PRINT_POSITION_NOTE_REQUIRED", `第 ${index + 1} 项请填写印刷位置备注`, { lineIndex: index, field: "printPositionNote" });
    }
  }
  return normalized;
}

export function normalizeMiniappOrderPayload(payload) {
  const lines = Array.isArray(payload && payload.lines) ? payload.lines : [];
  if (!lines.length || lines.length > 50) {
    throw new MiniappApiError(422, "ORDER_LINES_INVALID", "订单需包含 1–50 个商品明细");
  }
  const normalizedLines = lines.map(normalizeLine);
  const clientLineIds = new Set(normalizedLines.map((line) => line.clientLineId));
  if (clientLineIds.size !== normalizedLines.length) {
    throw new MiniappApiError(422, "CLIENT_LINE_ID_DUPLICATE", "同一订单中的商品明细编号不能重复");
  }
  return {
    deliveryMethod: text(payload.deliveryMethod),
    desiredDate: text(payload.desiredDate),
    desiredTime: text(payload.desiredTime),
    addressId: text(payload.addressId),
    address: text(payload.address),
    packagingPreference: text(payload.packagingPreference),
    lines: normalizedLines,
  };
}

function assertIdempotencyKey(value) {
  const key = text(value);
  if (key.length < 8 || key.length > 128) {
    throw new MiniappApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "提交订单需要有效的幂等键，请返回确认页重试");
  }
  return key;
}

export function createMiniappBffService(options) {
  const repository = options.repository;
  const erpAdapter = options.erpAdapter;
  const identityProvider = options.identityProvider;
  const accessTokens = options.accessTokens;
  const identityPepper = String(options.identityPepper || "");
  const now = options.now || (() => new Date());
  if (!repository || !erpAdapter || !identityProvider || !accessTokens) throw new Error("Miniapp BFF dependencies are required");

  async function requireActiveSession(token) {
    const session = accessTokens.verify(token);
    const binding = await repository.getActiveBinding(session.bindingId);
    if (!binding || binding.customerId !== session.customerId) {
      throw new MiniappApiError(401, "BINDING_INACTIVE", "当前微信账号尚未绑定可下单客户");
    }
    return { bindingId: binding.id, customerId: binding.customerId };
  }

  return {
    async createSession(code) {
      if (!text(code)) throw new MiniappApiError(400, "WECHAT_CODE_REQUIRED", "缺少微信登录凭证");
      const identity = await identityProvider.exchange(code);
      const subject = identity.unionId || identity.openId;
      const externalSubjectFingerprint = fingerprintWechatSubject(subject, identityPepper);
      const binding = await repository.findActiveBinding({ channel: "wechat_mini_program", externalSubjectFingerprint });
      if (!binding) throw new MiniappApiError(403, "CUSTOMER_NOT_BOUND", "当前微信账号尚未开通下单权限，请联系工厂绑定客户资料");
      return { ...accessTokens.issue(binding), customerBinding: "bound" };
    },

    requireActiveSession,

    async getBootstrap(context) { return projectMiniappCustomerValue(await erpAdapter.getBootstrap(context)); },
    async getCatalog(context) { return projectMiniappCustomerValue(await erpAdapter.getCatalog(context)); },
    async getCustomerDefaults(context) { return projectMiniappCustomerValue(await erpAdapter.getCustomerDefaults(context)); },
    async previewQuote(context, draft) { return projectMiniappCustomerValue(await erpAdapter.previewQuote(context, draft)); },
    async previewSpecialQuote(context, draft) { return projectMiniappCustomerValue(await erpAdapter.previewSpecialQuote(context, draft)); },
    async checkInventory(context, draft) { return projectMiniappCustomerValue(await erpAdapter.checkInventory(context, draft)); },

    async createOrder(context, payload, idempotencyKey) {
      const normalizedPayload = normalizeMiniappOrderPayload(payload);
      const key = assertIdempotencyKey(idempotencyKey);
      const requestHash = hashMiniappRequest(payload);
      const quoteLines = [];
      const inventoryLines = [];
      for (const line of normalizedPayload.lines) {
        quoteLines.push(projectMiniappCustomerValue(await erpAdapter.previewQuote(context, line)));
        inventoryLines.push(projectMiniappCustomerValue(await erpAdapter.checkInventory(context, line)));
      }
      const amount = quoteLines.reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
      const priceVersions = [...new Set(quoteLines.map((quote) => quote.priceVersion).filter(Boolean))];
      const inventory = erpAdapter.summarizeInventory
        ? erpAdapter.summarizeInventory(inventoryLines)
        : { status: inventoryLines.every((item) => item.status === "available") ? "available" : "confirm", label: inventoryLines.every((item) => item.status === "available") ? "库存充足" : "库存需确认" };
      return repository.createSubmissionWithDraft({
        bindingId: context.bindingId,
        customerId: context.customerId,
        externalSubmissionId: randomUUID(),
        idempotencyScope: `mini_program:${context.bindingId}:orders`,
        idempotencyKey: key,
        requestHash,
        rawPayload: payload,
        normalizedPayload,
        serverQuote: { amount: Number(amount.toFixed(2)), priceVersion: priceVersions.join(","), authoritative: false, lines: quoteLines },
        inventory: { ...inventory, lines: inventoryLines },
        receivedAt: now().toISOString(),
      });
    },

    async getOrders(context) { return projectMiniappCustomerValue(await repository.listOrdersForCustomer(context.customerId)); },

    async getOrder(context, orderId) {
      const order = await repository.getOrderForCustomer(context.customerId, orderId);
      if (!order) throw new MiniappApiError(404, "ORDER_NOT_FOUND", "没有找到该订单");
      return projectMiniappCustomerValue(order);
    },
  };
}
