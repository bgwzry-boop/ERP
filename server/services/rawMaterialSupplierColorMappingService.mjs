import { createHash } from "node:crypto";
import {
  RAW_MATERIAL_FACTORY_COLORS,
  RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE,
  normalizeRawMaterialSupplierColor,
  normalizeRawMaterialSupplierSourceId,
} from "../../shared/rawMaterialFactoryColors.js";

export function createRawMaterialSupplierColorMappingService(dependencies = {}) {
  const { buildOperationLog, now = () => new Date() } = dependencies;
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return {
    listMappings,
    listOptions: listSupplierColorMappingOptions,
    saveMapping,
  };

  async function saveMapping({ workspace, body = {}, operatorId }) {
    const supplierName = cleanText(body.supplierName);
    const supplierSourceId = normalizeRawMaterialSupplierSourceId(body.supplierSourceId || supplierName);
    const supplierColor = normalizeRawMaterialSupplierColor(body.supplierColor);
    const factoryColor = cleanText(body.factoryColor);
    const reason = cleanText(body.reason);
    if (!supplierName || !supplierSourceId) return businessError(400, "RAW_MATERIAL_COLOR_SUPPLIER_REQUIRED", "请选择供应商。");
    if (!supplierColor) return businessError(400, "RAW_MATERIAL_COLOR_ALIAS_REQUIRED", "请填写该厂家票面颜色。");
    if (!RAW_MATERIAL_FACTORY_COLORS.includes(factoryColor)) {
      return businessError(400, "RAW_MATERIAL_FACTORY_COLOR_INVALID", "请选择有效的厂内标准色。");
    }
    if (!reason) return businessError(400, "RAW_MATERIAL_COLOR_MAPPING_REASON_REQUIRED", "请填写修改原因。");

    const timestamp = now().toISOString();
    const standardColors = Array.isArray(workspace.standardColors) ? workspace.standardColors : [];
    const existingStandardColor = standardColors.find((item) => cleanText(item?.name) === factoryColor);
    const standardColor = existingStandardColor ?? {
      id: stableId("SC-RM", factoryColor),
      colorKey: stableId("rm-color", factoryColor).toLowerCase(),
      name: factoryColor,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const aliases = Array.isArray(workspace.colorAliases) ? workspace.colorAliases : [];
    const existing = aliases.find((item) => (
      cleanText(item?.sourceType ?? item?.source_type) === RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE
      && normalizeRawMaterialSupplierSourceId(item?.sourceId ?? item?.source_id) === supplierSourceId
      && normalizeRawMaterialSupplierColor(item?.alias) === supplierColor
    ));
    const alias = {
      ...(existing ?? {}),
      id: cleanText(existing?.id) || stableId("CA-RM", `${supplierSourceId}|${supplierColor}`),
      alias: supplierColor,
      standardColorId: standardColor.id,
      sourceType: RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE,
      sourceId: supplierSourceId,
      enabled: body.enabled !== false,
      createdBy: cleanText(existing?.createdBy ?? existing?.created_by) || operatorId,
      createdAt: cleanText(existing?.createdAt ?? existing?.created_at) || timestamp,
      updatedAt: timestamp,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "raw_material_supplier_color_mapping",
      targetId: alias.id,
      action: existing ? "raw_material_supplier_color_mapping_updated" : "raw_material_supplier_color_mapping_created",
      before: existing ? mappingSnapshot(existing, workspace) : null,
      after: {
        supplierName,
        supplierSourceId,
        supplierColor,
        factoryColor,
        enabled: alias.enabled,
      },
      reason,
      operatorId,
      pageKey: "raw_material",
    });
    const targetRecords = {
      standardColors: existingStandardColor ? [] : [standardColor],
      colorAliases: [alias],
    };
    const importExecution = {
      executionId: `MDE-COLOR-${alias.id}-${Date.parse(timestamp)}`,
      status: "ready_for_transaction_writer",
      officialImportEnabled: true,
      officialWriterKind: workspace.masterDataImportTransactionRepository?.kind || "local_transaction",
      summary: { failedRowCount: 0 },
      failedRows: [],
      importPayload: { targetRecords },
      writeBatches: [],
    };
    try {
      const saved = await workspace.masterDataImportTransactionRepository.applyImportExecution({
        workspace,
        importExecution,
        operationLog,
      });
      return {
        statusCode: 200,
        response: {
          mapping: listMappings(workspace, { supplierSourceId }).find((item) => item.id === alias.id),
          operationLogId: cleanText(saved?.operationLogId),
        },
      };
    } catch (error) {
      return businessError(409, "RAW_MATERIAL_COLOR_MAPPING_WRITE_FAILED", cleanText(error?.message) || "厂家颜色规则保存失败。");
    }
  }
}

