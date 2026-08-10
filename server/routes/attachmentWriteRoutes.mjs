import { validateBusinessDecisionEvidenceAttachmentUpload } from "../services/businessDecisionEvidenceDraftCommandService.mjs";
import { readBinaryRequestBody } from "../httpBinaryBody.mjs";
import { getAttachmentPurposeRule } from "../services/attachmentCreateService.mjs";

export async function handleAttachmentWriteRoutes({
  method,
  request,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  requireAttachmentCreatePermission,
  getPermissionOperatorId,
  attachmentCreateCommandService,
  attachmentFileAccessService,
  sendJson,
  sendBusinessError,
}) {
  if (method !== "POST" || !["/api/attachments", "/api/attachments/binary"].includes(url.pathname)) return false;
  if (url.pathname === "/api/attachments/binary") {
    if (!requireAttachmentCreatePermission(response, permissionContext, body)) return true;
    const evidenceValidation = await validateBusinessDecisionEvidenceAttachmentUpload({ workspace, body, permissionContext });
    if (evidenceValidation.error) {
      sendBusinessError(response, evidenceValidation.statusCode, evidenceValidation.code, evidenceValidation.message);
      return true;
    }
    const rule = getAttachmentPurposeRule(body.purpose);
    const buffer = await readBinaryRequestBody(request, rule.maxBytes, body.fileSize);
    const result = await attachmentCreateCommandService.createAttachment({
      workspace,
      body,
      contentPayload: {
        buffer,
        contentType: body.mimeType || request.headers["content-type"] || "application/octet-stream",
      },
      operatorId: getPermissionOperatorId(permissionContext, authContext),
    });
    if (!result.ok) {
      sendBusinessError(response, result.statusCode, result.errorCode, result.message);
      return true;
    }
    sendJson(response, 200, {
      ...attachmentFileAccessService.toAttachmentSummary(result.attachment),
      deduplicated: result.deduplicated,
      duplicateOfAttachmentId: result.duplicateOfAttachmentId,
      operationLogId: result.operationLogId,
    });
    return true;
  }
  if (!requireAttachmentCreatePermission(response, permissionContext, body)) return true;
  const evidenceValidation = await validateBusinessDecisionEvidenceAttachmentUpload({ workspace, body, permissionContext });
  if (evidenceValidation.error) {
    sendBusinessError(response, evidenceValidation.statusCode, evidenceValidation.code, evidenceValidation.message);
    return true;
  }
  const result = await attachmentCreateCommandService.createAttachment({
    workspace,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext),
  });
  if (!result.ok) {
    sendBusinessError(response, result.statusCode, result.errorCode, result.message);
    return true;
  }
  sendJson(response, 200, {
    ...attachmentFileAccessService.toAttachmentSummary(result.attachment),
    deduplicated: result.deduplicated,
    duplicateOfAttachmentId: result.duplicateOfAttachmentId,
    operationLogId: result.operationLogId,
  });
  return true;
}
