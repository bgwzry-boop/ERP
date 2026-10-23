// Consumption and return follow the current issue; neither action transfers work.
const text = value => typeof value === "string" ? value.trim() : "";
export function resolveRawMaterialIssueAssignment(roll, issue, request = {}) {
  if (!issue) return null;
  const result = {};
  for (const key of ["machineId", "productionTaskId"]) {
    const source = text(issue[key]);
    const current = text(roll?.[key]);
    const requested = text(request[key]);
    const equivalent = (a,b) => key === "machineId" ? machineKey(a) === machineKey(b) : a === b;
    if (source && current && !equivalent(source,current)) return null;
    const value = source || current;
    if (requested && !equivalent(requested,value)) return null;
    result[key] = value;
  }
  return result;
}
export function requireRawMaterialIssueAssignment(roll, issue, request) {
  const result = resolveRawMaterialIssueAssignment(roll, issue, request);
  if (!result) throw Object.assign(new Error("当前卷的机台或生产任务与领料记录不一致，请核对后重试；消耗和退回不能变更领料归属。"), {statusCode: 422, code: "RAW_MATERIAL_ISSUE_ASSIGNMENT_CONFLICT"});
  return result;
}

function machineKey(value) {
  const s = text(value).toUpperCase();
  const match = s.match(/^(?:([1-9])号机|制袋机?-0([1-9])|BAG-0([1-9]))$/u);
  return match ? `BAG-0${match.slice(1).find(Boolean)}` : s === "1号制袋机" ? "BAG-01" : s;
}
