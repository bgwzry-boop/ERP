import { createHash } from "node:crypto";
import { createLocalOrderDraftRepository } from "../../server/orderDraftRepository.mjs";
import { normalizeOrderType } from "../../shared/orderRouting.js";

// Synthetic server-owned intake evidence for positive UI scheduling fixtures.
// This does not add a request flag or a price bypass to the application. The
// real Miniapp/PostgreSQL intake check separately verifies signed locked prices.
export function createLockedSpecialPriceDraftFixture() {
  const repository = createLocalOrderDraftRepository();
  return {
    ...repository,
    getMiniappConfirmationSources(input) {
      const existing = repository.getMiniappConfirmationSources(input);
      if (existing.length) return existing;
      const draft = input.workspace.orderDrafts.find(item => item.id === input.draftId);
      if (!draft?.lines?.length || draft.lines.some(line => normalizeOrderType(line.orderType) !== "custom_special" || line.print === "是")) return [];
      const releaseId = "SYNTHETIC-SPECIAL-RELEASE";
      const priceVersion = "SYNTHETIC-SPECIAL-PRICE-V1";
      const digest = createHash("sha256").update(releaseId).digest("hex");
      const lines = draft.lines.map(line => {
        const amount = Math.round(Number(line.qty) * 99) / 100;
        const quoteSnapshot = { priceVersion, priceLocked: true, quantity: line.qty, basePrice: 0.99, handleAddon: 0, specialRequirementAddon: 0, printFee: 0, unitPrice: 0.99, amount };
        return { id: `IL-${line.id}`, draftLineId: line.id, mappingStatus: "mapped", normalizedLine: { sourceLineId: `SRC-${line.id}`, orderType: "custom_special", productType: "custom_special", size: line.size, color: line.color, handle: line.handle, handleColor: line.handleColor ?? "", patternName: line.style || "空白袋", printSide: "非印刷", printColor: "", quantity: line.qty, estimatedAmount: amount, quoteSnapshot } };
      });
      const quote = { authoritative: true, priceVersion, priceReleaseId: releaseId, priceReleaseSha256: digest, amount: Math.round(lines.reduce((sum, line) => sum + line.normalizedLine.estimatedAmount, 0) * 100) / 100, lines: lines.map(line => ({ sourceLineId: line.normalizedLine.sourceLineId, amount: line.normalizedLine.estimatedAmount, snapshot: structuredClone(line.normalizedLine.quoteSnapshot) })) };
      const source = { id: `INTAKE-${draft.id}`, sourceOrderNo: `SOURCE-${draft.id}`, draftId: draft.id, customerId: draft.customerId, requestHash: digest, revision: 1, status: "draft_created", lines, snapshots: [{ id: `SNAP-${draft.id}`, type: "customer_submit", authoritative: true, priceVersion, priceReleaseId: releaseId, priceReleaseSha256: digest, quote }] };
      input.workspace.miniappConfirmationSources ??= [];
      input.workspace.miniappConfirmationSources.push(source);
      return [source];
    },
  };
}
