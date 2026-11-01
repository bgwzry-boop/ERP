// Inspect immutable supplier-paper evidence before numeric direction normalization.
// A price or a balance is not evidence that physical material was returned.
export function inspectRawMaterialDocumentDirectionEvidence({ rows = [], rawText = "" } = {}) {
  const sourceRows = (Array.isArray(rows) ? rows : []).filter(Array.isArray).map((row) => row.map((cell, index) => ({
    text: clean(cell && typeof cell === "object" ? cell.text : cell),
    column: Number.isInteger(cell?.colTl) ? cell.colTl : index,
  })));
  const titleRows = sourceRows.length ? sourceRows.map((row) => row.map((cell) => cell.text))
    : clean(rawText).split(/\r?\n/u).map((line) => [line]);
  if (titleRows.some((row, index) => isExplicitReturnTitle(row)
    && (sourceRows.length || index === 0 || !isAccountingOrNoteRow(titleRows[index - 1])))) {
    return { hasReturnEvidence: true, ambiguous: false, reason: "票面明确标注退货单" };
  }
  let header = null;
  let positive = false;
  let negative = false;
  for (const row of sourceRows) {
    const nextHeader = readHeader(row);
    if (nextHeader) { header = nextHeader; continue; }
    const texts = row.map((cell) => cell.text);
    if (isAccountingOrNoteRow(texts) || !isMaterialRow(row, header)) continue;
    const numbers = physicalDirectionValues(row, header);
    const rowNegative = numbers.some((value) => value < 0);
    // Positive roll counts and ordinary positive prices do not contradict a
    // negative weight/amount. Whole positive material rows do contradict it.
    const mixedWeights = numbers.mixedWeights === true;
    negative ||= rowNegative;
    positive ||= mixedWeights || (!rowNegative && numbers.some((value) => value > 0));
  }
  if (negative && positive) {
    return { hasReturnEvidence: true, ambiguous: true, reason: "物料明细同时包含送货和退货方向，请分别核实" };
  }
  return { hasReturnEvidence: negative, ambiguous: false, reason: negative ? "物料明细存在退货负数" : "" };
}

function isExplicitReturnTitle(texts) {
  if (isAccountingOrNoteRow(texts)) return false;
  // Supplier headings occupy a leading cell, not a material row's final remark.
  return texts.slice(0, 2).some((text) => clean(text).split(/\r?\n/u).some((line) => {
    const compact = line.replace(/\s+/gu, "");
    if (/备注|说明|提示|注意|填写|编号|单号|号码|参考|依据|请|须|如需|若需|如果|按退|非退|不是|不属|本单|本票|此单|该单/u.test(compact)) return false;
    return /^[\p{Script=Han}A-Za-z0-9（）()·-]{0,60}(?:退货单|退料单|退库单)[：:]?$/u.test(compact);
  }));
}

function isAccountingOrNoteRow(texts) {
  const leading = texts.slice(0, 2).join(" ");
  return /欠款|余额|结余|结转|扣款|扣项|扣重|抵扣|折扣|折让|优惠|运费|运输费|装卸费|搬运费|补差|价差|纸管费|纸管扣|应付|实付|已付|预付|收款|付款|上期|期初|期末|累计|小计|合计|总计|备注|附注/u.test(leading)
    || /^(?:计|金额大写|总计大写|收款账户|开户行|账号)[\s：:]*(?:$|\d)/u.test(leading.trim());
}

function headerKey(value) {
  const text = clean(value).replace(/\s+/gu, "").replace(/[：:]/gu, "");
  if (/^(?:品名|品名称|商品名称|商品全名|货品名称|货物名称|产品名称|物料名称|材料名称|名称)$/u.test(text)) return "product";
  if (/^(?:规格|规格型号|型号)$/u.test(text)) return "spec";
  if (/^(?:颜色|色号|供应商颜色)$/u.test(text)) return "color";
  if (/^(?:数量|卷数|件数|卷\/件)$/u.test(text)) return "quantity";
  if (/单价/u.test(text) && !/重量/u.test(text)) return "price";
  if (/^(?:金额|价税合计|行金额|本行金额)$/u.test(text)) return "amount";
  if (/重量|净重|总重|^公斤$|^kg$/iu.test(text)) return "weight";
  if (/^单位/u.test(text)) return "unit";
  return "";
}

