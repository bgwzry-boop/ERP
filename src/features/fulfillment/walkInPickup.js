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
const text = (value) => String(value ?? "").trim();

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
      if (["已打印待交库房", "已交库房"].includes(paperStatus)) continue;
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

/** Hands the printed notes to the warehouse, records the physical outbound and completes the pickup. */
export async function completeWalkInPickup({ fulfillmentIds, executorEmployeeId, authState, operatorId, now = () => new Date() }) {
  const auth = { authState, operatorId };
  if (!text(executorEmployeeId)) return { done: false, message: "请先选经手人（库房谁拿的货）。" };
  let finished = 0;
  try {
    for (const fulfillmentId of fulfillmentIds) {
      let fulfillment = await read(fulfillmentId, auth);
      if (DONE_STATUSES.has(text(fulfillment.status))) { finished += 1; continue; }
      if (!fulfillment.physicalOutboundAt) {
        if (text(fulfillment.paperOutboundDocument?.status) === "已打印待交库房") {
          const handed = await handoffOfficePaperOutbound({ ...auth, fulfillment, paperOutboundDocument: fulfillment.paperOutboundDocument, note: "客户现场拿货", idempotencyKey: createOfficeIdempotencyKey() }, { serverRequired: true });
          const error = failed(handed, "纸单交库房没有保存，请重试。");
          if (error) throw error;
          fulfillment = await read(fulfillmentId, auth);
        }
        if (text(fulfillment.paperOutboundDocument?.status) !== "已交库房") {
          throw new Error("自提单还没确认打印，请先点「打印自提单」并确认打出来。");
        }
        const qty = Number(fulfillment.qty ?? fulfillment.expectedQty ?? 0);
        const executed = await recordOfficeWarehouseOutboundExecution({
          ...auth,
          fulfillment,
          paperOutboundDocument: fulfillment.paperOutboundDocument,
          result: "实物已出库",
          actualQty: qty,
          physicalExecutorEmployeeId: executorEmployeeId,
          feedbackChannel: "当面",
          executedAt: now().toISOString(),
          note: "客户现场拿货，按自提单数量出库",
          idempotencyKey: createOfficeIdempotencyKey(),
        }, { serverRequired: true });
        const error = failed(executed, "库房出库没有保存，请重试。");
        if (error) throw error;
        fulfillment = await read(fulfillmentId, auth);
      }
      const completed = await completeOfficeFulfillment({
        ...auth,
        fulfillment,
        confirmedFinalDelivery: true,
        actualQty: fulfillment.actualQty ?? fulfillment.qty,
        remark: "客户现场拿走",
        idempotencyKey: createOfficeIdempotencyKey(),
      }, { serverRequired: true });
      const error = failed(completed, "提货完成没有保存，请重试。");
      if (error) throw error;
      finished += 1;
    }
  } catch (error) {
    return { done: false, finished, message: `${finished ? `已办完 ${finished} 样，` : ""}${error.message} 再点一次「客户已拿走」会接着办，不会重复扣库存。` };
  }
  return { done: true, finished, message: `${finished} 样货已出库并记成客户已拿走，库存已扣。` };
}
