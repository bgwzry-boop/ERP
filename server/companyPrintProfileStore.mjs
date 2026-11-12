// P2-07 单据抬头：送货单/自提单上方的公司名、地址、电话和底部说明，办公室自己改。
// 本地模式存在一个 JSON 文件里；正式库存在 print_templates 的一条记录（tpl-company-print-profile）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_COMPANY_PRINT_PROFILE, normalizeCompanyPrintProfile } from "../shared/deliveryNoteLayout.js";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const COMPANY_PRINT_PROFILE_ID = "tpl-company-print-profile";
export const companyPrintProfileStoreKey = "metadata/company-print-profile.json";

const conflict = () => Object.assign(new Error("单据抬头刚被别人改过，请刷新后再改。"), { statusCode: 409, code: "COMPANY_PRINT_PROFILE_CHANGED" });
const profilePayload = profile => ({ companyName: profile.companyName, contactName: profile.contactName ?? "", address: profile.address, phone: profile.phone, footerNote: profile.footerNote,
  deductStockAtNotePrint: profile.deductStockAtNotePrint === true });

export function createLocalCompanyPrintProfileStore(storageRoot) {
  const filePath = join(storageRoot, companyPrintProfileStoreKey);
  const read = () => {
    if (!existsSync(filePath)) return normalizeCompanyPrintProfile(DEFAULT_COMPANY_PRINT_PROFILE);
    try { return normalizeCompanyPrintProfile(JSON.parse(readFileSync(filePath, "utf8"))); }
    catch { return normalizeCompanyPrintProfile(DEFAULT_COMPANY_PRINT_PROFILE); }
  };
  return {
    getCompanyPrintProfile: async () => read(),
    async saveCompanyPrintProfile({ profile, expectedRevision, operatorId, updatedAt }) {
      const current = read();
      if (Number(expectedRevision) !== current.revision) throw conflict();
      const next = normalizeCompanyPrintProfile({ ...profilePayload(profile), revision: current.revision + 1, updatedAt, updatedBy: operatorId });
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
      return { companyPrintProfile: next, operationLogId: "" };
    },
  };
}

export function createPostgresCompanyPrintProfileStore({ queryJson, idempotentTransactionJson }) {
  return {
    async getCompanyPrintProfile() {
      const row = await queryJson(`SELECT ${profileJson("t")} AS result FROM print_templates t WHERE t.id = $1`, [COMPANY_PRINT_PROFILE_ID]);
      return normalizeCompanyPrintProfile(row ?? DEFAULT_COMPANY_PRINT_PROFILE);
    },
    async saveCompanyPrintProfile({ profile, expectedRevision, operatorId, operationLog, idempotencyKey, idempotencyPayload }) {
      const raw = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: "print.company_profile.save",
        idempotencyKey: resolveRepositoryIdempotencyKey(idempotencyKey, operationLog?.id),
        payload: idempotencyPayload ?? { profile: profilePayload(profile), expectedRevision },
        operatorId,
        targetType: "print_template",
        targetId: COMPANY_PRINT_PROFILE_ID,
        resourceLocks: [`print-template:${COMPANY_PRINT_PROFILE_ID}`],
        query: buildSaveCompanyPrintProfileQuery({ profile, expectedRevision, operatorId, operationLog }),
      }));
      if (!raw?.companyPrintProfile) throw conflict();
      return { companyPrintProfile: normalizeCompanyPrintProfile(raw.companyPrintProfile), operationLogId: String(raw.operationLogId ?? "") };
    },
  };
}

function profileJson(alias) {
  return `json_build_object('companyName', ${alias}.template_payload->>'companyName', 'contactName', ${alias}.template_payload->>'contactName', 'address', ${alias}.template_payload->>'address',
    'phone', ${alias}.template_payload->>'phone', 'footerNote', ${alias}.template_payload->>'footerNote',
    'deductStockAtNotePrint', COALESCE((${alias}.template_payload->>'deductStockAtNotePrint')::boolean, false),
    'revision', ${alias}.revision, 'updatedAt', ${alias}.updated_at, 'updatedBy', COALESCE(${alias}.updated_by, ''))`;
}

export function buildSaveCompanyPrintProfileQuery({ profile, expectedRevision, operatorId, operationLog }) {
  const p = createPostgresParameterBinder();
  const id = p.text(COMPANY_PRINT_PROFILE_ID);
  const log = operationLog ? `INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT ${p.text(operationLog.id)}, 'print_template', ${id}, 'save_company_print_profile', (SELECT before FROM locked), ${p.json(profilePayload(profile))},
    '修改单据抬头', ${p.nullableText(operatorId)}, 'api', ${p.timestamp(operationLog.occurredAt)}, ${p.timestamp(operationLog.createdAt ?? operationLog.occurredAt)}
  FROM updated RETURNING id` : "SELECT NULL::text AS id WHERE false";
  return {
    text: `
BEGIN;
WITH locked AS MATERIALIZED (
  SELECT id, revision, template_payload AS before FROM print_templates WHERE id = ${id} FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked WHERE revision = ${p.integer(expectedRevision)}),
    'ERP_COMPANY_PRINT_PROFILE_CONFLICT') AS ok
),
updated AS (
  UPDATE print_templates SET template_payload = ${p.json(profilePayload(profile))}, revision = print_templates.revision + 1,
    updated_by = ${p.nullableText(operatorId)}, updated_at = now()
  FROM write_guard WHERE print_templates.id = ${id} AND write_guard.ok
  RETURNING ${profileJson("print_templates")} AS result
),
inserted_operation_log AS (
  ${log}
)
SELECT json_build_object('companyPrintProfile', (SELECT result FROM updated), 'operationLogId', COALESCE((SELECT id FROM inserted_operation_log), '')) AS result;
COMMIT;
`.trim(),
    values: p.values,
  };
}
