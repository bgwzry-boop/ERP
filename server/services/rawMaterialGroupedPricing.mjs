// Only the supplier's explicit, same-table footer can authorize a group price.
// Null rows are boundaries; never bridge a subtotal, blank row or another page.
export function resolveRawMaterialGroupedPricing(rows) {
  for (let end = 0; end < rows.length; end += 1) {
    const tail = rows[end];
    const candidate = tail?.groupPricingCandidate;
    if (!candidate) continue;
    const { totalWeightKg, unitPrice, amount } = candidate;
    if (![totalWeightKg, unitPrice, amount].every(value => Number.isFinite(value) && value > 0)) continue;
    const targetWeight = Math.round(totalWeightKg * 1000);
    const targetCents = Math.round(amount * 100);
    if (Math.round(totalWeightKg * unitPrice * 100) !== targetCents) continue;
    const kind = materialKind(tail);
    if (!kind) continue;
    const members = [];
    let weight = 0;
    for (let start = end; start >= 0; start -= 1) {
      const line = rows[start];
      const values = line?.values;
      if (!values || line.pricingSource || materialKind(line) !== kind) break;
      if (start !== end && line.groupPricingRowIndex + 1 !== rows[start + 1]?.groupPricingRowIndex) break;
      if (start !== end && (line.groupPricingCandidate || values.unitPrice !== 0 || values.amount !== 0)) break;
      if (!Number.isInteger(values.rollCount) || values.rollCount <= 0 || values.rollWeightsKg.length !== values.rollCount
        || !values.rollWeightsKg.every(value => Number.isFinite(value) && value > 0)) break;
      const lineWeight = values.rollWeightsKg.reduce((sum, value) => sum + Math.round(value * 1000), 0);
      if (lineWeight !== Math.round(values.totalWeightKg * 1000)) break;
      weight += lineWeight;
      members.unshift(line);
      if (weight > targetWeight) break;
      if (weight !== targetWeight) continue;
      if (members.length < 2) break;
      const cents = members.map(member => Math.round(member.values.totalWeightKg * unitPrice * 100));
      // Do not silently distribute rounding differences or repair the paper.
      if (cents.reduce((sum, value) => sum + value, 0) !== targetCents || cents.some(value => value <= 0)) break;
      for (const [index, member] of members.entries()) {
        member.pricingSource = {
          kind: "verified_supplier_group",
          sourceLineId: tail.lineId,
          sourcePageIndex: tail.sourcePageIndex ?? 0,
          lineIds: members.map(item => item.lineId),
          totalWeightKg, unitPrice, amount,
          originalUnitPrice: member.values.unitPrice,
          originalAmount: member.values.amountRawAudit || member.values.amount,
          allocatedAmount: cents[index] / 100,
        };
        member.values = { ...member.values, unitPrice, amount: cents[index] / 100, amountNormalizationReason: "同组逐卷重量、票面总重及单价金额一致，按行重量计算金额" };
      }
      break;
    }
  }
  return rows;
}

function materialKind(line) {
  const values = line?.values;
  if (!values) return "";
  if (values.materialCategory === "提手条") return "strip";
  return values.materialCategory === "布料" ? "fabric" : "";
}
