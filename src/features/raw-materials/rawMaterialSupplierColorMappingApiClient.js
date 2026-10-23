import { normalizeRawMaterialSupplierSourceId, normalizeRawMaterialSupplierColor, normalizeRawMaterialFactoryColorName } from "../../../shared/rawMaterialFactoryColors.js";
import { requestOfficeApi } from "../../services/officeApiClientCore.js";

export async function listOfficeRawMaterialSupplierColorMappings(input = {}, options = {}) {
  const { authState, operatorId, keyword = "", supplierSourceId = "" } = input;
  const params = new URLSearchParams();
  if (cleanText(keyword)) params.set("keyword", cleanText(keyword));
  if (cleanText(supplierSourceId)) params.set("supplierSourceId", cleanText(supplierSourceId));
  const query = params.toString();
  try {
    const response = await requestOfficeApi(
      `/master-data/raw-material-supplier-colors${query ? `?${query}` : ""}`,
      { ...options, authState, operatorId },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        options: { suppliers: [], factoryColors: [] },
        error: toApiError(json, response.status, "厂家颜色资料读取失败。"),
      };
    }
    if (!Array.isArray(json?.items) || !Array.isArray(json?.options?.suppliers) || !Array.isArray(json?.options?.factoryColors)) {
      return { source: "api_error", blocked: true, items: [], error: { code: "RAW_MATERIAL_SUPPLIER_COLOR_RESPONSE_INVALID", message: "厂家颜色资料响应不完整，请刷新重试。" } };
    }
    return {
      source: "api",
      items: Array.isArray(json?.items) ? json.items : [],
      options: {
        suppliers: Array.isArray(json?.options?.suppliers) ? json.options.suppliers : [],
        factoryColors: Array.isArray(json?.options?.factoryColors) ? json.options.factoryColors : [],
      },
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      items: [],
      options: { suppliers: [], factoryColors: [] },
      error: { code: "RAW_MATERIAL_SUPPLIER_COLOR_LIST_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

export async function saveOfficeRawMaterialSupplierColorMapping(input = {}, options = {}) {
  const { authState, operatorId, ...body } = input;
  try {
    const response = await requestOfficeApi("/master-data/raw-material-supplier-colors", {
      ...options,
      authState,
      operatorId,
      method: "POST",
      body,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "厂家颜色规则保存失败。"),
      };
    }
    const expectedSupplier = normalizeRawMaterialSupplierSourceId(body.supplierSourceId || body.supplierName);
    const expectedColor = normalizeRawMaterialSupplierColor(body.supplierColor);
    const expectedFactoryColor = normalizeRawMaterialFactoryColorName(body.factoryColor);
    if (!cleanText(json?.mapping?.id) || !cleanText(json?.operationLogId)
      || !expectedSupplier || !expectedColor || !expectedFactoryColor
      || json.mapping.supplierSourceId !== expectedSupplier
      || json.mapping.supplierColor !== expectedColor
      || json.mapping.factoryColor !== expectedFactoryColor
      || json.mapping.enabled !== (body.enabled !== false)
      || (cleanText(body.mappingId) && json.mapping.id !== cleanText(body.mappingId))) {
      return { source: "api_error", blocked: true, error: { code: "RAW_MATERIAL_SUPPLIER_COLOR_SAVE_UNCONFIRMED", message: "未收到完整保存凭据，结果暂无法确认。请刷新规则核对后再操作，避免重复保存。" } };
    }
    return {
      source: "api",
      mapping: json?.mapping,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "RAW_MATERIAL_SUPPLIER_COLOR_SAVE_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(json, status, fallbackMessage) {
  return {
    status,
    code: json?.code ?? `HTTP_${status}`,
    message: cleanText(json?.message) || fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
