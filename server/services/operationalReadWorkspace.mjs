// A request reads one fresh database snapshot without replacing the process-wide
// workspace. Slow reads must not overwrite a newer command's in-memory result.
const businessCollections = Object.freeze([
  'customers', 'customerContacts', 'customerAddresses', 'customerNotes',
  'originalOrders', 'orderLines', 'orderLineChangeRecords', 'priceSnapshots',
  'inventories', 'inventoryIntents', 'inventoryReservations', 'inventoryLedgers',
  'inventoryCorrectionDrafts', 'productionTasks', 'workshopReports', 'productionExceptions',
  'packingTasks', 'fulfillments', 'paperOutboundDocuments', 'warehouseOutboundExecutions',
  'fulfillmentExceptions', 'fulfillmentQuantityVarianceResolutions', 'packages', 'printRecords',
  'statements', 'statementLines', 'todos', 'todoEvents', 'varianceRecords',
  'statementSendRecords', 'statementConfirmationRecords', 'statementWriteOffRecords', 'operationLogs',
]);

export async function operationalReadWorkspace(workspace, pathname) {
  const specializedRead = new Set([
    '/api/fulfillments/operator-candidates', '/api/fulfillments/picker-suggestions',
    '/api/statements/export-storage-diagnostics', '/api/statements/export-v1-readiness',
  ]);
  if (specializedRead.has(pathname)) return workspace;
  const relevant = pathname === '/api/todos'
    || pathname === '/api/fulfillments'
    || /^\/api\/fulfillments\/[^/]+$/.test(pathname)
    || pathname === '/api/statements/customers'
    || /^\/api\/statements\/[^/]+$/.test(pathname);
  const repository = workspace.coreWorkspaceReadRepository;
  if (!relevant || repository?.kind !== 'postgres') return workspace;
  const state = await repository.loadState();
  const fresh = { ...workspace };
  for (const key of businessCollections) {
    if (!Array.isArray(state?.[key])) throw new Error(`Authoritative operational snapshot is missing ${key}`);
    fresh[key] = state[key];
  }
  return fresh;
}
