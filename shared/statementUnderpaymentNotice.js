export const UNDERPAYMENT_READ_AUDIENCES = Object.freeze(["老板", "财务", "管理"]);
export const UNDERPAYMENT_READ_TODO_TYPE = "收款少付差额待阅";
export const UNDERPAYMENT_EFFECTIVE_STATUS = "少付已登记";

export function underpaymentNoticeAudience(todo) {
  if (UNDERPAYMENT_READ_AUDIENCES.includes(todo?.audience)) return todo.audience;
  const match = String(todo?.summary ?? "").match(/^待阅·(老板|财务|管理)/u);
  return match?.[1] ?? "";
}

export function missingUnderpaymentAudiences(todos, statementId) {
  const covered = new Set(
    (Array.isArray(todos) ? todos : [])
      .filter((todo) => todo?.type === UNDERPAYMENT_READ_TODO_TYPE && (todo.ref === statementId || todo.refId === statementId))
      .map(underpaymentNoticeAudience)
      .filter(Boolean),
  );
  return UNDERPAYMENT_READ_AUDIENCES.filter((audience) => !covered.has(audience));
}
