export function resolveRawMaterialCurrentRecord(roll, records = [], key, allowEmptyLegacy = false) {
  const id = roll?.[key];
  const matches = records.filter(record=>record.rollId === roll?.id && (!id || record[key] === id));
  if (allowEmptyLegacy && !id && matches.length === 0) return {};
  const record = matches.length === 1 ? matches[0] : null;
  if (key === "leftoverReturnRecordId" && roll.issueRecordId && record?.issueRecordId && roll.issueRecordId !== record.issueRecordId) return null;
  return record;
}
export function requireRawMaterialCurrentRecord(roll, records, key, allowEmptyLegacy = false) {
  const record = resolveRawMaterialCurrentRecord(roll, records, key, allowEmptyLegacy);
  if (!record) throw Object.assign(new Error('当前卷的领料或退回来源缺失、重复，请核对记录后重试；不能按卷号改写旧记录。'), {statusCode:422,code:'RAW_MATERIAL_CURRENT_TRACE_SOURCE_INVALID'});
  return record;
}
