export const statementVarianceOptions = Object.freeze([
  Object.freeze({value:'carry_to_debt',label:'未收差额转欠款'}),
  Object.freeze({value:'approved_allowance',label:'抹零/减免已审批'}),
  Object.freeze({value:'bill_needs_recalc',label:'账单有误待重算'}),
  Object.freeze({value:'waiting_more_payments',label:'多笔付款待齐'}),
  Object.freeze({value:'other',label:'其他'}),
]);
export function resolveStatementVarianceHandling(value,legacyReason) {
  const explicit=typeof value==='string'?value.trim():'';
  if(value!==undefined&&value!==null&&typeof value!=='string')return null;
  if(explicit)return statementVarianceOptions.find(row=>row.value===explicit||row.label===explicit) ?? null;
  const legacy=typeof legacyReason==='string'?legacyReason.trim():'';
  return statementVarianceOptions.find(row=>row.label===legacy) ?? null;
}
export function statementVarianceLabel(value) {
  return statementVarianceOptions.find(row=>row.value===value||row.label===value)?.label || String(value || '处理结果未记录');
}
