// A financial directive must commit against the same statement facts it validated.
export function decisionStatementSnapshot(statement) {
  const revision = Number(statement?.revision);
  if (!statement || !Number.isInteger(revision) || revision < 1) return null;
  return {
    id: String(statement.id ?? statement.statementId ?? "").trim(),
    revision,
    status: String(statement.status ?? "").trim(),
    receivable: amount(statement.receivable),
    received: amount(statement.received),
    variance: amount(statement.variance),
  };
}

function amount(value) {
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
