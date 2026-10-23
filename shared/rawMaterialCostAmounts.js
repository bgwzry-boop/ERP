import {readFiniteRawMaterialNumber} from './rawMaterialNumbers.js';
export function sumRawMaterialCostAmounts(records, field) {
  let cents = 0;
  if (!records.length) reject();
  for (const record of records) {
    const amount = readFiniteRawMaterialNumber(record[field]);
    const value = amount === null ? NaN : Math.round(amount * 100);
    if (amount === null || amount < 0 || !Number.isSafeInteger(value)) reject();
    cents += value;
    if (!Number.isSafeInteger(cents)) reject();
  }
  return cents / 100;
}
function reject() {
  throw Object.assign(new Error('成本金额缺失、无效或超出范围，请核对原始成本记录后再复核。'), {statusCode:422,code:'RAW_MATERIAL_COST_AMOUNT_INVALID'});
}
