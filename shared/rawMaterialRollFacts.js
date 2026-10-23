const fields = ['materialType','productName','spec','factoryColor'];
export function rawMaterialRollFacts(inbound = {}, roll) {
  const facts = {};
  const line = roll?.ocrLineId ? (inbound.ocrLines ?? []).filter(row=>row.lineId === roll.ocrLineId) : [];
  for (const field of fields) {
    const own = String(roll?.[field] ?? '').trim();
    const source = line.length === 1 ? String(line[0].values?.[field] ?? '').trim() : '';
    // A supplier color is not a reviewed factory color. Never recover it from OCR values.
    facts[field] = own || (field !== 'factoryColor' ? source : '') || (roll?.ocrLineId ? '' : String(inbound[field] ?? '').trim());
  }
  return facts;
}
