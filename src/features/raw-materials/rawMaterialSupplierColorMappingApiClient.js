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
