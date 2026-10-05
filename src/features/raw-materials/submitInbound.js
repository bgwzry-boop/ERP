// The current office action callback accepts (action, inboundId, options).
// Keep the selected revision with the action; the API controller remains the
// authority that resolves the latest record and submits the actual request.
export function submitInboundAction(onAction, inbound, action, body = {}) {
  if (typeof onAction !== "function" || !inbound?.id) return undefined;
  return onAction(action, inbound.id, { expectedRevision: inbound.revision, ...body });
}
