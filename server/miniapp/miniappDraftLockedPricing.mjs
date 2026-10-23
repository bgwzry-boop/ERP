import { normalizeOrderType } from "../../shared/orderRouting.js";
import { validateMiniappConfirmationSource } from './miniappConfirmationSource.mjs';

const invalid = () => Object.assign(new Error('已锁定的小程序订单规格、数量或价格凭据不一致，请核对原订单。'), { code: 'MINIAPP_LOCKED_ORDER_CHANGED', statusCode: 409 });
const clean = value => String(value ?? '').trim();
const canonical = (key, value) => {
  const text = clean(value);
  if (key === 'handle') return ({regular:'普通提',extended:'加长提'})[text] ?? text;
  if (key === 'printSide') return ({single:'单面',double:'双面','':'非印刷'})[text] ?? text;
  if (key === 'printColor') return text || '非印刷';
  if (key === 'style') return text || '空白袋';
  return text;
};

export async function loadMiniappDraftLockedPricing(repository, draft, rows, workspace) {
  const sources = await repository.getMiniappConfirmationSources?.({ draftId: draft.id, workspace }) ?? [];
  if (!sources.length) {
    if (['mini_program', 'wechat_mini_program'].includes(draft.sourceChannel)) throw invalid();
    return null;
  }
  const source = validateMiniappConfirmationSource(sources, { draftId: draft.id, customerId: draft.customerId });
  const prices = new Map();
  for (const row of rows) {
    const saved = (draft.lines ?? []).find(item => item.id === row.id);
    const origin = source.lines.find(item => item.draftLineId === row.id)?.normalizedLine;
    if (!saved || !origin || row.customerId !== source.customerId || Number(row.qty) !== origin.quantity) throw invalid();
    if (normalizeOrderType(row.orderType) !== normalizeOrderType(origin.orderType ?? origin.productType)) throw invalid();
    const originalFields = { size:origin.size, color:origin.color, handle:origin.handle ?? origin.handleId,
      handleColor:origin.handleColor, style:origin.patternName || origin.patternId,
      print: (origin.artworkToken || origin.printContent || origin.printColor || /print/i.test(origin.productType)) ? '是' : '否',
      printSide:origin.printSideMode || origin.printSide, printColor:origin.printColor };
    for (const [key, value] of Object.entries(originalFields)) {
      if (canonical(key, row[key]) !== canonical(key, value)) throw invalid();
    }
    // An office edit cannot silently reuse a customer-locked price for a new specification.
    for (const key of ['size', 'color', 'handle', 'style', 'print', 'printSide', 'printColor', 'handleColor']) {
      if (canonical(key, row[key]) !== canonical(key, saved[key])) throw invalid();
    }
    const quote = origin.quoteSnapshot;
    for (const key of ['basePrice', 'handleAddon', 'specialRequirementAddon', 'printFee']) {
      if (typeof quote[key] !== 'number' || !Number.isFinite(quote[key]) || quote[key] < 0) throw invalid();
    }
    prices.set(row.id, {
      bagPrice: quote.basePrice + quote.handleAddon + quote.specialRequirementAddon,
      printPrice: quote.printFee, otherFee: 0, finalAmount: quote.amount, amount: quote.amount,
      sourceEvidence: { sourceOrderNo: source.sourceOrderNo, sourceLineId: origin.sourceLineId,
        intakeId: source.id, requestHash: source.requestHash, priceVersion: quote.priceVersion,
        priceReleaseId: source.snapshots.find(item => item.type === 'customer_submit').priceReleaseId,
        priceReleaseSha256: source.snapshots.find(item => item.type === 'customer_submit').priceReleaseSha256,
        delivery: structuredClone(source.delivery ?? null),
        quote: structuredClone(quote), specification: structuredClone(origin.specification ?? {}) },
    });
  }
  return { source, prices };
}

export function applyMiniappDraftLockedPricing(confirmation, pricing) {
  if (!pricing || confirmation.blocked) return;
  if (confirmation.checkedRows.length !== confirmation.newLines.length) throw invalid();
  confirmation.checkedRows.forEach((row, index) => {
    const price = pricing.prices.get(row.id);
    if (!price) throw invalid();
    row.amount = price.amount;
    confirmation.newLines[index].amount = price.amount;
    confirmation.newLines[index].confirmedMiniappPrice = structuredClone(price);
  });
}
