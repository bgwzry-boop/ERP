import { createRawMaterialInboundRepository } from "./rawMaterialInboundRepository.mjs";
import { createFulfillmentActionTransactionRepository } from "./fulfillmentActionTransactionRepository.mjs";

export function createRepositories(effectiveOptions = {}) {
  return {
    fulfillmentActionTransactionRepository:
      effectiveOptions.fulfillmentActionTransactionRepository ??
      createFulfillmentActionTransactionRepository(effectiveOptions.fulfillmentActionTransactionRepositoryOptions),
    rawMaterialInboundRepository:
      effectiveOptions.rawMaterialInboundRepository ??
      createRawMaterialInboundRepository(effectiveOptions.rawMaterialInboundRepositoryOptions),
  };
}
