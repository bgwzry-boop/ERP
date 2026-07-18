export async function handleBusinessDecisionReadRoutes({
  method,
  url,
  response,
  workspace,
  permissionContext,
  requireActionPermission,
  businessDecisionReadProjectionService,
  sendJson,
} = {}) {
  if (method !== "GET") return false;
  if (!["/api/business-decisions", "/api/business-decision-authorizations"].includes(url.pathname)) return false;
  const includeAll = url.searchParams.get("includeAll") === "true";
  const requiredPermission = includeAll ? "business_decision.authorization.manage" : "business_decision.read";
  if (!requireActionPermission(response, permissionContext, requiredPermission)) return true;
  if (url.pathname === "/api/business-decisions") {
    const records = await workspace.businessDecisionEvidenceRepository.listBusinessDecisions({
      workspace,
      filters: {
        businessType: url.searchParams.get("businessType") ?? "",
        businessId: url.searchParams.get("businessId") ?? "",
        decisionScope: url.searchParams.get("decisionScope") ?? "",
        status: url.searchParams.get("status") ?? "",
      },
    });
    const items = businessDecisionReadProjectionService.listDecisions(workspace, records);
    sendJson(response, 200, { items, total: items.length, readOnly: true });
    return true;
  }
  const records = await (workspace.businessDecisionAuthorizationRepository?.listAuthorizations
    ? workspace.businessDecisionAuthorizationRepository.listAuthorizations({
        workspace,
        filters: {
          scope: url.searchParams.get("scope") ?? "",
          employeeId: url.searchParams.get("employeeId") ?? "",
          status: url.searchParams.get("status") ?? "",
        },
      })
    : workspace.businessDecisionEvidenceRepository.listBusinessDecisionAuthorizations({
    workspace,
    filters: {
      scope: url.searchParams.get("scope") ?? "",
      employeeId: url.searchParams.get("employeeId") ?? "",
    },
  }));
  const items = businessDecisionReadProjectionService.listAuthorizations(workspace, records, {
    scope: url.searchParams.get("scope") ?? "",
    employeeId: url.searchParams.get("employeeId") ?? "",
    status: url.searchParams.get("status") ?? "",
    asOf: url.searchParams.get("asOf") ?? "",
    effectiveOnly: includeAll ? url.searchParams.get("effectiveOnly") === "true" : true,
  });
  sendJson(response, 200, { items, total: items.length, readOnly: true, includeAll, asOf: url.searchParams.get("asOf") ?? "" });
  return true;
}
