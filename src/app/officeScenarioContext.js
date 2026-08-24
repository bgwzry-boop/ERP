import { loadOfficeWorkspace } from "../services/officeMockService.js";
import {
  findCustomer as findCustomerRecord,
  getOrderFinanceState as getOrderFinanceStateRecord,
  getStatementBlockingAmount as getStatementBlockingAmountRecord,
  getStatementBucket as getStatementBucketRecord,
  getStatementDisplayDebt as getStatementDisplayDebtRecord,
  getStatementFinancialSummary as getStatementFinancialSummaryRecord,
  orderMatchesFilters as orderMatchesFiltersRecord,
  statementMatchesFilters as statementMatchesFiltersRecord,
} from "../domain/officeRules.js";

const officeScenarioData = loadOfficeWorkspace();

export const {
  customers,
  defaultSelections,
  initialFulfillments,
  initialInventories,
  initialOrderLines,
  initialRawMaterialInbounds,
  initialStatements,
  initialTodos,
  sampleText,
} = officeScenarioData;

export const findCustomer = (id) => findCustomerRecord(customers, id);
export const getOrderFinanceState = (row, statements) => getOrderFinanceStateRecord(row, statements, customers);
export const getStatementBlockingAmount = (statement) => getStatementBlockingAmountRecord(statement, customers);
export const getStatementDisplayDebt = (statement) => getStatementDisplayDebtRecord(statement, customers);
export const getStatementFinancialSummary = (statement) => getStatementFinancialSummaryRecord(statement, customers);
export const getStatementBucket = (statement) => getStatementBucketRecord(statement, customers);
export const orderMatchesFilters = (row, filters, statements) => orderMatchesFiltersRecord(row, filters, statements, customers);
export const statementMatchesFilters = (statement, filters) => statementMatchesFiltersRecord(statement, filters, customers);
