import { captureStatementExportSnapshot } from "./statementExportSnapshotService.mjs";
import { createStatementPreviewProjectionService } from "./statementPreviewProjectionService.mjs";

const { buildPreviewLines } = createStatementPreviewProjectionService();

export function verifyStatementOutput(workspace, statement, lines = buildPreviewLines(workspace, statement, { persistedOnly: true })) {
  const snapshot = captureStatementExportSnapshot(workspace, statement.id);
  if (!snapshot) return {
    error: true,
    statusCode: 409,
    code: "STATEMENT_EXPORT_SNAPSHOT_CONFLICT",
    message: "账单版本缺失，请刷新账单后重新生成。",
  };
  return validateExportLines(statement, lines) ?? { snapshot, lines };
}

// New files must use finalized accounting facts. Replays retain their saved snapshot.
function validateExportLines(statement, lines) {
  const reject = message => ({ error: true, statusCode: 422, code: "STATEMENT_EXPORT_ACCOUNTING_INCOMPLETE", message });
  if (!Array.isArray(lines) || !lines.length) return reject("账单缺少持久明细，请先完成账单生成与复核。");
  const receivable = moneyCents(statement.receivable);
  if (receivable === null || receivable < 0) return reject("账单应收金额未确认，请先复核。");
  let total = 0;
  const identities = new Set();
  for (const line of lines) {
    if (!line.statementLineId || identities.has(line.statementLineId) || line.statementId !== statement.id) {
      return reject("账单明细归属或编号异常，请先复核。");
    }
    identities.add(line.statementLineId);
    const quantities = [line.deliveredQty, line.chargeableQty, line.freeQty];
    if (quantities.some(value => !Number.isSafeInteger(value) || value < 0)
      || line.deliveredQty !== line.chargeableQty + line.freeQty) {
      return reject("账单实交、计费与赠送数量未确认或不一致，请先复核。");
    }
    const amount = moneyCents(line.amount);
    const adjustment = moneyCents(line.adjustmentAmount);
    const final = moneyCents(line.finalAmount);
    if (amount === null || adjustment === null || final === null || amount < 0 || final < 0
      || amount + adjustment !== final) return reject("账单明细金额或调整金额未确认，请先复核。");
    total += final;
    if (!Number.isSafeInteger(total)) return reject("账单金额超出可核算范围。");
  }
  if (total !== receivable) return reject("账单明细合计与应收金额不一致，请先复核。");
  return null;
}

function moneyCents(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const scaled = Number(value) * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) < 0.000001 ? cents : null;
}
