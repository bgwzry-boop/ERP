import { createRawMaterialInboundRepository } from "./rawMaterialInboundRepository.mjs";
import { createFulfillmentActionTransactionRepository } from "./fulfillmentActionTransactionRepository.mjs";
import { createProductionPackingTransactionRepository } from "./productionPackingTransactionRepository.mjs";
import { createOrderDraftRepository } from "./orderDraftRepository.mjs";
import { createAttendancePayrollRepository } from "./attendancePayrollRepository.mjs";
import { createStatementPaymentTransactionRepository } from "./statementPaymentTransactionRepository.mjs";
import { createStatementSettlementTransactionRepository } from "./statementSettlementTransactionRepository.mjs";
import { createStatementSendTransactionRepository } from "./statementSendTransactionRepository.mjs";
import { createStatementExportRepository } from "./statementExportRepository.mjs";

export function createRepositories(effectiveOptions = {}) {
  return {
    fulfillmentActionTransactionRepository:
      effectiveOptions.fulfillmentActionTransactionRepository ??
      createFulfillmentActionTransactionRepository(effectiveOptions.fulfillmentActionTransactionRepositoryOptions),
    rawMaterialInboundRepository:
      effectiveOptions.rawMaterialInboundRepository ??
      createRawMaterialInboundRepository(effectiveOptions.rawMaterialInboundRepositoryOptions),
    productionPackingTransactionRepository:
      effectiveOptions.productionPackingTransactionRepository ??
      createProductionPackingTransactionRepository(effectiveOptions.productionPackingTransactionRepositoryOptions),
    orderDraftRepository:
      effectiveOptions.orderDraftRepository ??
      createOrderDraftRepository(effectiveOptions.orderDraftRepositoryOptions),
    attendancePayrollRepository:
      effectiveOptions.attendancePayrollRepository ??
      createAttendancePayrollRepository(effectiveOptions.attendancePayrollRepositoryOptions),
    statementPaymentTransactionRepository:
      effectiveOptions.statementPaymentTransactionRepository ??
      createStatementPaymentTransactionRepository(effectiveOptions.statementPaymentTransactionRepositoryOptions),
    statementSettlementTransactionRepository:
      effectiveOptions.statementSettlementTransactionRepository ??
      createStatementSettlementTransactionRepository(effectiveOptions.statementSettlementTransactionRepositoryOptions),
    statementSendTransactionRepository:
      effectiveOptions.statementSendTransactionRepository ??
      createStatementSendTransactionRepository(effectiveOptions.statementSendTransactionRepositoryOptions),
    statementExportRepository:
      effectiveOptions.statementExportRepository ??
      createStatementExportRepository(effectiveOptions.statementExportRepositoryOptions),
  };
}
