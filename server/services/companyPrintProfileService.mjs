// P2-07 单据抬头：办公室在「打印与设备」里改公司名、地址、电话和单据底部说明。
// 改完后新打的送货单/自提单用新抬头；已经打过的单子按当时的内容存着，重打不变。
import { randomUUID } from "node:crypto";
import { DEFAULT_COMPANY_PRINT_PROFILE, normalizeCompanyPrintProfile, validateCompanyPrintProfileInput } from "../../shared/deliveryNoteLayout.js";

const businessError = (statusCode, code, message) => ({ error: true, statusCode, code, message });

export async function readCompanyPrintProfile(workspace) {
  const repository = workspace?.printDeviceRepository;
  if (typeof repository?.getCompanyPrintProfile !== "function") return normalizeCompanyPrintProfile(DEFAULT_COMPANY_PRINT_PROFILE);
  return repository.getCompanyPrintProfile();
}

export async function saveCompanyPrintProfile({ workspace, body = {}, operatorId, now = () => new Date() }) {
  const repository = workspace?.printDeviceRepository;
  if (typeof repository?.saveCompanyPrintProfile !== "function") return businessError(503, "COMPANY_PRINT_PROFILE_UNAVAILABLE", "单据抬头暂时不能保存，请稍后再试。");
  const invalid = validateCompanyPrintProfileInput(body);
  if (invalid) return businessError(422, "COMPANY_PRINT_PROFILE_INVALID", invalid);
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return businessError(422, "COMPANY_PRINT_PROFILE_REVISION_REQUIRED", "请刷新后再保存。");
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8) return businessError(422, "IDEMPOTENCY_KEY_INVALID", "缺少本次保存标识，请重新点保存。");
  const profile = normalizeCompanyPrintProfile(body);
  const occurredAt = now().toISOString();
  try {
    const saved = await repository.saveCompanyPrintProfile({
      workspace, profile, expectedRevision, operatorId, updatedAt: occurredAt, idempotencyKey,
      idempotencyPayload: { companyName: profile.companyName, contactName: profile.contactName, address: profile.address, phone: profile.phone, footerNote: profile.footerNote, expectedRevision, operatorId },
      operationLog: { id: `LOG-COMPANY-PRINT-${randomUUID()}`, occurredAt, createdAt: occurredAt },
    });
    return { companyPrintProfile: saved.companyPrintProfile, operationLogId: saved.operationLogId };
  } catch (error) {
    if (error?.statusCode === 409 || /CONFLICT|CHANGED/.test(String(error?.code ?? error?.message ?? ""))) {
      return businessError(409, "COMPANY_PRINT_PROFILE_CHANGED", "单据抬头刚被别人改过，请刷新后再改。");
    }
    if (error?.code === "IDEMPOTENCY_KEY_REUSED") return businessError(409, error.code, "这次保存和上一次的内容不一致，请重新点保存。");
    throw error;
  }
}
