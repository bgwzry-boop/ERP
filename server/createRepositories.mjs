import { createRawMaterialInboundRepository } from "./rawMaterialInboundRepository.mjs";

export function createRawMaterialRepositories(effectiveOptions = {}) {
  return {
    rawMaterialInboundRepository:
      effectiveOptions.rawMaterialInboundRepository ??
      createRawMaterialInboundRepository(effectiveOptions.rawMaterialInboundRepositoryOptions),
  };
}
