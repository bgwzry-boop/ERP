// 负责人 2026-11-08：开单即出库。现货、客户当场拿走的单子：
//   1. 开单后打一张自提单（几样货合在一张上），办公室看纸确认打出来了；
//   2. 点「客户已拿走」，每样货依次：纸单交库房 → 库房实物出库（扣库存）→ 客户提货完成。
// 每一步都走原来的接口和检查（纸单必须确认打印过、数量按纸单），只是不用一样一样点。
// 中途断了再点一次：已经做完的步骤会跳过，不会重复扣库存。
import { createOfficeIdempotencyKey } from "../../services/officeApiClientCore.js";
import {
  completeOfficeFulfillment,
  getOfficeFulfillment,
  handoffOfficePaperOutbound,
  printOfficeFulfillment,
  recordOfficeWarehouseOutboundExecution,
} from "../../services/officeFulfillmentApiClient.js";
import { listOfficePrintJobs } from "../../services/officePrintJobApiClient.js";
import { printNotesInBrowser } from "./printFulfillmentNotes.js";

const DONE_STATUSES = new Set(["已交付", "已提货", "已完成"]);
const BROWSER_PRINT_MODES = new Set(["browser_download", "manual"]);
const PRINTED_PAPER_STATUSES = new Set(["已打印待交库房", "已交库房"]);
const text = (value) => String(value ?? "").trim();
const paperId = (paper) => paper?.paperOutboundDocumentId ?? paper?.id;
const refreshError = () => Object.assign(new Error("自提单或出库记录已变更，请重新读取，并核对纸单和实物数量。"), { refreshRequired: true });

async function read(fulfillmentId, auth) {
  const result = await getOfficeFulfillment({ fulfillmentId, ...auth }, { serverRequired: true });
  if (result.blocked || !result.fulfillment) throw new Error(result.error?.message || "读取出库记录失败，请重试。");
  return result.fulfillment;
}

function failed(result, fallback) {
  return result?.blocked || result?.source !== "api" ? new Error(result?.error?.message || fallback) : null;
}

/** Creates (or finds) the pickup-note print jobs of every item and prints them as one sheet. */
export async function printWalkInPickupNote({ fulfillmentIds, pickerName = "", authState, operatorId }) {
  const auth = { authState, operatorId };
  const jobIds = [];
  try {
    for (const fulfillmentId of fulfillmentIds) {
      const fulfillment = await read(fulfillmentId, auth);
      if (DONE_STATUSES.has(text(fulfillment.status)) || fulfillment.physicalOutboundAt) continue;
      const paperStatus = text(fulfillment.paperOutboundDocument?.status);
      if (PRINTED_PAPER_STATUSES.has(paperStatus)) continue;
      if (paperStatus === "待打印确认" && fulfillment.printRecordId) {
        const jobs = await listOfficePrintJobs({ ...auth, query: { printRecordId: fulfillment.printRecordId, status: "queued" } }, { serverRequired: true });
        const job = (jobs.items ?? []).find((row) => BROWSER_PRINT_MODES.has(text(row.driverMode)) && row.jobStatus === "queued");
        if (job) { jobIds.push(job.printJobId); continue; }
      }
      const printed = await printOfficeFulfillment({
        ...auth,
        fulfillment,
        action: "打印出库单",
        printAction: "first_print",
        ...(text(pickerName) ? { pickerName: text(pickerName) } : {}),
        idempotencyKey: createOfficeIdempotencyKey(),
      }, { serverRequired: true });
      const error = failed(printed, "自提单没有建好，请重试。");
      if (error) throw error;
      if (!BROWSER_PRINT_MODES.has(text(printed.printJob?.driverMode))) {
        throw new Error("这台打印机由打印程序打，请到打印中心完成打印后再点「客户已拿走」。");
      }
      jobIds.push(printed.printJobId ?? printed.printJob?.printJobId);
    }
  } catch (error) {
    return { printed: false, message: error.message };
  }
  if (!jobIds.length) return { printed: true, message: "自提单已经打过了，可以点「客户已拿走」。" };
  return printNotesInBrowser({ printJobIds: jobIds, authState, operatorId, sheetCount: fulfillmentIds.length });
}

function pickupSnapshot(fulfillment) {
  const paper = fulfillment.paperOutboundDocument;
  if (DONE_STATUSES.has(text(fulfillment.status))) {
    return { fulfillment, paper, quantity: fulfillment.actualQty ?? null, done: true };
  }
  if (fulfillment.legacyStateReviewRequired || ["已取消", "已作废"].includes(text(fulfillment.status))) {
    throw new Error("这项货品已取消或需要核对历史记录，请到出库交付查看。");
  }
  if (!paperId(paper) || !PRINTED_PAPER_STATUSES.has(text(paper.status))) {
    throw new Error("自提单还没确认打印，请先点「打印自提单」并确认打出来。");
  }
  const quantity = Number(paper.instructionQty ?? fulfillment.expectedQty ?? fulfillment.qty);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error("自提单缺少有效出库数量，请核对后重打。");
  }
  if (fulfillment.physicalOutboundAt && (
    fulfillment.physicalOutboundDocumentId !== paperId(paper)
    || fulfillment.physicalOutboundDocumentVersion !== paper.documentVersion
    || fulfillment.actualQty !== quantity
  )) throw refreshError();
  return { fulfillment, paper, quantity, done: false };
}

export async function readWalkInPickupConfirmation({ fulfillmentIds, authState, operatorId }) {
  try {
    const rows = await Promise.all(fulfillmentIds.map(async (id) => pickupSnapshot(await read(id, { authState, operatorId }))));
    return { rows };
  } catch (error) {
    return { rows: [], message: error.message };
  }
}

