import { normalizeFactoryStandardColor } from './factoryStandardColors.js';

// A match attests to the existing label facts; it is not an inventory correction.
export function getRawMaterialLabelMismatchFields(expected = {}, checked = {}) {
  const fields = [];
  const weight = Number(expected.weightKg);
  const checkedWeight = Number(checked.weightKg);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(checkedWeight) || checkedWeight !== weight) fields.push('重量');
  const expectedColor = colorKey(expected.color);
  if (!expectedColor || expectedColor !== colorKey(checked.color)) fields.push('颜色');
  const expectedSpec = specKey(expected.spec);
  if (!expectedSpec || expectedSpec !== specKey(checked.spec)) fields.push('规格');
  return fields;
}

function colorKey(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  return normalizeFactoryStandardColor(text) || text;
}
function specKey(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').replace(/[×xX]/gu, '*');
}
