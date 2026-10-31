// Business duplicate signals already claimed for raw-material receipts:
// an authoritative supplier ticket number when one is present, otherwise a
// reviewable fingerprint of supplier, receipt date, direction, roll count,
// ordered weights or total weight, and spec/color when both sides have them.
// Matches are possible duplicates for human comparison. They never merge receipts.

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeRawMaterialDuplicateText(value) {
  return clean(value).normalize("NFKC").replace(/[\s\-—_]+/gu, "").toLocaleLowerCase("zh-CN");
}

export function rawMaterialDeliveryNoteTicketKey(record = {}) {
  return normalizeRawMaterialDuplicateText(record?.deliveryNoteNo);
}

export function rawMaterialDeliveryNoteDateKey(value) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}T/u.test(text) || /(?:Z|[+-]\d{2}:\d{2})$/iu.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    }
  }
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/u);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function directionKey(record = {}) {
  return clean(record.documentDirection) === "supplier_return" ? "supplier_return" : "supplier_delivery";
}

function supplierKey(record = {}) {
  return normalizeRawMaterialDuplicateText(record.supplierName);
}

function rollCountOf(record = {}) {
  const declared = Number(record.rollCount);
  if (Number.isFinite(declared) && declared > 0) return Math.trunc(declared);
  const rolls = Array.isArray(record.rolls) ? record.rolls.length : 0;
  return rolls > 0 ? rolls : 0;
}

function formatWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const rounded = Math.round(number * 10) / 10;
  return Object.is(rounded, -0) ? "0.0" : rounded.toFixed(1);
}

function explicitOrderedWeights(record = {}) {
  const rolls = Array.isArray(record.rolls) ? record.rolls : [];
  const rollWeights = rolls.map((roll) => Number(roll?.weightKg));
  if (rollWeights.some((value) => Number.isFinite(value) && value !== 0)) {
    return rollWeights.map((value) => formatWeight(value) || "0.0");
  }
  const fromLines = [];
  for (const line of Array.isArray(record.ocrLines) ? record.ocrLines : []) {
    if (clean(line?.reviewDisposition) === "excluded") continue;
    const values = line?.values && typeof line.values === "object" ? line.values : {};
    const list = Array.isArray(values.rollWeightsKg) ? values.rollWeightsKg : [];
    if (list.some((value) => Number(value) !== 0)) {
      fromLines.push(...list.map((value) => formatWeight(value) || "0.0"));
      continue;
    }
    if (Number(values.totalWeightKg)) fromLines.push(formatWeight(values.totalWeightKg));
  }
  return fromLines.filter(Boolean);
}

function totalWeightToken(record = {}) {
  const direct = Number(record.totalWeightKg);
  if (Number.isFinite(direct) && direct !== 0) return formatWeight(direct);
  const ordered = explicitOrderedWeights(record);
  if (!ordered.length) return "";
  const sum = ordered.reduce((total, token) => total + Number(token), 0);
  return sum ? formatWeight(sum) : "";
}

function weightsCompatible(left, right) {
  if (rollCountOf(left) === 0 || rollCountOf(left) !== rollCountOf(right)) return false;
  const leftOrdered = explicitOrderedWeights(left);
  const rightOrdered = explicitOrderedWeights(right);
  if (leftOrdered.length && rightOrdered.length) return leftOrdered.join(",") === rightOrdered.join(",");
  const leftTotal = totalWeightToken(left);
  const rightTotal = totalWeightToken(right);
  return Boolean(leftTotal) && leftTotal === rightTotal;
}

function headerFact(record = {}) {
  const lines = (Array.isArray(record.ocrLines) ? record.ocrLines : [])
    .filter((line) => clean(line?.reviewDisposition) !== "excluded");
  const first = lines[0]?.values && typeof lines[0].values === "object" ? lines[0].values : {};
  return {
    spec: normalizeRawMaterialDuplicateText(record.spec || first.spec),
    color: normalizeRawMaterialDuplicateText(record.supplierColor || record.factoryColor || first.supplierColor || first.factoryColor),
  };
}