function checkPickupProgress(row, current, attempt) {
  const before = row.snapshot;
  if (before.done && current.done) return false;
  const revision = current.fulfillment.revision - before.fulfillment.revision;
  const paperRevision = current.paper.revision - before.paper.revision;
  if (paperId(current.paper) !== paperId(before.paper) || current.paper.documentVersion !== before.paper.documentVersion
    || current.quantity !== before.quantity) throw refreshError();
  if (revision === 0 && paperRevision === 0 && current.paper.status === before.paper.status
    && current.fulfillment.physicalOutboundAt === before.fulfillment.physicalOutboundAt && current.done === before.done) return false;

  // A lost response can be recovered from the exact version and the saved evidence for that step.
  const progressed = revision === 1 && (
    (row.submitted === "handoff" && paperRevision === 1 && current.paper.status === "已交库房"
      && current.paper.handedToWarehouseBy === attempt.operatorId && !current.fulfillment.physicalOutboundAt)
    || (row.submitted === "outbound" && paperRevision === 0
      && current.fulfillment.physicalExecutorEmployeeId === attempt.executorEmployeeId
      && Date.parse(current.fulfillment.physicalOutboundAt) === Date.parse(attempt.executedAt)
      && current.fulfillment.latestWarehouseExecution?.result === "实物已出库"
      && current.fulfillment.latestWarehouseExecution.authenticatedOperatorId === attempt.operatorId)
    || (row.submitted === "complete" && paperRevision === 0 && current.done && current.fulfillment.finalDeliveryAt
      && current.fulfillment.physicalOutboundAt === before.fulfillment.physicalOutboundAt)
  );
  if (!progressed) throw refreshError();
  row.snapshot = current;
  row.submitted = "";
  return true;
}

/** Acts on the quantities the operator has seen, preserving each request on an interrupted retry. */
export async function completeWalkInPickup({ fulfillmentIds, confirmation, attempt, executorEmployeeId, authState, operatorId, now = () => new Date() }) {
  const auth = { authState, operatorId };
  if (!text(executorEmployeeId)) return { done: false, message: "请先选经手人（库房谁拿的货）。" };
  if (!confirmation?.length || confirmation.length !== fulfillmentIds.length
    || !confirmation.every((row, index) => row.fulfillment.id === fulfillmentIds[index])) {
    return { done: false, refreshRequired: true, message: "请先读取已确认打印的自提单，再核对实物数量。" };
  }
  attempt ??= {
    operatorId,
    executorEmployeeId,
    executedAt: now().toISOString(),
    rows: confirmation.map((snapshot) => ({ snapshot, submitted: "", keys: {
      handoff: createOfficeIdempotencyKey(), outbound: createOfficeIdempotencyKey(), complete: createOfficeIdempotencyKey(),
    } })),
  };
  const refresh = async (row) => {
    const current = pickupSnapshot(await read(row.snapshot.fulfillment.id, auth));
    return checkPickupProgress(row, current, attempt);
  };
  async function submit(row, step, write, input, message) {
    row.submitted = step;
    const result = await write({ ...auth, ...input, idempotencyKey: row.keys[step] }, { serverRequired: true });
    const error = failed(result, message);
    if (error) throw error;
    if (result.fulfillmentId !== input.fulfillment.id || !text(result.operationLogId)
      || (step === "outbound" && Number(result.warehouseOutboundExecution?.actualQty) !== input.actualQty)
      || (step === "complete" && (!result.finalDeliveryAt || !DONE_STATUSES.has(text(result.status))))
      || !(await refresh(row))) throw new Error("正在等待本次出库或提货回执。");
  }
  try {
    if (attempt.operatorId !== operatorId || attempt.executorEmployeeId !== executorEmployeeId) throw refreshError();
    await Promise.all(attempt.rows.map(refresh));
    for (const row of attempt.rows) {
      if (row.snapshot.done) continue;
      if (!row.snapshot.fulfillment.physicalOutboundAt) {
        if (row.snapshot.paper.status === "已打印待交库房") {
          await submit(row, "handoff", handoffOfficePaperOutbound, {
            fulfillment: row.snapshot.fulfillment, paperOutboundDocument: row.snapshot.paper, note: "客户现场拿货",
          }, "纸单交库房没有保存，请重试。");
        }
        await submit(row, "outbound", recordOfficeWarehouseOutboundExecution, {
          fulfillment: row.snapshot.fulfillment,
          paperOutboundDocument: row.snapshot.paper,
          result: "实物已出库",
          actualQty: row.snapshot.quantity,
          physicalExecutorEmployeeId: executorEmployeeId,
          feedbackChannel: "当面",
          executedAt: attempt.executedAt,
          note: "客户现场拿货，按自提单数量出库",
        }, "库房出库没有保存，请重试。");
      }
      await submit(row, "complete", completeOfficeFulfillment, {
        fulfillment: row.snapshot.fulfillment,
        confirmedFinalDelivery: true,
        actualQty: row.snapshot.quantity,
        remark: "客户现场拿走",
      }, "提货完成没有保存，请重试。");
    }
  } catch (error) {
    const finished = attempt.rows.filter((row) => row.snapshot.done).length;
    const prefix = finished ? `已办完 ${finished} 样，` : "";
    if (error.refreshRequired) return { done: false, finished, refreshRequired: true, message: `${prefix}${error.message}` };
    return { done: false, finished, attempt, message: `${prefix}${error.message} 再点一次「客户已拿走」会接着办，不会重复扣库存。` };
  }
  const finished = attempt.rows.length;
  return { done: true, finished, message: `${finished} 样货已出库并记成客户已拿走，库存已扣。` };
}
