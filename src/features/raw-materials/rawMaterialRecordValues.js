// Display saved evidence without turning missing or invalid values into business quantities.
import { readFiniteRawMaterialNumber as readRecordNumber } from "../../../shared/rawMaterialNumbers.js";
export { readRecordNumber };

export function formatRecordQuantity(weight, quantity, unit = '件') {
  const kg = readRecordNumber(weight);
  const count = readRecordNumber(quantity);
  if (kg !== null && kg > 0) return `${kg}kg`;
  if (count !== null && count >= 0) return `${count}${unit}`;
  if (kg === 0) return '0kg';
  return '数量待核实';
}

export function formatRecordWeight(value) {
  const number = readRecordNumber(value);
  return number !== null && number >= 0 ? `${number}kg` : '重量待核实';
}

export function formatRecordMoney(value, money = value => `¥${value}`) {
  const number = readRecordNumber(value);
  return number === null ? '金额待核实' : money(number);
}

export function formatRecordRate(value, label = '') {
  const number = readRecordNumber(value);
  return number === null ? '' : ` / ${label}${number}%`;
}

export function formatRecordOrderLines(record) {
  const rows = Array.isArray(record.lineItems) ? record.lineItems : record.orderLineIds;
  return Array.isArray(rows) ? `${rows.length} 个订单行` : '订单行数量待核实';
}
