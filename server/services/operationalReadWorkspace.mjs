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

export async function operationalReadWorkspace(workspace, pathname, method = 'GET') {
  const specializedRead = new Set([
    '/api/fulfillments/operator-candidates', '/api/fulfillments/picker-suggestions',
    '/api/statements/export-storage-diagnostics', '/api/statements/export-v1-readiness',
  ]);
  if (specializedRead.has(pathname)) return workspace;
  const isFulfillmentPath = pathname === '/api/fulfillments' || pathname.startsWith('/api/fulfillments/');
  const isDriverTaskPath = pathname === '/api/driver/delivery-tasks' || pathname.startsWith('/api/driver/delivery-tasks/');
  const fulfillmentWrite = method === 'POST' && (isFulfillmentPath || isDriverTaskPath)
    && /\/(?:print|stock-preparation|quantity-variance-resolution|note-correction|paper-handoff|warehouse-execution|cancel|complete|pickup-confirm|dispatch|exception|delivery-exception-resolution|delivery-evidence-review|load-confirm)$/.test(pathname);
  const noteVoid = method === 'POST' && /^\/api\/print-records\/[^/]+\/void$/.test(pathname);
  const noteRead = method === 'GET' && pathname === '/api/print-jobs/note.pdf';
  const noteWrite = method === 'POST' && (pathname === '/api/print-jobs/status-poll'
    || /^\/api\/print-jobs\/[^/]+\/(?:browser-printed|dispatch|driver-status|poll-status)$/.test(pathname));
  const operationalRead = method === 'GET' && (pathname === '/api/todos'
    || pathname === '/api/operation-logs'
    || pathname === '/api/inventory/items'
    || /^\/api\/inventory\/items\/[^/]+$/.test(pathname)
    || isDriverTaskPath
    || pathname === '/api/fulfillments'
    || /^\/api\/fulfillments\/[^/]+$/.test(pathname)
    || pathname === '/api/statements/customers'
    || /^\/api\/statements\/[^/]+$/.test(pathname));
  const repository = workspace.coreWorkspaceReadRepository;
  if (!(operationalRead || fulfillmentWrite || noteRead || noteWrite || noteVoid) || repository?.kind !== 'postgres') return workspace;
  const decisionRepository = workspace.businessDecisionEvidenceRepository;
  const printJobRepository = workspace.printJobRepository;
  const dispatchRepository = workspace.driverDeliveryDispatchRepository;
  const needsDecisions = fulfillmentWrite && /\/(?:quantity-variance-resolution|note-correction|delivery-exception-resolution)$/.test(pathname);
  const needsDispatches = isDriverTaskPath || (isFulfillmentPath && (method === 'GET' || pathname.endsWith('/dispatch')));
  const [state, decisions, printJobs, dispatches] = await Promise.all([
    repository.loadState(),
    needsDecisions && decisionRepository?.kind === 'postgres' ? decisionRepository.loadState() : null,
    (noteRead || noteWrite) && printJobRepository?.kind === 'postgres' ? printJobRepository.loadState() : null,
    needsDispatches && dispatchRepository?.kind === 'postgres' ? dispatchRepository.loadState() : null,
  ]);
  const fresh = { ...workspace };
  for (const key of businessCollections) {
    if (!Array.isArray(state?.[key])) throw new Error(`Authoritative operational snapshot is missing ${key}`);
    fresh[key] = state[key];
  }
  if (decisions) {
    fresh.businessDecisionRecords = decisions.businessDecisionRecords;
    fresh.businessDecisionAuthorizations = decisions.businessDecisionAuthorizations;
  }
  if (printJobs) fresh.printJobs = printJobs.printJobs;
  if (dispatches) fresh.driverDeliveryDispatches = dispatches.driverDeliveryDispatches;
  return fresh;
}
