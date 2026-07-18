import { loadOfficeSeedWorkspace } from "./seeds/officeSeedLoader.mjs";
import { getEffectivePermissionsForRuntimeUser, getEffectivePermissionsForUser } from "./authSeed.mjs";

export function loadSeedWorkspace(input = {}) {
  const options = typeof input === "object" && input !== null ? input : { scenarioId: input };
  return loadOfficeSeedWorkspace(options);
}

export function getEffectivePermissions(userId, options = {}) {
  const runtimeUser = (Array.isArray(options.runtimeUsers) ? options.runtimeUsers : []).find(
    (user) =>
      String(user?.userId ?? user?.id ?? "").trim() === String(userId ?? "").trim() &&
      String(user?.identityKind ?? "").trim() !== "seed_fixture",
  );
  if (runtimeUser) return getEffectivePermissionsForRuntimeUser(runtimeUser, userId);
  return getEffectivePermissionsForUser(userId);
}

export function getStatementCustomers(workspace) {
  return workspace.statements.map((statement) => {
    const customer = findCustomer(workspace, statement.customerId);
    return {
      customerId: customer.id,
      customerName: customer.name,
      settlementCycle: customer.cycle,
      currentReceivable: statement.receivable,
      debtAmount: customer.debt,
      paymentPending: statement.status.includes("收款"),
      lastStatementAt: customer.lastStatement,
      status: mapStatementCustomerStatus(statement),
      statementId: statement.id,
      revision: Math.max(1, Number(statement.revision ?? 1) || 1),
    };
  });
}

export function paginate(items, searchParams) {
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 50);
  const start = (Math.max(page, 1) - 1) * Math.max(pageSize, 1);
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

export function filterByKeyword(items, keyword, fields) {
  if (!keyword) return items;
  return items.filter((item) => fields.some((field) => String(item[field] ?? "").includes(keyword)));
}

export function filterByValue(items, value, field) {
  if (!value || value === "all") return items;
  return items.filter((item) => String(item[field] ?? "") === value);
}

export function findCustomer(workspace, customerId) {
  return workspace.customers.find((customer) => customer.id === customerId) ?? workspace.customers[0];
}

function mapStatementCustomerStatus(statement) {
  if (statement.status.includes("欠款") || statement.status.includes("差额")) return "debt_or_variance";
  if (statement.status.includes("收款")) return "payment_pending";
  if (statement.status.includes("已核销") || statement.status.includes("已结清")) return "settled";
  return "current_period";
}
