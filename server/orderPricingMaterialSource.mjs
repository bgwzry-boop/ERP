import {
  buildMiniappSpecialMaterialPriceQuery,
  resolveMiniappSpecialMaterialPriceSnapshot,
} from "./miniapp/miniappErpProjectionAdapter.mjs";
import { specialBagPricingRules } from "../shared/pricing/specialBagPricing.js";

export function localOrderPricingMaterialFacts(workspace, input) {
  const requiredWidth =
    Number(input.heightCm) * 2 +
    Number(input.gussetCm) +
    specialBagPricingRules.defaults.foldCm * 2;
  const rows = (workspace.rawMaterialInbounds ?? [])
    .flatMap((inbound) =>
      (inbound.rolls?.length ? inbound.rolls : [inbound]).map((roll) => ({
        inbound,
        roll,
      })),
    )
    .filter(({ roll }) =>
      ["可用", "机边领用", "已消耗"].includes(roll.inventoryStatus),
    )
    .sort(
      (a, b) =>
        String(b.inbound.updatedAt ?? "").localeCompare(
          String(a.inbound.updatedAt ?? ""),
        ) || String(b.inbound.id).localeCompare(String(a.inbound.id)),
    );
  const match = (handle, width, gsm) => {
    const found = rows.find(({ inbound, roll }) => {
      const label = `${roll.materialType ?? inbound.materialType ?? ""} ${roll.productName ?? inbound.productName ?? ""}`;
      return (
        (handle
          ? /提手/u.test(label)
          : !/提手/u.test(label) && /布|无纺|卷料/u.test(label)) &&
        Number(roll.widthCm ?? inbound.widthCm) === width &&
        Number(roll.gramWeightGsm ?? inbound.gramWeightGsm) === gsm &&
        Number(roll.unitPrice ?? inbound.unitPrice) > 0
      );
    });
    if (!found) return null;
    const { inbound, roll } = found;
    return {
      supplier_name: inbound.supplierName,
      batch_id: roll.id || inbound.id,
      updated_at: inbound.updatedAt,
      yuan_per_kg: Number(roll.unitPrice ?? inbound.unitPrice),
    };
  };
  return {
    body: match(false, requiredWidth, specialBagPricingRules.defaults.bodyGsm),
    handle: match(
      true,
      specialBagPricingRules.defaults.handleWidthCm,
      specialBagPricingRules.defaults.handleGsm,
    ),
  };
}

export function resolvedOrderPricingMaterialSnapshot(facts) {
  const snapshot = resolveMiniappSpecialMaterialPriceSnapshot(facts.materials);
  if (snapshot.provisional === false) return snapshot;
  const fallback = facts.publishedRelease?.specialSizePricing;
  if (
    fallback?.rules?.version === specialBagPricingRules.version &&
    fallback.materialPrice?.provisional === false &&
    Date.parse(fallback.materialPrice.effectiveFrom) <= Date.now()
  ) {
    const merged = structuredClone(fallback.materialPrice);
    // Confirmed batches win independently; a missing handle batch must not
    // replace a real body-material price with an older published fallback.
    for (const key of ["body", "handle"])
      if (facts.materials?.[key]) {
        merged[key] = {
          ...merged[key],
          yuanPerTon: Number(facts.materials[key].yuan_per_kg) * 1000,
          supplierId: facts.materials[key].supplier_name,
          batchId: facts.materials[key].batch_id,
        };
      }
    merged.version = `${merged.version}|${JSON.stringify(facts.materials)}`;
    return merged;
  }
  return null;
}

export function buildOrderPricingMaterialFactsGuard(sources, parameters) {
  if (!sources?.length) return "true";
  return sources
    .map((source) => {
      const query = buildMiniappSpecialMaterialPriceQuery(source.input);
      const offset = parameters.values.length;
      parameters.values.push(...query.values);
      const sql = query.text
        .replace(/\$(\d+)/gu, (_, index) => `$${offset + Number(index)}`)
        .replace(/;$/u, "")
        .replace(
          "FROM raw_material_inbounds AS inbound",
          "FROM locked_pricing_raw_inbounds AS inbound",
        );
      let guard = `(SELECT result::jsonb FROM (${sql}) pricing_material) = ${parameters.json(source.facts.materials)}`;
      if (source.facts.publishedRelease) {
        const release = source.facts.publishedRelease;
        guard += ` AND EXISTS (SELECT 1 FROM locked_pricing_price_releases WHERE id=${parameters.text(release.id)}
        AND revision=${parameters.integer(release.revision)} AND status='published'
        AND bundle_json->'specialSizePricing'=${parameters.json(release.specialSizePricing)})`;
      }
      return `(${guard})`;
    })
    .join(" AND ");
}

export { buildMiniappSpecialMaterialPriceQuery };