function readHeader(row) {
  const columns = row.map((cell) => ({ ...cell, key: headerKey(cell.text) }));
  const keys = new Set(columns.map((cell) => cell.key).filter(Boolean));
  if (!keys.has("product") || keys.size < 3 || !["quantity", "weight", "amount"].some((key) => keys.has(key))) return null;
  const combinedWeightPrice = columns.some((cell) => /重量/u.test(cell.text.replace(/\s+/gu, "")) && /单价/u.test(cell.text));
  const separateRollWeightHeader = columns.filter((cell) => cell.key === "weight").length >= 2
    && columns.some((cell) => cell.key === "unit" && /千克|公斤/iu.test(cell.text));
  return { columns, variable: keys.has("color") && keys.has("quantity") && keys.has("weight") && !keys.has("spec")
    && (combinedWeightPrice || separateRollWeightHeader) };
}

function isMaterialRow(row, header) {
  const identity = row.slice(0, 3).map((cell) => cell.text).join(" ");
  if (/布|条|膜|纸|退料|退卷|彩色|废布/u.test(identity) || row.slice(0, 4).some((cell) => looksLikeSpec(cell.text))) return true;
  const productColumn = header?.columns.find((cell) => cell.key === "product")?.column;
  const product = row.find((cell) => cell.column === productColumn)?.text;
  return Boolean(product && !numericValues(product).length && row.some((cell) => numericValues(cell.text).length));
}

function physicalDirectionValues(row, header) {
  const texts = row.map((cell) => cell.text);
  // In this supplier layout each physical weight occupies an extra column and
  // colour may be absent (退带色布 / 退带色条). Header indexes cannot locate price.
  const specIndex = texts.findIndex(looksLikeSpec);
  const countIndexes = !header && specIndex >= 0 ? [specIndex + 1, 1, 2] : [1, 2];
  const countIndex = countIndexes.find((index) => {
    const values = numericValues(texts[index]);
    return values.length === 1 && Number.isInteger(values[0]) && Math.abs(values[0]) >= 1 && Math.abs(values[0]) <= 100;
  });
  if ((header?.variable || (!header && (specIndex >= 0 || /退带色(?:布|条)|布|条|膜|纸/u.test(texts[0] || "")))) && countIndex !== undefined) {
    const count = numericValues(texts[countIndex])[0];
    const weights = texts.slice(countIndex + 1, countIndex + 1 + Math.abs(count)).flatMap(numericValues);
    if (weights.length === Math.abs(count)) {
      const trailing = texts.slice(countIndex + 1 + Math.abs(count));
      const amounts = trailing.length >= 2 ? numericValues(trailing.at(-1)) : [];
      const values = [...weights, ...amounts, ...(count < 0 ? [count] : [])];
      values.mixedWeights = weights.some((value) => value < 0) && weights.some((value) => value > 0);
      return values;
    }
  }
  if (header) {
    return header.columns.filter((cell) => ["quantity", "weight", "amount"].includes(cell.key))
      .flatMap((column) => numericValues(row.find((cell) => cell.column === column.column)?.text));
  }
  // Without business-column evidence, an isolated negative number (which may
  // be a price) is insufficient. Explicit return titles are handled separately.
  return [];
}

function numericValues(value) {
  return clean(value).normalize("NFKC").replace(/[−—–﹣－]/gu, "-").split(/\r?\n/u).flatMap((part) => {
    const text = part.replace(/[,，\s]/gu, "");
    const match = text.match(/^(?:(?:净重|重量|数量|金额)[:：]?)?([+-]?\d+(?:\.\d+)?)(?:kg|千克|公斤|卷|件|元)?$/iu);
    const number = match ? Number(match[1]) : NaN;
    return Number.isFinite(number) ? [number] : [];
  });
}

function looksLikeSpec(value) {
  return /\d+(?:\.\d+)?\s*[*×]\s*\d+/u.test(clean(value));
}

function clean(value) {
  return String(value ?? "").trim();
}
