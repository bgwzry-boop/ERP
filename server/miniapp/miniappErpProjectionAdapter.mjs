import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";
import { MiniappApiError } from "./miniappApiError.mjs";
import { createMiniappCatalogPolicy } from "./miniappCatalogPolicy.mjs";
import {
  calculateSpecialBagPricing,
  defaultMaterialPriceSnapshot,
  specialBagPricingRules,
} from "../../shared/pricing/specialBagPricing.js";

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

export function normalizeMiniappSize(value) {
  const normalized = clean(value).replaceAll("×", "*").replaceAll(" ", "");
  return ["30*38", "30*38*10", "30*37"].includes(normalized) ? "30*37*10" : normalized;
}

function handleCandidates(handleId, handleLabel = "") {
  return handleId === "extended" || /加长/.test(handleLabel)
    ? ["extended", "加长提", "加长提手"]
    : ["regular", "普通提", "默认提", "普通提手"];
}

function styleCandidates(line) {
  const productType = lower(line.productType);
  const pattern = [lower(line.patternId), lower(line.patternName)].filter(Boolean);
  if (productType === "stock_printed" || productType === "laminated_printed") {
    return [...pattern, ...pattern.map((item) => `${item}-bag`), ...pattern.map((item) => `${item}_bag`)];
  }
  if (productType.startsWith("laminated")) return [productType, "laminated", "laminated_plain", "覆膜袋"];
  return [productType, "stock_plain", "custom_print", "blank-bag", "blank_bag", "空白袋"];
}

function colorMatches(item, line) {
  if (!item.standardColorId) return true;
  const candidates = new Set([lower(line.colorId), lower(line.color), lower(line.bagColor)].filter(Boolean));
  return [item.standardColorId, item.colorKey, item.colorName].some((value) => candidates.has(lower(value)));
}

function priceSpecificity(item, line) {
  let score = Number(item.minQty || 0) / 1_000_000;
  if (item.standardColorId && colorMatches(item, line)) score += 4;
  if (handleCandidates(line.handleId, line.handle).map(lower).includes(lower(item.handleType))) score += 2;
  if (styleCandidates(line).includes(lower(item.styleKey))) score += 1;
  return score;
}

function findPriceItem(master, line) {
  const size = normalizeMiniappSize(line.size);
  const requestedHandles = handleCandidates(line.handleId, line.handle).map(lower);
  const requestedStyles = styleCandidates(line);
  const quantity = Math.max(1, Number(line.quantity) || 1);
  const extendedHandle = line.handleId === "extended" || /加长/.test(clean(line.handle));
  const matchingSize = master.priceItems.filter((item) => normalizeMiniappSize(item.size || item.sizeKey) === size);
  const exact = matchingSize.filter((item) =>
    colorMatches(item, line)
    && (item.handleType ? requestedHandles.includes(lower(item.handleType)) : !extendedHandle)
    && (!item.styleKey || requestedStyles.includes(lower(item.styleKey)))
    && (!item.minQty || Number(item.minQty) <= quantity)
  ).sort((a, b) => priceSpecificity(b, line) - priceSpecificity(a, line));
  if (exact[0]) return { item: exact[0], handleFallback: false };

  if (extendedHandle) {
    const regularHandles = handleCandidates("regular").map(lower);
    const fallback = matchingSize.filter((item) =>
      colorMatches(item, line)
      && (!item.handleType || regularHandles.includes(lower(item.handleType)))
      && (!item.styleKey || requestedStyles.includes(lower(item.styleKey)))
      && (!item.minQty || Number(item.minQty) <= quantity)
    ).sort((a, b) => priceSpecificity(b, line) - priceSpecificity(a, line));
    if (fallback[0]) return { item: fallback[0], handleFallback: true };
  }
  return null;
}

function printUnitPrice(quantity, printSide, configuredPrice) {
  if (Number(configuredPrice) > 0) return Number(configuredPrice);
  if (quantity >= 10_000) return 0.06;
  if (quantity >= 5_000) return 0.08;
  if (quantity >= 3_000) return 0.09;
  return /double|双面/.test(clean(printSide)) ? 0.13 : 0.09;
}

