// P2-07 单据抬头：读取 / 保存送货单、自提单上方的公司名、地址、电话和底部说明。
import { createOfficeIdempotencyKey, readOfficeApiJson as readJson, requestOfficeApi, toOfficeApiError as toApiError } from "./officeApiClientCore.js";

const clean = value => String(value ?? "").trim();
const normalize = value => ({
  companyName: clean(value?.companyName),
  contactName: clean(value?.contactName),
  address: clean(value?.address),
  phone: clean(value?.phone),
  footerNote: clean(value?.footerNote),
  revision: Number(value?.revision) || 1,
  updatedAt: clean(value?.updatedAt),
});

export async function getCompanyPrintProfile({ authState, operatorId } = {}, options = {}) {
  try {
    const response = await requestOfficeApi("/print-settings/company-profile", { ...options, authState, operatorId, method: "GET" });
    const json = await readJson(response);
    if (!response.ok) return { blocked: true, error: toApiError(json, response.status, "单据抬头读取失败。") };
    return { companyPrintProfile: normalize(json?.companyPrintProfile) };
  } catch (error) {
    return { blocked: true, error: { code: "COMPANY_PRINT_PROFILE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function saveCompanyPrintProfile({ authState, operatorId, profile = {}, expectedRevision, idempotencyKey } = {}, options = {}) {
  const key = idempotencyKey || createOfficeIdempotencyKey();
  const body = { ...normalize(profile), expectedRevision, idempotencyKey: key };
  delete body.revision;
  delete body.updatedAt;
  try {
    const response = await requestOfficeApi("/print-settings/company-profile", { ...options, authState, operatorId, method: "POST", idempotencyKey: key, body });
    const json = await readJson(response);
    if (!response.ok) return { blocked: true, error: toApiError(json, response.status, "单据抬头保存失败。") };
    return { companyPrintProfile: normalize(json?.companyPrintProfile) };
  } catch (error) {
    return { blocked: true, error: { code: "COMPANY_PRINT_PROFILE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}