function factsCompatible(left, right) {
  const a = headerFact(left);
  const b = headerFact(right);
  if (a.spec && b.spec && a.spec !== b.spec) return false;
  if (a.color && b.color && a.color !== b.color) return false;
  return true;
}

function contentFingerprintsMatch(left, right) {
  const supplier = supplierKey(left);
  if (!supplier || supplier !== supplierKey(right)) return false;
  const date = rawMaterialDeliveryNoteDateKey(left?.receivedAt);
  if (!date || date !== rawMaterialDeliveryNoteDateKey(right?.receivedAt)) return false;
  if (directionKey(left) !== directionKey(right)) return false;
  if (!weightsCompatible(left, right)) return false;
  return factsCompatible(left, right);
}

export function rawMaterialDeliveryNotesArePossibleDuplicates(left = {}, right = {}) {
  if (clean(left?.status) === "已作废" || clean(right?.status) === "已作废") return false;
  const leftId = clean(left?.id);
  const rightId = clean(right?.id);
  if (!leftId || !rightId || leftId === rightId) return false;
  const leftTicket = rawMaterialDeliveryNoteTicketKey(left);
  const rightTicket = rawMaterialDeliveryNoteTicketKey(right);
  if (leftTicket && rightTicket) return leftTicket === rightTicket;
  return contentFingerprintsMatch(left, right);
}

export function findRawMaterialDeliveryNoteDuplicateCandidates(inbounds = [], record = {}) {
  return (Array.isArray(inbounds) ? inbounds : []).filter((item) => rawMaterialDeliveryNotesArePossibleDuplicates(record, item));
}

export function summarizeRawMaterialDeliveryNoteDuplicates(record = {}, candidates = []) {
  const rows = Array.isArray(candidates) ? candidates : [];
  if (!rows.length) return "";
  const ticket = rawMaterialDeliveryNoteTicketKey(record);
  const sameTicketCount = ticket
    ? rows.filter((item) => rawMaterialDeliveryNoteTicketKey(item) === ticket).length
    : 0;
  if (sameTicketCount === rows.length) return `单号相同，另有 ${rows.length} 张`;
  if (sameTicketCount === 0) return `供应商、日期和重量相同，另有 ${rows.length} 张`;
  return `可能重复，另有 ${rows.length} 张`;
}

export function annotateRawMaterialDeliveryNoteDuplicates(inbounds = []) {
  const records = Array.isArray(inbounds) ? inbounds : [];
  return records.map((record) => {
    const duplicateCandidates = findRawMaterialDeliveryNoteDuplicateCandidates(records, record).map((item) => ({
      id: clean(item?.id),
      status: clean(item?.status),
      supplierName: clean(item?.supplierName),
      deliveryNoteNo: clean(item?.deliveryNoteNo),
      receivedAt: clean(item?.receivedAt),
      reason: rawMaterialDeliveryNoteTicketKey(record) && rawMaterialDeliveryNoteTicketKey(record) === rawMaterialDeliveryNoteTicketKey(item)
        ? "ticket"
        : "fingerprint",
    }));
    return {
      ...record,
      duplicateCandidates,
      duplicateSummary: summarizeRawMaterialDeliveryNoteDuplicates(record, duplicateCandidates),
    };
  });
}

export function buildRawMaterialDeliveryNoteDuplicateKey(record = {}) {
  const ticket = rawMaterialDeliveryNoteTicketKey(record);
  if (ticket) return `ticket:${ticket}`;
  const supplier = supplierKey(record);
  const date = rawMaterialDeliveryNoteDateKey(record?.receivedAt);
  const count = rollCountOf(record);
  const total = totalWeightToken(record);
  if (!supplier || !date || !count || !total) return "";
  return `fingerprint:${supplier}|${date}|${directionKey(record)}|${count}|${total}|${explicitOrderedWeights(record).join(",")}`;
}
