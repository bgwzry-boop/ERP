import { p0BagPriceRows } from "../../src/domain/priceTable.js";
import { normalizeMiniappSize } from "../miniapp/miniappErpProjectionAdapter.mjs";

// Only the explicitly selected test seed may use these synthetic published
// facts. Formal confirmation never falls back to this historical demo table.
export function buildSyntheticPublishedPriceSeed({ bagPrice } = {}) {
  const priceTable = { id: "PT-TEST-PUBLISHED", bizNo: "TEST-PUBLISHED", name: "合成已发布通用价", versionNo: 9,
    status: "active", effectiveFrom: "2020-01-01T00:00:00.000Z", effectiveTo: null };
  const items = new Map();
  let sequence = 0;
  for (const row of p0BagPriceRows) {
    for (const style of row.style === "喜/福" ? ["喜", "福"] : [row.style]) {
      for (const handleType of ["普通提", "加长提"]) {
        const key = `${normalizeMiniappSize(row.size)}|${style}|${handleType}`;
        items.set(key, { id: `PI-TEST-${++sequence}`, priceTableId: priceTable.id,
          sizeKey: normalizeMiniappSize(row.size), handleType, styleKey: style === "覆膜" ? "覆膜袋" : style,
          bagPrice: bagPrice ?? (handleType === "加长提" ? row.extendedHandlePrice ?? row.normalPrice : row.normalPrice),
          printPrice: 0, otherFee: 0, minQty: null, enabled: true });
      }
    }
  }
  return { priceTables: [priceTable], priceTableItems: [...items.values()] };
}