function isPrintingRequired(line) {
  return ["custom_print", "laminated_custom"].includes(lower(line.productType))
    || Boolean(clean(line.artworkToken) || clean(line.printContent) || clean(line.printColor));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function buildMiniappSpecialMaterialPriceQuery(input = {}) {
  const parameters = createPostgresParameterBinder();
  const requiredBodyWidthCm = Number(input.heightCm) * 2
    + Number(input.gussetCm)
    + Number(specialBagPricingRules.defaults.foldCm) * 2;
  const bodyGsm = Number(specialBagPricingRules.defaults.bodyGsm);
  const handleWidthCm = Number(specialBagPricingRules.defaults.handleWidthCm);
  const handleGsm = Number(specialBagPricingRules.defaults.handleGsm);
  return {
    text: `
WITH expanded AS (
  SELECT
    inbound.id AS inbound_id,
    inbound.supplier_name,
    inbound.updated_at,
    COALESCE(NULLIF(roll ->> 'id', ''), inbound.id) AS batch_id,
    COALESCE(NULLIF(roll ->> 'materialType', ''), NULLIF(inbound.payload_json ->> 'materialType', ''), '') AS material_type,
    COALESCE(NULLIF(roll ->> 'productName', ''), NULLIF(inbound.payload_json ->> 'productName', ''), '') AS product_name,
    COALESCE(NULLIF(roll ->> 'inventoryStatus', ''), '') AS inventory_status,
    COALESCE(NULLIF(roll ->> 'widthCm', ''), NULLIF(inbound.payload_json ->> 'widthCm', ''), '0') AS width_text,
    COALESCE(NULLIF(roll ->> 'gramWeightGsm', ''), NULLIF(inbound.payload_json ->> 'gramWeightGsm', ''), '0') AS gsm_text,
    COALESCE(NULLIF(roll ->> 'unitPrice', ''), NULLIF(inbound.payload_json ->> 'unitPrice', ''), '0') AS unit_price_text
  FROM raw_material_inbounds AS inbound
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(inbound.payload_json -> 'rolls') = 'array'
        AND jsonb_array_length(inbound.payload_json -> 'rolls') > 0
      THEN inbound.payload_json -> 'rolls'
      ELSE jsonb_build_array(inbound.payload_json)
    END
  ) AS roll
), eligible AS (
  SELECT
    *,
    CASE WHEN width_text ~ '^[0-9]+([.][0-9]+)?$' THEN width_text::numeric ELSE 0 END AS width_cm,
    CASE WHEN gsm_text ~ '^[0-9]+([.][0-9]+)?$' THEN gsm_text::numeric ELSE 0 END AS gsm,
    CASE WHEN unit_price_text ~ '^[0-9]+([.][0-9]+)?$' THEN unit_price_text::numeric ELSE 0 END AS yuan_per_kg,
    (material_type || ' ' || product_name) AS material_label
  FROM expanded
  WHERE inventory_status IN ('可用', '机边领用', '已消耗')
), body_candidate AS (
  SELECT supplier_name, batch_id, updated_at, yuan_per_kg
  FROM eligible
  WHERE material_label !~ '提手'
    AND material_label ~ '(布|无纺|卷料)'
    AND width_cm = ${parameters.number(requiredBodyWidthCm)}
    AND gsm = ${parameters.number(bodyGsm)}
    AND yuan_per_kg > 0
  ORDER BY updated_at DESC, inbound_id DESC
  LIMIT 1
), handle_candidate AS (
  SELECT supplier_name, batch_id, updated_at, yuan_per_kg
  FROM eligible
  WHERE material_label ~ '提手'
    AND width_cm = ${parameters.number(handleWidthCm)}
    AND gsm = ${parameters.number(handleGsm)}
    AND yuan_per_kg > 0
  ORDER BY updated_at DESC, inbound_id DESC
  LIMIT 1
)
SELECT json_build_object(
  'body', (SELECT row_to_json(body_candidate) FROM body_candidate),
  'handle', (SELECT row_to_json(handle_candidate) FROM handle_candidate)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function resolveMiniappSpecialMaterialPriceSnapshot(result = {}) {
  const body = result?.body && Number(result.body.yuan_per_kg) > 0 ? result.body : null;
  const handle = result?.handle && Number(result.handle.yuan_per_kg) > 0 ? result.handle : null;
  if (!body && !handle) return defaultMaterialPriceSnapshot;
  const effectiveDates = [body?.updated_at, handle?.updated_at].filter(Boolean).map((value) => new Date(value));
  const effectiveFrom = effectiveDates.length
    ? new Date(Math.max(...effectiveDates.map((value) => value.getTime()))).toISOString()
    : new Date().toISOString();
  const bodyBatch = clean(body?.batch_id) || defaultMaterialPriceSnapshot.body.batchId || "fallback-body";
  const handleBatch = clean(handle?.batch_id) || defaultMaterialPriceSnapshot.handle.batchId || "fallback-handle";
  return {
    schemaVersion: "luxing-special-bag-material-price/v1",
    version: `ERP-MATERIAL-${bodyBatch}-${handleBatch}`,
    effectiveFrom,
    source: "erp_supplier_batch",
    currency: "CNY",
    provisional: !body || !handle,
    body: body ? {
      materialType: "nonwoven_body",
      supplierId: clean(body.supplier_name),
      batchId: clean(body.batch_id),
      yuanPerTon: Number(body.yuan_per_kg) * 1_000,
    } : defaultMaterialPriceSnapshot.body,
    handle: handle ? {
      materialType: "nonwoven_handle_strip",
      supplierId: clean(handle.supplier_name),
      batchId: clean(handle.batch_id),
      yuanPerTon: Number(handle.yuan_per_kg) * 1_000,
    } : defaultMaterialPriceSnapshot.handle,
  };
}

function specialQuoteSize(input) {
  return [input.widthCm, input.heightCm, input.gussetCm]
    .map((value) => Number(Number(value).toFixed(2)).toString())
    .join("×");
}

function validateSpecialQuoteInput(input = {}) {
  if (input.materialType === "laminated_nonwoven") return;
  const bounds = specialBagPricingRules.bounds;
  const fields = [
    ["widthCm", "袋子宽度", bounds.minWidthCm, bounds.maxWidthCm],
    ["heightCm", "袋子高度", bounds.minHeightCm, bounds.maxHeightCm],
    ["gussetCm", "袋子侧宽", bounds.minGussetCm, bounds.maxGussetCm],
    ["quantity", "订单数量", bounds.minQuantity, bounds.maxQuantity],
  ];
  for (const [field, label, minimum, maximum] of fields) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < minimum || value > maximum || (field === "quantity" && !Number.isInteger(value))) {
      throw new MiniappApiError(422, "SPECIAL_QUOTE_INVALID", `${label}需在 ${minimum}–${maximum} 之间`, { field });
    }
  }
  const requirements = Array.isArray(input.specialRequirements) ? input.specialRequirements : [];
  const extended = input.handleId === "extended";
  if (extended !== requirements.includes("extended_handle")) {
    throw new MiniappApiError(422, "SPECIAL_QUOTE_INVALID", "提手规格与加长提选项不一致", { field: "specialRequirements" });
  }
}

export function previewSpecialBagQuote(input = {}, catalog = {}, materialPriceSnapshot = defaultMaterialPriceSnapshot) {
  validateSpecialQuoteInput(input);
  if (input.materialType === "laminated_nonwoven") {
    return { available: false, priceStatus: "not_available", materialType: input.materialType, note: "覆膜无纺布手提袋特殊尺寸报价暂未上线" };
  }
  const cost = calculateSpecialBagPricing(input, specialBagPricingRules, materialPriceSnapshot);
  const quantity = Number(input.quantity);
  const requirements = [...new Set(Array.isArray(input.specialRequirements) ? input.specialRequirements : [])];
  const printing = input.printingMode === "screen";
  const printUnit = printing ? printUnitPrice(quantity, input.printSide) : 0;
  const snapUnit = requirements.includes("snap_button") ? Number(catalog.specialRequirementRules?.snapButtonAddon || 0.1) : 0;
  const bagAmount = roundMoney(cost.bagUnitPrice * quantity);
  const handleAmount = roundMoney(cost.handleUnitAddon * quantity);
  const printAmount = roundMoney(printUnit * quantity);
  const snapButtonAmount = roundMoney(snapUnit * quantity);
  const size = specialQuoteSize(input);
  const standardMatch = (catalog.regularSizes || []).find((item) => item.customerVisible !== false && normalizeMiniappSize(item.label) === normalizeMiniappSize(size));
  return {
    priceVersion: cost.ruleVersion,
    materialPriceVersion: cost.materialPriceVersion,
    materialPricePolicy: "提交订单前按 ERP 最新已确认供应商/批次价格重算",
    priceLocked: false,
    available: true,
    materialType: "nonwoven",
    materialTypeLabel: "无纺布手提袋",
    size,
    quantity,
    bagColor: clean(input.bagColor),
    handleColor: clean(input.handleColor),
    handleId: input.handleId === "extended" ? "extended" : "regular",
    specialRequirements: requirements,
    specialRequirementsText: requirements.map((item) => item === "extended_handle" ? "加长提" : "按扣").join("、"),
    bagBaseUnitPrice: cost.baseUnitCostWithRegularHandle,
    specialSizeAddon: cost.specialCustomizationUnitFee,
    bagUnitPrice: cost.bagUnitPrice,
    bagAmount,
    printingMode: printing ? "screen" : "none",
    printSide: clean(input.printSide) || "single",
    printUnitPrice: roundMoney(printUnit),
    printAmount,
    handleUnitAddon: cost.handleUnitAddon,
    handleAmount,
    snapButtonUnitAddon: roundMoney(snapUnit),
    snapButtonAmount,
    estimatedAmount: roundMoney(bagAmount + handleAmount + printAmount + snapButtonAmount),
    excludedFees: ["运费", "税费"],
    plateFeeIncluded: printing,
    standardMatch: standardMatch ? { id: standardMatch.id, label: standardMatch.label } : null,
    authoritative: false,
    priceStatus: standardMatch ? "standard_available" : "factory_confirmation",
    note: standardMatch ? "该尺寸已有标准价格，请从常规选品下单" : "当前为统一规则生成的预估费用，正式价格以工厂确认结果为准",
  };
}

function requireCustomerScope(scope) {
  if (!scope || !scope.customer || !scope.customer.id) {
    throw new MiniappApiError(403, "CUSTOMER_SCOPE_NOT_AVAILABLE", "当前客户资料不可用，请联系工厂");
  }
  return scope;
}

function requireCatalogMaster(master) {
  if (!master || !master.priceTable || !master.priceTable.id) {
    throw new MiniappApiError(409, "CUSTOMER_PRICE_TABLE_NOT_CONFIGURED", "当前客户尚未配置可用价格表，请联系工厂");
  }
  if (!Array.isArray(master.priceItems) || !master.priceItems.length) {
    throw new MiniappApiError(409, "CUSTOMER_PRICE_ITEMS_NOT_READY", "当前客户价格表尚未补齐，请联系工厂");
  }
  return master;
}

export function buildMiniappCustomerScopeQuery(customerId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT jsonb_build_object(
  'customer', jsonb_build_object(
    'id', customer.id,
    'name', customer.name,
    'companyName', customer.name,
    'shortName', COALESCE(customer.short_name, ''),
    'contactName', COALESCE(contact.contact_name, ''),
    'phone', COALESCE(contact.phone, ''),
    'mobileMasked', CASE
      WHEN char_length(COALESCE(contact.phone, '')) >= 7
        THEN left(contact.phone, 3) || ' **** ' || right(contact.phone, 4)
      ELSE COALESCE(contact.phone, '')
    END,
    'addressId', COALESCE(address.id, ''),
    'address', COALESCE(address.address, ''),
    'deliveryMethod', COALESCE(address.default_fulfillment_method, '到厂自提'),
    'packagingPreference', COALESCE(address.remark, ''),
    'desiredDate', '',
    'desiredTime', '13:30',
    'printColorUsage', '[]'::jsonb
  ),
  'pendingCount', (
    SELECT count(*)
    FROM order_intake_submissions AS submission
    WHERE submission.customer_id = customer.id
      AND submission.status IN ('received', 'validating', 'draft_created', 'office_review', 'returned')
  ),
  'pendingReply', '提交后工厂将尽快确认',
  'reorder', (
    SELECT submission.normalized_payload_json->'lines'->0
    FROM order_intake_submissions AS submission
    WHERE submission.customer_id = customer.id
      AND submission.status <> 'rejected'
    ORDER BY submission.received_at DESC, submission.id DESC
    LIMIT 1
  ),
  'announcement', NULL
) AS result
FROM customers AS customer
LEFT JOIN LATERAL (
  SELECT * FROM customer_contacts
  WHERE customer_id = customer.id
  ORDER BY is_default DESC, updated_at DESC, id DESC
  LIMIT 1
) AS contact ON true
LEFT JOIN LATERAL (
  SELECT * FROM customer_addresses
  WHERE customer_id = customer.id
  ORDER BY is_default DESC, updated_at DESC, id DESC
  LIMIT 1
) AS address ON true
WHERE customer.id = ${parameters.text(customerId)}
  AND customer.enabled = true
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildMiniappCatalogMasterQuery(customerId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT jsonb_build_object(
  'priceTable', jsonb_build_object(
    'id', price_table.id,
    'bizNo', price_table.biz_no,
    'name', price_table.name,
    'versionNo', price_table.version_no,
    'effectiveFrom', price_table.effective_from,
    'effectiveTo', price_table.effective_to
  ),
  'priceItems', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', item.id,
      'sizeKey', COALESCE(item.size_key, ''),
      'size', COALESCE(size_spec.display_name, item.size_key, ''),
      'standardColorId', COALESCE(item.standard_color_id, ''),
      'colorKey', COALESCE(color.color_key, ''),
      'colorName', COALESCE(color.name, ''),
      'handleType', COALESCE(item.handle_type, ''),
      'styleKey', COALESCE(item.style_key, ''),
      'bagPrice', item.bag_price,
      'printPrice', item.print_price,
      'otherFee', item.other_fee,
      'minQty', item.min_qty
    ) ORDER BY item.size_key, item.style_key, item.handle_type, item.min_qty)
    FROM price_table_items AS item
    LEFT JOIN size_specs AS size_spec ON size_spec.size_key = item.size_key
    LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
    WHERE item.price_table_id = price_table.id
      AND item.enabled = true
  ), '[]'::jsonb),
  'colors', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', color.id, 'colorKey', color.color_key, 'name', color.name) ORDER BY color.name)
    FROM standard_colors AS color
    WHERE color.enabled = true
  ), '[]'::jsonb),
  'sizes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', size_spec.id, 'sizeKey', size_spec.size_key, 'displayName', size_spec.display_name, 'metadata', size_spec.metadata_json) ORDER BY size_spec.display_name)
    FROM size_specs AS size_spec
    WHERE size_spec.enabled = true
  ), '[]'::jsonb)
) AS result
FROM customers AS customer
JOIN price_tables AS price_table ON price_table.id = customer.price_table_id
WHERE customer.id = ${parameters.text(customerId)}
  AND customer.enabled = true
  AND price_table.status = 'active'
  AND (price_table.effective_from IS NULL OR price_table.effective_from <= now())
  AND (price_table.effective_to IS NULL OR price_table.effective_to > now())
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildMiniappInventoryMatchQuery(line) {
  const parameters = createPostgresParameterBinder();
  const normalizedSize = normalizeMiniappSize(line.size);
  const colors = [lower(line.colorId), lower(line.color), lower(line.bagColor)].filter(Boolean);
  const handles = handleCandidates(line.handleId, line.handle).map(lower);
  const styles = styleCandidates(line);
  return {
    text: `
SELECT jsonb_build_object(
  'matched', count(*) > 0,
  'availableQty', COALESCE(sum(GREATEST(
    item.on_hand_qty - item.reserved_qty - item.waiting_pickup_locked_qty - item.pending_handling_qty,
    0
  )), 0)
) AS result
FROM inventory_items AS item
LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
WHERE (
  CASE
    WHEN regexp_replace(replace(item.size, '×', '*'), '\\s', '', 'g') IN ('30*38', '30*38*10', '30*37') THEN '30*37*10'
    ELSE regexp_replace(replace(item.size, '×', '*'), '\\s', '', 'g')
  END
) = ${parameters.text(normalizedSize)}
  AND lower(COALESCE(item.handle_type, '')) = ANY(${parameters.textArray(handles)})
  AND lower(COALESCE(item.style, '')) = ANY(${parameters.textArray(styles)})
  AND (
    ${parameters.textArray(colors)} = ARRAY[]::text[]
    OR lower(COALESCE(color.id, '')) = ANY(${parameters.textArray(colors)})
    OR lower(COALESCE(color.color_key, '')) = ANY(${parameters.textArray(colors)})
    OR lower(COALESCE(color.name, '')) = ANY(${parameters.textArray(colors)})
  );
`.trim(),
    values: parameters.values,
  };
}

export function createPostgresMiniappErpProjectionAdapter(options = {}) {
  const postgresClient = options.postgresClient || (options.queryJson ? null : createPostgresPoolClient(options));
  const queryJson = options.queryJson || ((text, values) => postgresClient.queryJson(text, values));
  const catalogPolicy = options.catalogPolicy || createMiniappCatalogPolicy;

  async function loadCustomerScope(context) {
    const query = buildMiniappCustomerScopeQuery(context.customerId);
    return requireCustomerScope(await queryJson(query.text, query.values));
  }

  async function loadCatalogMaster(context) {
    const query = buildMiniappCatalogMasterQuery(context.customerId);
    return requireCatalogMaster(await queryJson(query.text, query.values));
  }

  async function loadSpecialMaterialPriceSnapshot(input) {
    if (typeof options.loadSpecialMaterialPriceSnapshot === "function") {
      return options.loadSpecialMaterialPriceSnapshot(input);
    }
    const query = buildMiniappSpecialMaterialPriceQuery(input);
    return resolveMiniappSpecialMaterialPriceSnapshot(await queryJson(query.text, query.values));
  }

  return {
    kind: "postgres_erp_projection",
    async getBootstrap(context) {
      return loadCustomerScope(context);
    },
    async getCustomerDefaults(context) {
      return (await loadCustomerScope(context)).customer;
    },
    async getCatalog(context) {
      return catalogPolicy(await loadCatalogMaster(context));
    },
    async previewQuote(context, line) {
      const master = await loadCatalogMaster(context);
      const match = findPriceItem(master, line);
      if (!match) {
        throw new MiniappApiError(422, "PRICE_NOT_CONFIGURED", `规格 ${clean(line.size)} 暂无可用价格，请联系工厂`);
      }
      const quantity = Math.max(1, Number(line.quantity) || 1);
      const bagUnitPrice = Number(match.item.bagPrice || 0) + (match.handleFallback ? 0.03 : 0);
      const colorCount = Math.min(4, Math.max(1, Number(line.printColorCount) || 1));
      const printing = isPrintingRequired(line);
      const printingUnit = printing ? printUnitPrice(quantity, line.printSideMode || line.printSide, match.item.printPrice) * colorCount : 0;
      const requirements = Array.isArray(line.specialRequirements) ? line.specialRequirements : [];
      const snapUnit = requirements.includes("snap_button") ? 0.1 : 0;
      const unitPrice = roundMoney(bagUnitPrice + printingUnit + snapUnit);
      const otherFee = Number(match.item.otherFee || 0);
      return {
        priceVersion: `${master.priceTable.bizNo || master.priceTable.id}-v${Number(master.priceTable.versionNo) || 1}`,
        basePrice: roundMoney(Number(match.item.bagPrice || 0)),
        handleAddon: match.handleFallback ? 0.03 : 0,
        printColorCount: printing ? colorCount : 0,
        printFeePerColor: printing ? roundMoney(printingUnit / colorCount) : 0,
        printFee: roundMoney(printingUnit),
        specialRequirementAddon: snapUnit,
        unitPrice,
        quantity,
        amount: roundMoney(unitPrice * quantity + otherFee),
        excludedFees: ["运费", "税费"],
        plateFeeIncluded: printing,
        authoritative: false,
        note: printing
          ? "预估金额，私印费用已含制版；运费、税费另计，提交后由工厂复核"
          : "预估金额；运费、税费另计，提交后由工厂复核",
      };
    },
    async previewSpecialQuote(context, input) {
      const [master, materialPriceSnapshot] = await Promise.all([
        loadCatalogMaster(context),
        loadSpecialMaterialPriceSnapshot(input),
      ]);
      return previewSpecialBagQuote(input, catalogPolicy(master), materialPriceSnapshot);
    },
    async checkInventory(_context, line) {
      const query = buildMiniappInventoryMatchQuery(line);
      const result = await queryJson(query.text, query.values);
      if (!result || !result.matched) return { status: "confirm", label: "库存需确认", note: "没有匹配到已清点的完整 SKU" };
      const availableQty = Math.max(0, Number(result.availableQty) || 0);
      const quantity = Math.max(1, Number(line.quantity) || 1);
      if (availableQty >= quantity) return { status: "available", label: "库存充足", note: "库存变化较快，提交时将再次核验" };
      if (availableQty === 0) return { status: "unavailable", label: "暂时缺货", note: "可提交工厂确认补货或生产安排" };
      return { status: "confirm", label: "库存需确认", note: "当前库存可能不足以覆盖本次数量" };
    },
    summarizeInventory(lines) {
      if (lines.some((item) => item.status === "unavailable")) return { status: "unavailable", label: "部分商品暂时缺货" };
      if (lines.some((item) => item.status !== "available")) return { status: "confirm", label: "部分商品库存需确认" };
      return { status: "available", label: "库存充足" };
    },
  };
}
