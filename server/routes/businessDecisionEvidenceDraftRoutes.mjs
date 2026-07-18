import { canAccessBusinessDecisionEvidenceDraft } from "../services/businessDecisionEvidenceDraftCommandService.mjs";

export async function handleBusinessDecisionEvidenceDraftRoutes({
  method, url, response, workspace, body, permissionContext, authContext,
  requireActionPermission, getPermissionOperatorId, businessDecisionEvidenceDraftCommandService,
  sendCommandResponse,
} = {}) {
  const create = method === "POST" && url.pathname === "/api/business-decision-evidence-drafts";
  const match = url.pathname.match(/^\/api\/business-decision-evidence-drafts\/([^/]+)(?:\/(void))?$/);
  const attachmentMatch = url.pathname.match(/^\/api\/business-decision-evidence-drafts\/([^/]+)\/attachments\/([^/]+)\/void$/);
  const read = method === "GET" && match && !match[2];
  const voiding = method === "POST" && match?.[2] === "void";
  const voidingAttachment = method === "POST" && Boolean(attachmentMatch);
  if (!create && !read && !voiding && !voidingAttachment) return false;
  if (!requireActionPermission(response, permissionContext, "business_decision.record_delegated")) return true;

  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  if (create) {
    const result = await businessDecisionEvidenceDraftCommandService.createDraft({ workspace, body, operatorId });
    sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
    return true;
  }
  const draftId = decodeURIComponent(attachmentMatch?.[1] ?? match[1]);
  const draft = await workspace.businessDecisionEvidenceDraftRepository.findDraft({ workspace, draftId });
  if (!draft || !canAccessBusinessDecisionEvidenceDraft({ permissionContext, draft })) {
    const result = draft
      ? { error: true, statusCode: 403, code: "BUSINESS_DECISION_EVIDENCE_DRAFT_ACCESS_DENIED", message: "当前账号无权访问该凭据草稿。" }
      : { error: true, statusCode: 404, code: "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", message: "凭据草稿不存在。" };
    sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
    return true;
  }
  const result = voidingAttachment
    ? await businessDecisionEvidenceDraftCommandService.voidAttachment({ workspace, draftId, attachmentId: decodeURIComponent(attachmentMatch[2]), body, operatorId })
    : voiding
      ? await businessDecisionEvidenceDraftCommandService.voidDraft({ workspace, draftId, body, operatorId })
      : await businessDecisionEvidenceDraftCommandService.getDraft({ workspace, draftId });
  sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
  return true;
}