export function listMappings(workspace = {}, filters = {}) {
  const standardColorNameById = new Map(
    (Array.isArray(workspace.standardColors) ? workspace.standardColors : [])
      .map((item) => [cleanText(item?.id), cleanText(item?.name)]),
  );
  const supplierSourceId = normalizeRawMaterialSupplierSourceId(filters.supplierSourceId || filters.supplierName);
  const keyword = cleanText(filters.keyword).toLowerCase();
  return (Array.isArray(workspace.colorAliases) ? workspace.colorAliases : [])
    .filter((item) => cleanText(item?.sourceType ?? item?.source_type) === RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE)
    .map((item) => ({
      id: cleanText(item?.id),
      supplierSourceId: normalizeRawMaterialSupplierSourceId(item?.sourceId ?? item?.source_id),
      supplierColor: cleanText(item?.alias),
      factoryColor: standardColorNameById.get(cleanText(item?.standardColorId ?? item?.standard_color_id)) || "",
      enabled: item?.enabled !== false,
      updatedAt: cleanText(item?.updatedAt ?? item?.updated_at),
    }))
    .filter((item) => !supplierSourceId || item.supplierSourceId === supplierSourceId)
    .filter((item) => !keyword || [item.supplierSourceId, item.supplierColor, item.factoryColor]
      .some((value) => value.toLowerCase().includes(keyword)))
    .sort((left, right) => left.supplierSourceId.localeCompare(right.supplierSourceId, "zh-CN")
      || left.supplierColor.localeCompare(right.supplierColor, "zh-CN"));
}

export function listSupplierColorMappingOptions(workspace = {}) {
  const suppliers = new Map();
  for (const inbound of Array.isArray(workspace.rawMaterialInbounds) ? workspace.rawMaterialInbounds : []) {
    const supplierName = cleanText(inbound?.supplierName);
    const supplierSourceId = normalizeRawMaterialSupplierSourceId(supplierName);
    if (supplierName && supplierSourceId && !suppliers.has(supplierSourceId)) suppliers.set(supplierSourceId, supplierName);
  }
  for (const mapping of listMappings(workspace)) {
    if (!suppliers.has(mapping.supplierSourceId)) suppliers.set(mapping.supplierSourceId, mapping.supplierSourceId);
  }
  return {
    factoryColors: [...RAW_MATERIAL_FACTORY_COLORS],
    suppliers: [...suppliers.entries()]
      .map(([supplierSourceId, supplierName]) => ({ supplierSourceId, supplierName }))
      .sort((left, right) => left.supplierName.localeCompare(right.supplierName, "zh-CN")),
  };
}

function mappingSnapshot(mapping, workspace) {
  const standardColor = (workspace.standardColors ?? []).find((item) => cleanText(item?.id) === cleanText(mapping?.standardColorId));
  return {
    supplierSourceId: normalizeRawMaterialSupplierSourceId(mapping?.sourceId),
    supplierColor: normalizeRawMaterialSupplierColor(mapping?.alias),
    factoryColor: cleanText(standardColor?.name),
    enabled: mapping?.enabled !== false,
  };
}

function stableId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(cleanText(value)).digest("hex").slice(0, 16).toUpperCase()}`;
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
