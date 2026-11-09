import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addOfficeCustomerDeliveryAddress, createOfficeCustomer, getOfficeCustomerDeliveryAddresses, getOfficeCustomerProfile, getOfficeDraft, searchOfficeCustomers } from "../../../../src/services/officeOrderApiClient.js";
import { quoteOfficeOrderDraft } from "../../../../src/services/officeOrderPricingApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { isStockOrderType, normalizeOrderType } from "../../../../shared/orderRouting.js";
import { splitDraftRow } from "../../../../src/state/officeDraftActions.js";
import { OrderEntrySplitDialog } from "./OrderEntrySplitDialog.jsx";
import { buildStockPickingSlipHtml, buildStockPickingSlips, selectConfirmedStockLines } from "../../../../src/domain/stockPickingSlip.js";
import { printStockPickingSlip } from "../../../../src/features/fulfillment/printStockPickingSlip.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import { completeWalkInPickup, printWalkInPickupNote } from "../../../../src/features/fulfillment/walkInPickup.js";
import { getOfficeFulfillmentOperatorCandidates } from "../../../../src/services/officeFulfillmentApiClient.js";
import "./finance-dialogs.css";
import "./order-pricing-entry.css";

const unresolvedWrites = new Map();
const emptyPricingInputs = JSON.stringify([{}, [], "", "", false]);

const money = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `¥${value.toFixed(2)}`
    : "待核价";
const privatePrint = (line) =>
  normalizeOrderType(line.orderType) !== "stock_printed" &&
  (line.print === "是" ||
    ["custom_print", "external_print"].includes(
      normalizeOrderType(line.orderType),
    ));
const draftIdentity = (item) =>
  item?.id || item?.draftId || item?.draft?.id || item?.draft?.draftId || "";
function editableDraft(item) {
  if (!item) return null;
  if (!item.draft) return item;
  return {
    ...item.draft,
    id: draftIdentity(item),
    lines: item.rows ?? item.draft.lines ?? [],
  };
}

// The queue is a separate read model, not a complete draft directory. A hold
// conversion can navigate to an accepted manual draft outside that queue.
export default function OrderPricingEntryWorkspace({
  formal,
  onNavigate,
  quoteDraft = quoteOfficeOrderDraft,
  loadDraft = getOfficeDraft,
}) {
  const selectedId = formal.entryDraftId || "";
  const newEntry = !selectedId && formal.entryCreationId > 0;
  const session = formal.authState?.session?.accessToken || "";
  // Keep the accepted default draft stable while editing or showing its receipt.
  // Refreshing the queue can remove a confirmed draft; it must not silently
  // remount the editor on a different draft and erase the successful result.
  const defaultDraft = useRef({ session, draft: null });
  if (defaultDraft.current.session !== session) defaultDraft.current = { session, draft: null };
  if (!selectedId && !newEntry && !formal.orderEntrySuppressDefaultDraft && !defaultDraft.current.draft && formal.data.orderDrafts?.[0]) {
    defaultDraft.current.draft = editableDraft(formal.data.orderDrafts[0]);
  }
  const selectionKey = `${session}:${selectedId}`;
  const queued = (formal.data.orderDrafts ?? []).find(
    (item) => draftIdentity(item) === selectedId,
  );
  const [directState, setDirectState] = useState(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const direct = directState?.key === selectionKey ? directState : null;
  const cachedDraft = direct?.draft ?? null;
  const needsRead = !!selectedId && !queued && !cachedDraft;
  useEffect(() => {
    if (!needsRead) return;
    let active = true;
    const controller = new AbortController();
    setDirectState({
      key: selectionKey,
      status: "loading",
      draft: null,
      error: "",
    });
    Promise.resolve()
      .then(() =>
        loadDraft(
          { authState: formal.authState, draftId: selectedId },
          { serverRequired: true, signal: controller.signal },
        ),
      )
      .then((result) => {
        if (!active) return;
        const draft = editableDraft(result.item);
        if (
          result.source !== "api" ||
          result.blocked ||
          !draft ||
          draftIdentity(draft) !== selectedId ||
          !Array.isArray(draft.lines ?? draft.rows)
        ) {
          setDirectState({
            key: selectionKey,
            status: "error",
            draft: null,
            error:
              result.error?.message ||
              "没有读取到所选订单草稿，请核对权限和草稿编号后重试。",
          });
          return;
        }
        setDirectState({
          key: selectionKey,
          status: "ready",
          draft,
          error: "",
        });
      })
      .catch(() => {
        if (active)
          setDirectState({
            key: selectionKey,
            status: "error",
            draft: null,
            error: "所选订单草稿暂时读取失败，请重试。",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectionKey, selectedId, session, needsRead, loadDraft, readAttempt]);
  const selected = selectedId
    ? cachedDraft || editableDraft(queued)
    : newEntry ? null : defaultDraft.current.draft;
  const identity = `${session}:${selectedId || (newEntry ? `new-${formal.entryCreationId}` : draftIdentity(selected))}`;
  if (selectedId && !selected) {
    if (direct?.status === "error")
      return (
        <div role="alert">
          <p>{direct.error}</p>
          <button
            type="button"
            onClick={() => setReadAttempt((value) => value + 1)}
          >
            重新读取所选草稿
          </button>
        </div>
      );
    return <div role="status">正在读取所选订单草稿…</div>;
  }
  return (
    <OrderPricingEditor
      key={identity}
      formal={formal}
      onNavigate={onNavigate}
      selected={selected}
      recoveryKey={identity}
      quoteDraft={quoteDraft}
    />
  );
}

function OrderPricingEditor({
  formal,
  onNavigate,
  selected,
  quoteDraft,
  recoveryKey,
}) {
  const recovered = unresolvedWrites.get(recoveryKey);
  const initial = recovered?.state;
  const [source, setSource] = useState(
    initial?.source ?? selected?.sourceText ?? "",
  );
  const [savedSource, setSavedSource] = useState(
    initial?.savedSource ?? selected?.sourceText ?? "",
  );
  // An empty paste box must not erase the original on a subsequent draft write.
  const draftSource = source.trim() ? source : savedSource;
  const [rows, setRows] = useState(
    initial?.rows ?? selected?.lines ?? selected?.rows ?? [],
  );
  const [savedRows, setSavedRows] = useState(initial?.savedRows ?? rows);
  const [draftId, setDraftId] = useState(
    initial?.draftId ?? draftIdentity(selected),
  );
  const [revision, setRevision] = useState(
    Number(
      initial?.revision ?? selected?.revision ?? selected?.clientRevision ?? 0,
    ),
  );
  const [quote, setQuote] = useState(initial?.quote ?? null),
    [overrides, setOverrides] = useState(initial?.overrides ?? {}),
    [supplementIds, setSupplementIds] = useState(initial?.supplementIds ?? []),
    [batch, setBatch] = useState(initial?.batch ?? ""),
    [reason, setReason] = useState(initial?.reason ?? ""),
    [sameBatch, setSameBatch] = useState(initial?.sameBatch ?? false),
    [affected, setAffected] = useState(initial?.affected ?? []);
  const pricingInputs = JSON.stringify([overrides, supplementIds, batch, reason, sameBatch]);
  const [savedPricingInputs, setSavedPricingInputs] = useState(initial?.savedPricingInputs ?? emptyPricingInputs);
  const [splitPlan, setSplitPlan] = useState(initial?.splitPlan ?? null);
  // Owner decision 2026-10-29: when stock is short the office records what this customer wants.
  const [shortageChoice, setShortageChoice] = useState(initial?.shortageChoice ?? ""),
    [shortageNote, setShortageNote] = useState(initial?.shortageNote ?? ""),
    [shortageAsked, setShortageAsked] = useState(initial?.shortageAsked ?? false);
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(
      recovered ? `${recovered.kind}结果待核对，请按原内容重试。` : "",
    ),
    [complete, setComplete] = useState(false);
  // 备货小票（负责人 2026-11-05）：现货单确认后给库房打一张小票配货。
  const [confirmedLineIds, setConfirmedLineIds] = useState([]);
  const sourceInput = useRef(null);
  const splitTrigger = useRef(null);
  const requests = useRef({});
  const frozenRequest = useRef(recovered ?? null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const autoConfirm = useRef(false);
  const [walkIn, setWalkIn] = useState(null);
  const [pendingKind, setPendingKind] = useState(recovered?.kind ?? "");
  const newOrderBlocked = Boolean(busy || pendingKind || splitPlan);
  const editingLocked = complete || newOrderBlocked;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    formal.actions.setOrderEntryWritePending?.(
      !!pendingKind,
      frozenRequest.current?.ownerKey ?? recoveryKey,
    );
    if (!pendingKind) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingKind, formal.actions.setOrderEntryWritePending, recoveryKey]);
  const actionPermissions = formal.permissionContext?.actionPermissions || formal.authState?.permissions?.actionPermissions || [];
  const canEditDraft = actionPermissions.includes("order.draft.save");
  const canConfirmOrder = actionPermissions.includes("order.confirm");
  const allowed = (
    formal.permissionContext?.actionPermissions ||
    formal.authState?.permissions?.actionPermissions ||
    []
  ).includes("order.price.override");
  const locked = ["mini_program", "wechat_mini_program"].includes(
    selected?.sourceChannel,
  );
  const invalidate = () => {
    setQuote(null);
    setAffected([]);
    setSplitPlan(null);
    requests.current = {};
  };
  const updateSource = (value) => {
    if (editingLocked || inFlight.current || frozenRequest.current) return;
    invalidate();
    setSource(value);
  };
  const update = (index, key, value) => {
    if (frozenRequest.current || splitPlan) return;
    invalidate();
    setRows((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  };
  // 整单填一次的字段（交付、需要日期、客户）：改一次，每一行都跟着改。
  const updateAll = (key, value) => {
    if (frozenRequest.current || splitPlan) return;
    invalidate();
    setRows((current) => current.map((line) => ({ ...line, [key]: value })));
  };
  const [expandedRows, setExpandedRows] = useState([]);
  const [pickedCustomer, setPickedCustomer] = useState(
    initial?.pickedCustomer ?? null,
  );
  const hasUnsavedChanges = !complete && Boolean(
    draftSource !== savedSource || rows !== savedRows || pricingInputs !== savedPricingInputs
    || (!rows.length && pickedCustomer) || shortageChoice || shortageNote.trim() || affected.length,
  );
  const registerOrderEntryEditor = formal.actions.registerOrderEntryEditor;
  useLayoutEffect(() => registerOrderEntryEditor?.({ dirty: hasUnsavedChanges, blocked: newOrderBlocked }),
    [registerOrderEntryEditor, hasUnsavedChanges, newOrderBlocked]);
  // 消息开头或结尾写的客户名字（识别回执带回）；系统里没有时提示新建。
  const [customerHint, setCustomerHint] = useState(initial?.customerHint ?? null);
  const pickCustomer = (customer) => {
    if (frozenRequest.current || splitPlan || !customer?.customerId) return;
    setPickedCustomer({ customerId: customer.customerId, name: customer.name, selectionSource: "manual" });
    setCustomerHint(null);
    if (!rows.length) return;
    invalidate();
    setRows((current) => current.map((line) => ({ ...line, customerId: customer.customerId, customer: customer.name, customerName: customer.name })));
  };
  const override = (id, key, value) => {
    if (frozenRequest.current || splitPlan) return;
    invalidate();
    setOverrides((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value },
    }));
  };
  const nextKey = (kind) =>
    (requests.current[kind] ||= createOfficeIdempotencyKey());
  const execute = async (kind, input, invoke, accept) => {
    if (
      inFlight.current ||
      (frozenRequest.current && frozenRequest.current.kind !== kind)
    )
      return;
    const request = frozenRequest.current ?? {
      kind,
      ownerKey: `order-entry:${input.idempotencyKey}`,
      input: structuredClone(input),
      uncertain: false,
      state: structuredClone({
        source,
        savedSource,
        rows,
        savedRows,
        savedPricingInputs,
        draftId,
        revision,
        quote,
        overrides,
        supplementIds,
        batch,
        reason,
        sameBatch,
        affected,
        splitPlan,
        shortageChoice,
        shortageNote,
        shortageAsked,
        pickedCustomer,
        customerHint,
      }),
    };
    frozenRequest.current = request;
    unresolvedWrites.set(recoveryKey, request);
    setPendingKind(kind);
    formal.actions.setOrderEntryWritePending?.(true, request.ownerKey);
    inFlight.current = true;
    setBusy(kind);
    try {
      const result = await invoke(request.input);
      if (!mounted.current) {
        request.uncertain = true;
        return;
      }
      if (result.source !== "api")
        throw Object.assign(
          new Error(
            result.error?.message || `${kind}未取得完整回执，请按原内容重试。`,
          ),
          { status: result.error?.status, code: result.error?.code },
        );
      accept(result);
      frozenRequest.current = null;
      unresolvedWrites.delete(recoveryKey);
      setPendingKind("");
      formal.actions.setOrderEntryWritePending?.(false, request.ownerKey);
    } catch (error) {
      if (!mounted.current) {
        request.uncertain = true;
        return;
      }
      if (!request.uncertain && error.status >= 400 && error.status < 500) {
        frozenRequest.current = null;
        unresolvedWrites.delete(recoveryKey);
        setPendingKind("");
        formal.actions.setOrderEntryWritePending?.(false, request.ownerKey);
        if (error.code === "ORDER_SHORTAGE_DECISION_REQUIRED") {
          // The quote is still valid; only the customer's answer is missing. The choice sits on
          // the entry page, so close the split dialog for it.
          requests.current.confirm = null;
          requests.current.splitConfirm = null;
          setSplitPlan(null);
          setShortageAsked(true);
        } else if (["确认", "拆单确认"].includes(kind)) {
          setQuote(null);
          setSplitPlan(null);
        }
        setNotice(error.message);
      } else {
        request.uncertain = true;
        setNotice(
          `${kind}结果待核对，当前内容已锁定，请按原内容重试。${error.message}`,
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  };
  const recognize = () =>
    execute(
      "识别",
      { sourceText: source, idempotencyKey: nextKey("recognize") },
      (input) =>
        formal.actions.recognizeOrderText(input.sourceText, {
          idempotencyKey: input.idempotencyKey,
        }),
      (result) => {
        const nextRevision = Number(
          result.draft?.revision ?? result.draft?.clientRevision,
        );
        if (
          !draftIdentity(result.draft) ||
          !Number.isSafeInteger(nextRevision) ||
          nextRevision < 1 ||
          !Array.isArray(result.rows)
        )
          throw new Error("没有取得完整识别回执。");
        invalidate();
        // 先选了客户再识别：识别出来没写客户的明细，用选好的客户。
        const manualCustomer = pickedCustomer?.selectionSource === "recognition" ? null : pickedCustomer;
        setSavedRows(result.rows);
        setRows(manualCustomer?.customerId && result.rows.some(line => !line.customerId)
          ? result.rows.map((line) => line.customerId ? line : { ...line, customerId: manualCustomer.customerId, customer: manualCustomer.name, customerName: manualCustomer.name })
          : result.rows);
        const nextCustomerHint = result.recognition?.customerHint?.name ? result.recognition.customerHint : null;
        setPickedCustomer(current => {
          if (current?.customerId && current.selectionSource !== "recognition") return current;
          return nextCustomerHint?.customerId ? {
            customerId: nextCustomerHint.customerId,
            name: nextCustomerHint.name,
            selectionSource: "recognition",
          } : null;
        });
        setCustomerHint(nextCustomerHint);
        setDraftId(draftIdentity(result.draft));
        setRevision(nextRevision);
        setSavedSource(result.draft.sourceText ?? source);
        setOverrides({});
        setSupplementIds([]);
        setBatch("");
        setReason("");
        setSameBatch(false);
        setSavedPricingInputs(emptyPricingInputs);
        setNotice(result.rows.length
          ? "已识别，请核对类型、规格、颜色和交期。"
          : "未识别出订单明细，请检查原文后重新识别。");
      },
    );
  const save = () =>
    execute(
      "保存",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: draftSource,
        idempotencyKey: nextKey("save"),
      },
      (input) => formal.actions.saveOrderDraft(input),
      (result) => {
        const nextRevision = Number(
          result.draft?.clientRevision ?? result.draft?.revision,
        );
        if (
          !result.draftId ||
          !Number.isSafeInteger(nextRevision) ||
          nextRevision < 1
        )
          throw new Error("没有取得完整保存回执。");
        invalidate();
        setDraftId(result.draftId);
        setRevision(nextRevision);
        setSavedSource(result.draft?.sourceText ?? draftSource);
        setSavedRows(rows);
        setNotice("草稿已保存。核对无误后点「开单」或「确认下单」。");
      },
    );
  const pricing = () =>
    execute(
      "报价",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: draftSource,
        idempotencyKey: nextKey("quote"),
        overrides: Object.entries(overrides)
          .filter(([, v]) => v.enabled)
          .map(([draftLineId, v]) => ({
            draftLineId,
            ...Object.fromEntries(
              ["bagPrice", "printPrice", "otherFee", "adjustmentAmount"]
                .filter(
                  (key) => v[key] !== undefined && String(v[key]).trim() !== "",
                )
                .map((key) => [key, v[key]]),
            ),
            reason: v.reason,
            ...(v.freeOfCharge ? { chargeableQty: 0, freeOfCharge: true } : {}),
          })),
        supplementation: supplementIds.length
          ? {
              orderLineIds: supplementIds,
              targetDraftLineId: rows.find(privatePrint)?.id,
              confirmedSameBatch: sameBatch,
              batchReference: batch,
              reason,
            }
          : undefined,
      },
      (input) =>
        quoteDraft(
          { ...input, authState: formal.authState },
          { serverRequired: true },
        ),
      (result) => {
        if (
          !result.quote?.quoteId ||
          result.quote.draftId !== draftId ||
          !Number.isSafeInteger(result.quote.clientRevision)
        )
          throw new Error("没有取得完整报价回执。");
        setQuote(result.quote);
        setRevision(result.quote.clientRevision);
        setSavedSource(draftSource);
        setSavedRows(rows);
        setSavedPricingInputs(pricingInputs);
        setAffected([]);
        requests.current.confirm = null;
        setNotice("价格已算好。");
      },
    );
  const confirm = () =>
    execute(
      "确认",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: draftSource,
        pricingQuoteId: quote?.quoteId,
        confirmedAffectedOrderLineIds: affected,
        shortageDecision: currentShortageDecision(),
        idempotencyKey: nextKey("confirm"),
      },
      (input) => formal.actions.confirmOrderDraft(input),
      (result) => {
        if (result.confirmation?.closedWithoutOrder === true) {
          setComplete(true);
          setNotice("已按客户意见整单取消，没有生成正式订单；草稿和取消原因已留存。");
          void Promise.resolve(formal.actions.refreshAll()).catch(() => {});
          return;
        }
        if (
          !result.confirmation?.orderLines?.length ||
          !result.confirmation.orderId
        )
          throw new Error("没有取得完整订单回执。");
        setComplete(true);
        setConfirmedLineIds(result.confirmation.orderLines.map((line) => line.id).filter(Boolean));
        // 负责人 2026-11-08：开单即出库——全是现货、客户自提的，下面直接打自提单、点「客户已拿走」。
        const pickupTasks = (result.confirmation.fulfillmentTasks ?? [])
          .filter((task) => ["自提", "pickup"].includes(String(task.method ?? "").trim()) && task.fulfillmentId);
        const walkInOrder = pickupTasks.length > 0 && rows.every((line) => isStockOrderType(line.orderType));
        setWalkIn(walkInOrder ? { fulfillmentIds: pickupTasks.map((task) => task.fulfillmentId), customerId: rows[0]?.customerId ?? "" } : null);
        setNotice(walkInOrder
          ? "正式订单已生成。客户在现场就点下面「打印自提单」，打出来后点「客户已拿走」。"
          : shortageChoice === "ship_available" && shortageVisible
          ? "正式订单已生成：有货的照常下单，缺货的明细已按客户意见取消。"
          : "正式订单已生成，办公室仍需安排出库或生产排单。");
        void Promise.resolve(formal.actions.refreshAll()).catch(() =>
          setNotice("正式订单已生成，请刷新订单池核对。"),
        );
      },
    );
  const splitLine = (index) => {
    if (editingLocked || locked || !canEditDraft) return;
    const line = rows[index];
    const blockedReason = splitLineBlockedReason(line);
    if (blockedReason) { setNotice(blockedReason); return; }
    const result = splitDraftRow(rows, line.id, formal.data.inventoryItems || [], `DL-SPLIT-${createOfficeIdempotencyKey()}`);
    if (!result || result.blocked) { setNotice(result?.toast || "当前明细无法拆分。"); return; }
    invalidate();
    setRows(result.rows);
    setOverrides((current) => {
      const next = { ...current };
      delete next[line.id];
      return next;
    });
    setNotice(`${result.toast} 请分别核对数量、交付和日期后再开单；原行的本单改价需重新填写，避免费用重复。`);
  };
  const previewSplit = async () => {
    if (inFlight.current || editingLocked || !canConfirmOrder || !draftId || !rows.length) return;
    inFlight.current = true;
    setBusy("拆单预览");
    try {
      const result = await formal.actions.previewOrderDraftSplit({ draftId, clientRevision: revision, rows, sourceText: draftSource });
      if (!mounted.current) return;
      if (result.source !== "api" || result.blocked || !result.splitPlan?.planHash ||
          result.splitPlan.draftId !== draftId || result.splitPlan.revision !== revision || !Array.isArray(result.splitPlan.groups)) {
        setNotice(result.error?.message || "未取得完整拆单预览，请重新核对后重试。");
        return;
      }
      setSplitPlan(result.splitPlan);
    } catch {
      if (mounted.current) setNotice("拆单预览暂时失败，请重试；尚未创建正式订单。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  };
  // The confirmed stock lines (空白袋、印花袋) exactly as the order pool shows them. Never the
  // draft rows: the server may have cancelled short lines when it confirmed. Until the pool
  // shows every confirmed line, the slip waits for the refresh instead of guessing.
  const confirmedSlip = selectConfirmedStockLines({ poolLines: formal.data.orderLines || [], confirmedLineIds });
  const printPickingSlip = async () => {
    if (confirmedSlip.pending) {
      setNotice("订单池还在刷新，刚确认的订单还没出现。请稍等几秒再点「打印备货小票」。");
      void Promise.resolve(formal.actions.refreshAll()).catch(() => {});
      return;
    }
    const customerNames = new Map((formal.data.customers || []).map((customer) => [customer.id ?? customer.customerId, customer.name ?? customer.customerName]));
    const html = buildStockPickingSlipHtml(buildStockPickingSlips({ orderLines: confirmedSlip.lines, customerNames }));
    if (!html) { setNotice("这张单子没有现货（空白袋、印花袋），不用打备货小票。"); return; }
    const opened = await printStockPickingSlip(html);
    if (mounted.current && !opened) setNotice("打印窗口没有打开，请再点一次「打印备货小票」。");
  };
  const confirmSplit = () => execute(
    "拆单确认",
    { draftId, clientRevision: revision, rows, sourceText: draftSource, splitPlanHash: splitPlan?.planHash,
      pricingQuoteId: quote?.quoteId, confirmedAffectedOrderLineIds: affected,
      shortageDecision: currentShortageDecision(), idempotencyKey: nextKey("splitConfirm") },
    (input) => formal.actions.confirmOrderDraftSplit(input),
    (result) => {
      const confirmation = result.confirmation;
      if (confirmation?.closedWithoutOrder === true) {
        setSplitPlan(null);
        setComplete(true);
        setNotice("已按客户意见整单取消，没有生成正式订单；草稿和取消原因已留存。");
        void Promise.resolve(formal.actions.refreshAll()).catch(() => {});
        return;
      }
      if (!confirmation?.splitConfirmed || !Array.isArray(confirmation.orderIds) ||
          confirmation.orderIds.length > (splitPlan?.groups.length ?? 0) || !confirmation.orderIds.length || !confirmation.orderLines?.length) {
        throw new Error("没有取得完整拆单回执。");
      }
      setSplitPlan(null);
      setComplete(true);
      setConfirmedLineIds(confirmation.orderLines.map((line) => line.id).filter(Boolean));
      const cancelledShort = shortageVisible && shortageChoice === "ship_available";
      setNotice(`已生成 ${confirmation.orderIds.length} 张正式订单：${confirmation.orderIds.join("、")}。${cancelledShort ? "缺货明细已按客户意见取消；" : ""}办公室仍需安排出库或生产排单。`);
      void Promise.resolve(formal.actions.refreshAll()).catch(() => setNotice("拆单已成功，请刷新订单池核对全部订单。"));
    },
  );
  const candidates = (formal.data.orderLines || []).filter(
    (line) =>
      rows.some((row) => row.customerId === line.customerId) &&
      privatePrint(line) &&
      !/已交付|已完成|已作废|取消/u.test(line.status || ""),
  );
  const missing = rows.some((line) => missingQuoteFields(line).length > 0);
  // Lines converted from a hold use the held stock; only the server can judge them, and it
  // answers ORDER_SHORTAGE_DECISION_REQUIRED if the hold no longer covers them.
  const shortageVisible = shortageAsked || rows.some(isLocalShortage);
  const shortageMissing = shortageVisible && !shortageChoice;
  // A choice left over from an earlier shortage must not travel once the block is hidden.
  const currentShortageDecision = () => shortageVisible
    ? { choice: shortageChoice, note: shortageNote.trim() }
    : { choice: "", note: "" };
  const chooseShortage = (key, value) => {
    if (frozenRequest.current || complete) return;
    requests.current.confirm = null;
    requests.current.splitConfirm = null;
    if (key === "choice") setShortageChoice(value);
    else setShortageNote(value);
  };
  const acknowledge = quote?.affectedOrders.every((line) =>
    affected.includes(line.orderLineId),
  );
  useEffect(() => {
    if (!autoConfirm.current || busy) return;
    const mode = autoConfirm.current;
    autoConfirm.current = false;
    if (pendingKind || !quote || complete) return;
    if (mode === "preview") { void previewSplit(); return; }
    if (!acknowledge) {
      setNotice(`价格已算好。有 ${quote.affectedOrders.length} 张原单受影响，请在右边逐条核对勾选后，再点「${rows.every((line) => isStockOrderType(line.orderType)) ? "开单" : "确认下单"}」。`);
      return;
    }
    if ((shortageAsked || rows.some(isLocalShortage)) && !shortageChoice) {
      setNotice("价格已算好。库存不够，请先按客户说的选缺货怎么办，再点「开单」或「确认下单」。");
      return;
    }
    void confirm();
  }, [busy, pendingKind, quote]);
  // 负责人 2026-11-08：报价和下单合成一步。点一次主按钮，先按价格表算价，算好直接下单；
  // 只有受影响原单要核对、缺货要问客户、价格表里缺价时才停下来。全部是现货时按钮叫「开单」。
  const allStock = rows.length > 0 && rows.every((line) => isStockOrderType(line.orderType));
  const actionLabel = allStock ? "开单" : "确认下单";
  const placeOrder = () => {
    // 上次算价没拿到完整回执：按原内容重试只算价，算好后再点一次下单，免得重试时直接下单。
    if (pendingKind === "报价") { autoConfirm.current = false; void pricing(); return; }
    if (pendingKind === "确认") { void confirm(); return; }
    if (!locked && !quote) { autoConfirm.current = "confirm"; void pricing(); return; }
    void confirm();
  };
  const entrySteps = ["核对来单", actionLabel].map((label, index) => {
    const current = complete ? -1 : 1;
    const state = complete || index < current ? "done" : index === current ? "current" : "todo";
    return { label, state };
  });

  return (
    <div
      className="order-pricing-entry source-grounded-workbench"
      aria-label="订单录入与正式报价"
    >
      <section className="pricing-editor" aria-label="订单录入明细">
        <header className="pricing-heading">
          <div>
            <h1>开单</h1>
            <ol className="pricing-steps" aria-label="录单步骤">
              {entrySteps.map((step, index) => (
                <li key={step.label} className={step.state} aria-current={step.state === "current" ? "step" : undefined}>
                  <b aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</b>
                  {step.label}
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={newOrderBlocked}
            onClick={() => onNavigate("order-pool")}
          >
            查看订单跟踪
          </button>
        </header>
        <section className="pricing-source">
          <div>
            <label htmlFor="pricing-source">客户订单原文</label>
            <button
              type="button"
              className="secondary-button"
              aria-controls="pricing-source"
              disabled={editingLocked || !source}
              onClick={() => {
                updateSource("");
                sourceInput.current?.focus();
              }}
            >
              清空消息
            </button>
          </div>
          <textarea
            id="pricing-source"
            ref={sourceInput}
            value={source}
            placeholder="粘贴客户消息"
            disabled={editingLocked}
            onChange={(event) => updateSource(event.target.value)}
          />
          <div>
            <span>
              {draftId || "尚未建立草稿"}
              {draftId ? ` · 第 ${revision} 版` : ""}
            </span>
            <button
              type="button"
              disabled={
                !!splitPlan ||
                !!busy ||
                complete ||
                !source.trim() ||
                (!!pendingKind && pendingKind !== "识别")
              }
              onClick={() => void recognize()}
            >
              {pendingKind === "识别" ? "按原内容重试识别" : "识别客户消息"}
            </button>
          </div>
        </section>
        <section className="pricing-lines">
          {/* 负责人 2026-11-05：客户整单选一次（必填），选完带出联系人、电话、结算周期；交付和需要日期整单填一次。 */}
          <OrderCustomerHeader
            authState={formal.authState}
            operatorId={formal.operatorId}
            disabled={editingLocked || locked || (!canEditDraft && rows.length > 0)}
            rows={rows}
            picked={pickedCustomer}
            onPick={pickCustomer}
            hint={customerHint}
            fulfillment={commonValue(rows, "fulfillment", "自提")}
            latest={commonValue(rows, "latest", "")}
            onFulfillment={(value) => updateAll("fulfillment", value)}
            onLatest={(value) => updateAll("latest", value)}
          />
          <header>
            <h3>订单明细</h3>
            <span>{rows.length ? `${rows.length} 行 · 点「更多」填印刷内容、改价、拆行` : ""}</span>
          </header>
          {!rows.length ? (
            <p className="pricing-empty">
              粘贴客户消息并识别，或从留货记录转入草稿。
            </p>
          ) : (
            <div className="pricing-line-table" role="table" aria-label="订单明细">
              <div className="pricing-line-head" role="row" aria-hidden="true">
                <span />
                <span>分类</span>
                <span>规格（宽×高×侧）</span>
                <span>袋身颜色</span>
                <span>数量（个）</span>
                <span>提手</span>
                <span>印刷</span>
                <span>状态</span>
                <span />
              </div>
            {rows.map((line, index) => {
              const open = expandedRows.includes(line.id);
              const tags = lineStatusTags(line, rows, overrides[line.id]);
              return (
              <fieldset key={line.id} disabled={editingLocked || locked} className={open ? "pricing-line-row open" : "pricing-line-row"}>
                <legend className="pricing-sr">第 {index + 1} 行</legend>
                <div className="pricing-line-main">
                  <span className="pricing-line-no">{index + 1}</span>
                  <label className="pricing-cell">
                    <span className="pricing-sr">订单分类</span>
                    <select
                      aria-label={`第${index + 1}行订单分类`}
                      value={line.orderType || "stock"}
                      onChange={(e) =>
                        update(index, "orderType", e.target.value)
                      }
                    >
                      <option value="stock">标准通货</option>
                      <option value="stock_printed">印刷通货</option>
                      <option value="custom_print">定制印刷通货</option>
                      <option value="custom_special">特殊尺寸</option>
                      <option value="external_print">外加工印刷（来料加工）</option>
                    </select>
                  </label>
                  <label className="pricing-cell">
                    <span className="pricing-sr">规格（宽×高×侧）</span>
                    <input
                      aria-label={`第${index + 1}行规格`}
                      value={line.size || ""}
                      onChange={(e) => update(index, "size", e.target.value)}
                    />
                  </label>
                  <label className="pricing-cell">
                    <span className="pricing-sr">袋身颜色</span>
                    <input
                      aria-label={`第${index + 1}行袋身颜色`}
                      className={line.color || line.bagColor ? undefined : "pricing-missing"}
                      placeholder="待填"
                      value={line.color || line.bagColor || ""}
                      onChange={(e) => update(index, "color", e.target.value)}
                    />
                  </label>
                  <div className="pricing-cell pricing-qty-cell">
                      {line.orderType === "external_print" ? (
                        <label className="pricing-cell">
                          <span className="pricing-sr">数量按</span>
                          <select
                            aria-label={`第${index + 1}行数量按`}
                            value={byIncomingRolls(line) ? "incoming_rolls" : "pieces"}
                            onChange={(e) => {
                              // 同行只送卷料、不说印多少个：按来料卷数下单，印完按实际印好数量定价（负责人 2026-11-03）。
                              const rolls = e.target.value === "incoming_rolls";
                              update(index, "qtyBasis", rolls ? "incoming_rolls" : "");
                              update(index, "qty", rolls ? 0 : "");
                            }}
                          >
                            <option value="pieces">客户说了印多少个</option>
                            <option value="incoming_rolls">只送卷料，按来料印</option>
                          </select>
                        </label>
                      ) : null}
                      {byIncomingRolls(line) ? (
                        <label className="pricing-cell">
                          <span className="pricing-sr">来料卷数</span>
                          <input
                            aria-label={`第${index + 1}行来料卷数`}
                            inputMode="numeric"
                            value={line.incomingRollCount ?? ""}
                            onChange={(e) =>
                              update(index, "incomingRollCount", Number(e.target.value))
                            }
                          />
                        </label>
                      ) : (
                        <label className="pricing-cell">
                          <span className="pricing-sr">数量（个）</span>
                          <input
                            aria-label={`第${index + 1}行数量`}
                            inputMode="numeric"
                            className="pricing-qty"
                            value={line.qty ?? ""}
                            onChange={(e) =>
                              update(index, "qty", Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                  </div>
                  <label className="pricing-cell">
                    <span className="pricing-sr">提手</span>
                    <select
                      aria-label={`第${index + 1}行提手`}
                      value={line.handle || "普通提"}
                      onChange={(e) => update(index, "handle", e.target.value)}
                    >
                      <option>普通提</option>
                      <option>加长提</option>
                    </select>
                  </label>
                  <label className="pricing-cell">
                    <span className="pricing-sr">是否印刷</span>
                    <select
                      aria-label={`第${index + 1}行是否印刷`}
                      value={line.print || "否"}
                      onChange={(e) => update(index, "print", e.target.value)}
                    >
                      <option>否</option>
                      <option>是</option>
                    </select>
                  </label>
                  <span className="pricing-line-tags">
                    {tags.map((tag) => <b key={tag.text} className={`pricing-tag ${tag.tone}`}>{tag.text}</b>)}
                  </span>
                  <button
                    type="button"
                    className="pricing-more"
                    aria-expanded={open}
                    aria-label={`第${index + 1}行${open ? "收起" : "更多"}`}
                    onClick={() => setExpandedRows((current) => open ? current.filter((id) => id !== line.id) : [...current, line.id])}
                  >
                    {open ? "收起 ▴" : "更多 ▾"}
                  </button>
                </div>
                {open ? (
                <div className="pricing-line-more">
                  <div className="pricing-line-fields">
                    <label>
                      交付（本行不同才改）
                      <select
                        aria-label={`第${index + 1}行交付方式`}
                        value={line.fulfillment || "自提"}
                        onChange={(e) =>
                          update(index, "fulfillment", e.target.value)
                        }
                      >
                        <option>自提</option>
                        <option>送货</option>
                        <option>快递快运</option>
                      </select>
                    </label>
                    <label>
                      需要日期（本行不同才改）
                      <input
                        aria-label={`第${index + 1}行需要日期`}
                        placeholder="如 2026-10-25"
                        value={line.latest || ""}
                        onChange={(e) => update(index, "latest", e.target.value)}
                      />
                    </label>
                    {customerIdsOf(rows).length > 1 ? (
                      <label>
                        客户
                        <input readOnly value={line.customer || line.customerName || line.customerId || "待确认客户"} />
                      </label>
                    ) : null}
                  </div>
                  {line.fulfillment === "送货" ? (
                    <DeliveryAddressField
                      authState={formal.authState}
                      disabled={editingLocked || locked}
                      index={index}
                      line={line}
                      onChange={(key, value) => update(index, key, value)}
                    />
                  ) : null}
                  {privatePrint(line) ? (
                    <div className="pricing-print-fields">
                      <label>
                        印刷内容（同图合组依据）
                        <input
                          value={line.printContent || ""}
                          placeholder="填写可核对的图案名称或文件版本"
                          onChange={(e) =>
                            update(index, "printContent", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        印刷面
                        <select
                          className={["单面", "双面", "双面不同"].includes(line.printSide) ? undefined : "pricing-missing"}
                          value={["单面", "双面", "双面不同"].includes(line.printSide) ? line.printSide : ""}
                          onChange={(e) =>
                            update(index, "printSide", e.target.value)
                          }
                        >
                          {["单面", "双面", "双面不同"].includes(line.printSide) ? null : <option value="" disabled>请选择（双面要分相同还是不同）</option>}
                          <option value="单面">单面印刷</option>
                          <option value="双面">双面相同</option>
                          <option value="双面不同">双面不同</option>
                        </select>
                      </label>
                      {/* 负责人 2026-11-08：印刷工艺目前只有丝印，以后有别的工艺再加选项。 */}
                      <label>
                        印刷工艺
                        <select aria-label={`第${index + 1}行印刷工艺`} value="丝印" onChange={() => {}}>
                          <option value="丝印">丝印</option>
                        </select>
                      </label>
                      <label>
                        印刷颜色
                        <input
                          value={line.printColor || ""}
                          onChange={(e) =>
                            update(index, "printColor", e.target.value)
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  {line.orderType === "custom_special" ? (
                    <label className="pricing-check">
                      <input
                        type="checkbox"
                        checked={
                          line.specialRequirements?.includes("snap_button") ||
                          false
                        }
                        onChange={(e) =>
                          update(
                            index,
                            "specialRequirements",
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...(line.specialRequirements || []),
                                    "snap_button",
                                  ]),
                                ]
                              : (line.specialRequirements || []).filter(
                                  (v) => v !== "snap_button",
                                ),
                          )
                        }
                      />
                      加扣（按现行规则计费）
                    </label>
                  ) : null}
                  {allowed && !locked ? (
                    <div className="pricing-override">
                      <label className="pricing-check">
                        <input
                          type="checkbox"
                          checked={overrides[line.id]?.enabled || false}
                          onChange={(e) =>
                            override(line.id, "enabled", e.target.checked)
                          }
                        />
                        本行使用授权本单价
                      </label>
                      {overrides[line.id]?.enabled ? (
                        <>
                          <p>
                            填写本次实际成交价并说明依据；改价立即生效，达到差额提醒条件会供老板查看。
                          </p>
                          <div className="pricing-line-fields">
                            {[
                              ["bagPrice", "袋子单价（元/个）"],
                              ["printPrice", "印刷单价（元/个）"],
                              ["otherFee", "其他费（元）"],
                              ["adjustmentAmount", "本行增减额（元）"],
                            ].map(([key, label]) => (
                              <label key={key}>
                                {label}
                                <input
                                  inputMode="decimal"
                                  aria-label={`第${index + 1}行${label}`}
                                  value={overrides[line.id]?.[key] ?? ""}
                                  placeholder="按正式报价保留；未核价需填写"
                                  onChange={(e) =>
                                    override(line.id, key, e.target.value)
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <label>
                            改价原因
                            <input
                              value={overrides[line.id]?.reason || ""}
                              onChange={(e) =>
                                override(line.id, "reason", e.target.value)
                              }
                              placeholder="如客户议价、补收费用、录入修正"
                            />
                          </label>
                          <label className="pricing-check">
                            <input
                              type="checkbox"
                              checked={overrides[line.id]?.freeOfCharge || false}
                              onChange={(e) =>
                                override(
                                  line.id,
                                  "freeOfCharge",
                                  e.target.checked,
                                )
                              }
                            />
                            本行全部赠送，不计费（仍须填写依据）
                          </label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="pricing-row-actions">
                    <button type="button" aria-label={`拆分第${index + 1}行明细`}
                      disabled={editingLocked || locked || !canEditDraft || !!splitLineBlockedReason(line)}
                      title={locked ? "小程序锁价明细保持原样" : splitLineBlockedReason(line) || "先对半拆成两行，再分别调整数量与交付"}
                      onClick={() => splitLine(index)}>拆分明细行</button>
                    {line.sourceHoldId ? <span>留货转单明细须保持原留货数量，不能拆行。</span> : null}
                  </div>
                </div>
                ) : null}
              </fieldset>
              );
            })}
              <p className="pricing-line-sum">
                共 {rows.length} 行，合计{" "}
                <b>{rows.reduce((sum, line) => sum + (byIncomingRolls(line) ? 0 : Number(line.qty) || 0), 0).toLocaleString("zh-CN")}</b> 个
                {rows.some(byIncomingRolls) ? "（来料加工按卷的不计在内）" : ""}
              </p>
            </div>
          )}
        </section>
        {allowed && !locked && rows.some(privatePrint) ? (
          <details className="pricing-supplement">
            <summary>同批补单合组（关联尚未开印的原单）</summary>
            <p>
              只选择同客户、同内容、同尺寸并将同批印刷的原单。颜色可不同；小程序已锁价原单保留原价。
            </p>
            {candidates.length ? (
              candidates.map((line) => (
                <label className="pricing-check" key={line.id}>
                  <input
                    type="checkbox"
                    disabled={editingLocked}
                    checked={supplementIds.includes(line.id)}
                    onChange={(e) => {
                      invalidate();
                      setSupplementIds((current) =>
                        e.target.checked
                          ? [...current, line.id]
                          : current.filter((id) => id !== line.id),
                      );
                    }}
                  />
                  {line.id} · {line.product} · {line.size} · {line.qty}个 ·{" "}
                  {line.status}
                </label>
              ))
            ) : (
              <p>没有同客户的可选原单，原单是否尚未开印会由服务器复核。</p>
            )}
            <label>
              同批印刷标识
              <input
                disabled={editingLocked}
                value={batch}
                onChange={(e) => {
                  invalidate();
                  setBatch(e.target.value);
                }}
                placeholder="如本次印刷任务批次"
              />
            </label>
            <label>
              补单依据
              <input
                disabled={editingLocked}
                value={reason}
                onChange={(e) => {
                  invalidate();
                  setReason(e.target.value);
                }}
              />
            </label>
            <label className="pricing-check">
              <input
                disabled={editingLocked}
                type="checkbox"
                checked={sameBatch}
                onChange={(e) => {
                  invalidate();
                  setSameBatch(e.target.checked);
                }}
              />
              已核实所选原单尚未开印，并与新单同批印刷
            </label>
          </details>
        ) : null}
        {shortageVisible && !complete ? (
          <fieldset className="pricing-shortage-decision" disabled={!!busy || (!!pendingKind && pendingKind !== "确认")}>
            <legend>缺货怎么办（按客户说的选）</legend>
            <p>有明细库存不够。先问客户，再选一项；系统会记下这次客户的选择。</p>
            {SHORTAGE_CHOICES.map(([value, label, hint]) => (
              <label className="pricing-check" key={value}>
                <input
                  type="radio"
                  name="shortage-decision"
                  value={value}
                  checked={shortageChoice === value}
                  onChange={() => chooseShortage("choice", value)}
                />
                <span><b>{label}</b> {hint}</span>
              </label>
            ))}
            <label>
              客户怎么说的（可不填）
              <input
                value={shortageNote}
                maxLength={500}
                onChange={(e) => chooseShortage("note", e.target.value)}
                placeholder="如：客户微信回复先发有的，缺的不要了"
              />
            </label>
          </fieldset>
        ) : null}
        {complete && walkIn ? (
          <WalkInPickupPanel key={walkIn.fulfillmentIds.join(",")} walkIn={walkIn} formal={formal} />
        ) : null}
        <footer className="pricing-actions">
          <p role="status" aria-live="polite">
            {notice || "草稿不占用库存；确认下单后由办公室安排出库或生产。"}
          </p>
          <div>
            {complete && (confirmedSlip.pending || confirmedSlip.lines.length) ? (
              <button type="button" className="primary-button" onClick={() => void printPickingSlip()}>
                打印备货小票
              </button>
            ) : null}
            <button
              type="button"
              disabled={
                !!splitPlan ||
                !!busy ||
                complete ||
                !rows.length ||
                locked ||
                (!!pendingKind && pendingKind !== "保存")
              }
              onClick={() => void save()}
            >
              {pendingKind === "保存" ? "按原内容重试保存" : "保存草稿"}
            </button>

            <button type="button" ref={splitTrigger} disabled={editingLocked || !canConfirmOrder || !draftId || !rows.length || shortageMissing}
              title={shortageMissing ? "库存不够，请先按客户意见选缺货怎么办" : undefined}
              onClick={() => { if (!locked && !quote && !missing) { autoConfirm.current = "preview"; void pricing(); } else void previewSplit(); }}>
              {busy === "拆单预览" ? "正在核对分组…" : "按客户/交付拆单"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={
                !!splitPlan ||
                !!busy ||
                complete ||
                missing ||
                !rows.length ||
                (!locked && !draftId) ||
                (!locked && !!quote && !acknowledge) ||
                (shortageMissing && (locked || !!quote)) ||
                (!!pendingKind && !["报价", "确认"].includes(pendingKind))
              }
              title={shortageMissing ? "库存不够，请先按客户意见选缺货怎么办" : !locked && quote && !acknowledge ? "请先在右边核对勾选受影响的原单" : "按价格表算价，算好直接下单"}
              onClick={placeOrder}
            >
              {busy === "报价"
                ? "正在算价…"
                : busy === "确认"
                  ? "正在下单…"
                  : pendingKind === "报价"
                    ? "按原内容重试算价"
                    : pendingKind === "确认"
                      ? `按原内容重试${actionLabel}`
                      : actionLabel}
            </button>
          </div>
        </footer>
      </section>
      {splitPlan ? <OrderEntrySplitDialog plan={splitPlan} rows={rows} quote={quote} locked={locked}
        busy={!!busy} pending={pendingKind === "拆单确认"} notice={pendingKind === "拆单确认" ? notice : ""}
        canConfirm={canConfirmOrder && !!splitPlan.canConfirm && !missing && (locked || (!!quote && acknowledge))}
        onClose={() => { if (!busy && !pendingKind) { setSplitPlan(null); requestAnimationFrame(() => splitTrigger.current?.focus()); } }} onConfirm={() => void confirmSplit()} /> : null}
      <aside className="pricing-review">
        <header>
          <h3>{locked ? "小程序锁价订单" : "正式报价核对"}</h3>
        </header>
        {locked ? (
          <p>保留客户提交时的锁价与规格，办公室核对后确认。</p>
        ) : !quote ? (
          rows.length ? (
            <>
              {/* 负责人 2026-11-05：只列还差什么。客户整单一次，不再每行都写「缺少客户」。价格只以服务器正式报价为准，这里不预估金额。 */}
              <h4 className="pricing-precheck-title">还差什么</h4>
              <ul className="pricing-precheck" aria-label="待报价明细">
                {rows.some((line) => !line.customerId) ? (
                  <li className="needs-attention"><span><b>客户</b>还没选（整单选一次）</span></li>
                ) : null}
                {rows.map((line, index) => {
                  const lacks = missingQuoteFields(line).filter((item) => item !== "客户");
                  return lacks.length ? (
                    <li key={line.id ?? index} className="needs-attention">
                      <span>第 {index + 1} 行 · {[line.size, line.color || line.bagColor].filter(Boolean).join(" ") || "规格待填"}</span>
                      <strong>缺少{lacks.join("、")}</strong>
                    </li>
                  ) : null;
                })}
                {rows.map((line, index) => printSideMissing(line) ? (
                  <li key={`side-${line.id ?? index}`} className="needs-attention">
                    <span>第 {index + 1} 行 · 印刷面</span>
                    <strong>请选双面相同还是双面不同（点「更多」）</strong>
                  </li>
                ) : null)}
                {!missing ? <li><span>{rows.length} 行计价明细已齐全</span><strong>待报价</strong></li> : null}
              </ul>
              <p className="pricing-precheck-hint">
                {missing
                  ? "先补全标出的字段，再开单。"
                  : "点「开单」或「确认下单」会先按价格表算价，再直接下单；请先核对交付方式和需要日期。"}
                价格表里缺价时会停在这里，由有权限的人填写本单价及原因。
              </p>
            </>
          ) : (
            <p className="pricing-empty">识别客户消息后，这里会列出待报价的明细。</p>
          )
        ) : (
          <>
            <p>报价已保存 · 第 {quote.clientRevision} 版</p>
            {quote.lines.map((line, index) => (
              <section className="pricing-quote-line" key={line.draftLineId}>
                <strong>
                  第 {index + 1} 行 <b>{money(line.amount)}</b>
                </strong>
                <dl>
                  <div>
                    <dt>袋子 / 印刷单价</dt>
                    <dd>
                      {line.bagPrice} / {line.printPrice}
                    </dd>
                  </div>
                  <div>
                    <dt>计费数量</dt>
                    <dd>{line.sourceEvidence?.base?.pricedOnActualPrints ? "按实际印好数量，印完定档计价" : `${line.chargeableQty} 个`}</dd>
                  </div>
                  <div>
                    <dt>其他费 / 增减额</dt>
                    <dd>
                      {money(line.otherFee)} / {money(line.adjustmentAmount)}
                    </dd>
                  </div>
                </dl>
                {line.override ? (
                  <p>
                    本单改价：{line.override.reason}
                    {line.override.managerReviewRequired
                      ? "（已列老板查看提醒，不阻塞下单）"
                      : ""}
                  </p>
                ) : null}
              </section>
            ))}
            <div className="pricing-total">
              <span>本次新单合计</span>
              <strong>
                {money(quote.lines.reduce((sum, line) => sum + line.amount, 0))}
              </strong>
            </div>
            {quote.groups
              .filter((group) => group.memberCount > 1)
              .map((group) => (
                <p key={group.groupId}>
                  合组印刷：{group.content} · {group.quantity} 个 ·{" "}
                  {group.unitPrice} 元/个
                </p>
              ))}
            {quote.affectedOrders.length ? (
              <section>
                <h4>逐项确认原单价格修订</h4>
                <p>原价记录保留，以下新价格须逐项确认。</p>
                {quote.affectedOrders.map((line) => (
                  <label className="pricing-check" key={line.orderLineId}>
                    <input
                      type="checkbox"
                      disabled={editingLocked}
                      checked={affected.includes(line.orderLineId)}
                      onChange={(e) => {
                        requests.current.confirm = null;
                        setAffected((current) =>
                          e.target.checked
                            ? [...current, line.orderLineId]
                            : current.filter((id) => id !== line.orderLineId),
                        );
                      }}
                    />
                    <span>
                      {line.orderLineId}
                      <br />
                      {money(line.previousAmount)} → {money(line.revisedAmount)}
                    </span>
                  </label>
                ))}
              </section>
            ) : null}
          </>
        )}
        <p className="pricing-note">
          印刷内容或尺寸不同分别计费。已有订单、生产进度或材料价格变化时，须重新报价。
        </p>
      </aside>
    </div>
  );
}

function splitLineBlockedReason(line) {
  if (line.sourceHoldId) return "留货转单明细须保持原留货数量，请先在留货记录中处理。";
  if (line.excludedFromConfirmation || line.cancellationStatus === "库存不足取消") return "已取消明细保留原始关联，不能拆分。";
  if (!Number.isSafeInteger(Number(line.qty)) || Number(line.qty) < 2) return "至少2个且数量为整数，才能拆分明细。";
  return "";
}

function isLocalShortage(line) {
  return !line?.sourceHoldId && String(line?.inventory ?? "").startsWith("缺货");
}

const SHORTAGE_CHOICES = [
  ["cancel_whole", "整单取消", "这单不做了，不生成正式订单。"],
  ["ship_available", "有什么发什么，缺的取消", "有货的照常下单，缺货的明细取消。"],
  ["split_produce", "同意分批，缺的安排生产", "有货的先发，缺的转生产，做好再发。"],
];

function customerIdsOf(rows) {
  return [...new Set(rows.map((line) => String(line.customerId ?? "").trim()).filter(Boolean))];
}

// 每一行都一样时返回那个值；不一样时返回空，表头显示「各行不同」。
function commonValue(rows, key, fallback) {
  const values = [...new Set(rows.map((line) => String(line[key] ?? "").trim() || fallback))];
  return values.length === 1 ? values[0] : "";
}

// 明细行右边的状态：缺什么、库存、印刷信息、改价、跟整单不同的交付。客户在表头，不在这里提示。
function lineStatusTags(line, rows, lineOverride) {
  const tags = [];
  const lacks = missingQuoteFields(line).filter((item) => item !== "客户");
  if (lacks.length) tags.push({ tone: "warn", text: `${lacks.join("、")}待填` });
  if (isLocalShortage(line)) tags.push({ tone: "warn", text: "库存不够" });
  else if (isStockOrderType(line.orderType) && !["", "待确认"].includes(String(line.inventory ?? "").trim()) && !lacks.length) tags.push({ tone: "ok", text: String(line.inventory).trim() });
  if (privatePrint(line) && ["", "待确认"].includes(String(line.printColor ?? "").trim())) tags.push({ tone: "info", text: "印刷颜色待填" });
  if (printSideMissing(line)) tags.push({ tone: "warn", text: "印刷面待选" });
  if (lineOverride?.enabled) tags.push({ tone: "info", text: "本单改价" });
  const fulfillment = commonValue(rows, "fulfillment", "自提");
  const latest = commonValue(rows, "latest", "");
  if (!fulfillment || (!latest && rows.some((row) => String(row.latest ?? "").trim()))) {
    tags.push({ tone: "info", text: [line.fulfillment || "自提", String(line.latest ?? "").trim().slice(5)].filter(Boolean).join(" · ") });
  }
  return tags;
}

// 负责人 2026-11-08：开单即出库。现货、客户当场拿走：打一张自提单（几样货合一张）→ 看纸确认 →
// 「客户已拿走」一次办完交库房、实物出库（扣库存）、提货完成。经手人选一次，下次默认。
const WALK_IN_EXECUTOR_KEY = "erp.walkIn.executorEmployeeId";
function WalkInPickupPanel({ walkIn, formal }) {
  const auth = { authState: formal.authState, operatorId: formal.operatorId };
  const [pickerName, setPickerName] = useState("");
  const [executors, setExecutors] = useState([]);
  const [executorId, setExecutorId] = useState(() => { try { return window.localStorage.getItem(WALK_IN_EXECUTOR_KEY) ?? ""; } catch { return ""; } });
  const [state, setState] = useState({ busy: "", printed: false, done: false, message: "" });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  useEffect(() => {
    let active = true;
    void getOfficeFulfillmentOperatorCandidates({ authState: formal.authState, operatorId: formal.operatorId }, { serverRequired: true }).then((result) => {
      if (active) setExecutors(result.warehouseExecutors ?? []);
    });
    return () => { active = false; };
  }, [formal.authState, formal.operatorId]);
  const chooseExecutor = (value) => {
    setExecutorId(value);
    try { window.localStorage.setItem(WALK_IN_EXECUTOR_KEY, value); } catch { /* 记不住也不影响本次 */ }
  };
  async function print() {
    setState((current) => ({ ...current, busy: "print", message: "正在打开打印窗口，请选针式打印机…" }));
    const result = await printWalkInPickupNote({ fulfillmentIds: walkIn.fulfillmentIds, pickerName, ...auth });
    if (!live.current) return;
    setState((current) => ({ ...current, busy: "", printed: result.printed, message: result.message }));
  }
  async function finish() {
    setState((current) => ({ ...current, busy: "finish", message: "正在出库…" }));
    const result = await completeWalkInPickup({ fulfillmentIds: walkIn.fulfillmentIds, executorEmployeeId: executorId, ...auth });
    if (!live.current) return;
    setState((current) => ({ ...current, busy: "", done: result.done, message: result.message }));
    if (result.done) void Promise.resolve(formal.actions.refreshAll()).catch(() => {});
  }
  return (
    <section className="pricing-walk-in" aria-label="客户现场拿货">
      <h3>客户现场拿货 <small>{walkIn.fulfillmentIds.length} 样货合在一张自提单上</small></h3>
      <div className="pricing-walk-in-fields">
        <label>提货人（实际来拿货的人，可不填）<input value={pickerName} maxLength={20} disabled={state.printed || !!state.busy} onChange={(event) => setPickerName(event.target.value)} /></label>
        <label>经手人（库房谁拿的货）
          <select value={executorId} disabled={state.done || !!state.busy} onChange={(event) => chooseExecutor(event.target.value)}>
            <option value="">请选择</option>
            {executors.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.name}</option>)}
          </select>
        </label>
      </div>
      {state.message ? <p role="status">{state.message}</p> : null}
      <div className="pricing-walk-in-actions">
        <button type="button" className={state.printed ? "secondary-button" : "primary-button"} disabled={state.printed || state.done || !!state.busy} onClick={() => void print()}>
          {state.busy === "print" ? "正在打印…" : state.printed ? "自提单已打印" : "打印自提单"}
        </button>
        <button type="button" className={state.printed ? "primary-button" : "secondary-button"} disabled={!state.printed || !executorId || state.done || !!state.busy}
          title={!state.printed ? "先打印自提单并确认打出来" : !executorId ? "先选经手人" : undefined} onClick={() => void finish()}>
          {state.busy === "finish" ? "正在出库…" : state.done ? "已出库，客户已拿走" : "客户已拿走"}
        </button>
      </div>
    </section>
  );
}

// 负责人 2026-11-05：系统里没有的客户，开单页直接新建，不用放下录入去客户资料。只填名称、电话、地址。
function NewCustomerDialog({ authState, operatorId, initialName = "", onClose, onCreated }) {
  const [form, setForm] = useState({ name: initialName, contactName: "", phone: "", address: "" });
  const [state, setState] = useState({ busy: false, error: "", existing: null });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    if (!form.name.trim()) { setState({ busy: false, error: "请填写客户名称。", existing: null }); return; }
    setState({ busy: true, error: "", existing: null });
    const result = await createOfficeCustomer({ ...form, authState, operatorId }, { serverRequired: true });
    if (!live.current) return;
    if (result.blocked) { setState({ busy: false, error: result.error?.message || "新建客户没有保存。", existing: null }); return; }
    if (result.existing) { setState({ busy: false, error: "", existing: result.customer }); return; }
    onCreated(result.customer);
  }
  return (
    <ReviewDialog labelledBy="new-customer-title" className="finance-dialog pricing-new-customer" onClose={() => { if (!state.busy) onClose(); }}>
      <header><div><h2 id="new-customer-title">新建客户</h2><p>先填个大概，以后在客户资料里补全。</p></div><button type="button" aria-label="关闭新建客户" disabled={state.busy} onClick={onClose}>×</button></header>
      <form className="finance-dialog-content" onSubmit={submit}>
        <div className="pricing-new-customer-form">
          <label className="wide"><span>客户名称 <em>必填</em></span><input autoFocus maxLength={40} value={form.name} onChange={change("name")} disabled={state.busy} placeholder="如 张大姐、宁晋华强超市" /></label>
          <label>联系人<input maxLength={20} value={form.contactName} onChange={change("contactName")} disabled={state.busy} placeholder="可不填" /></label>
          <label>电话<input inputMode="tel" maxLength={20} value={form.phone} onChange={change("phone")} disabled={state.busy} placeholder="可不填" /></label>
          <label className="wide">地址<input maxLength={120} value={form.address} onChange={change("address")} disabled={state.busy} placeholder="送货客户填收货地址，可不填" /></label>
        </div>
        {state.error ? <p role="alert" className="pricing-new-customer-error">{state.error}</p> : null}
        {state.existing ? (
          <p role="status" className="pricing-new-customer-existing">
            已经有「{state.existing.name}」这个客户了{state.existing.phone ? `（${state.existing.phone}）` : ""}。
            <button type="button" className="pricing-link-button" onClick={() => onCreated(state.existing)}>直接用这个客户</button>
          </p>
        ) : null}
        <div className="pricing-new-customer-actions">
          <button className="primary-button" type="submit" disabled={state.busy}>{state.busy ? "保存中…" : "保存并选用"}</button>
          <button type="button" disabled={state.busy} onClick={onClose}>取消</button>
        </div>
      </form>
    </ReviewDialog>
  );
}

// 负责人 2026-11-05：客户整单选一次（必填）；选完自动带出联系人、电话、结算周期。交付、需要日期也整单填一次。
function OrderCustomerHeader({ authState, operatorId, disabled, rows, picked, onPick, hint, fulfillment, latest, onFulfillment, onLatest }) {
  const ids = customerIdsOf(rows);
  const someMissing = rows.some((line) => !line.customerId);
  const currentId = rows.length ? (ids.length === 1 && !someMissing ? ids[0] : "") : picked?.customerId ?? "";
  const currentName = rows.length
    ? currentId ? (rows[0].customer || rows[0].customerName || currentId) : ""
    : picked?.name ?? "";
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [found, setFound] = useState({ loading: false, items: [], error: "" });
  const [profile, setProfile] = useState(null);
  const [creating, setCreating] = useState(null);
  useEffect(() => {
    if (!editing) return undefined;
    let live = true;
    setFound((current) => ({ ...current, loading: true, error: "" }));
    const timer = setTimeout(() => {
      void searchOfficeCustomers({ query, authState, operatorId }, { serverRequired: true }).then((result) => {
        if (live) setFound({ loading: false, items: result.items ?? [], error: result.blocked ? result.error?.message || "客户列表读取失败。" : "" });
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [editing, query, authState, operatorId]);
  useEffect(() => {
    setProfile(null);
    if (!currentId) return undefined;
    let live = true;
    void getOfficeCustomerProfile({ customerId: currentId, authState, operatorId }, { serverRequired: true }).then((result) => {
      if (live && !result.blocked) setProfile(result.profile);
    });
    return () => { live = false; };
  }, [currentId, authState, operatorId]);
  const choose = (customer) => {
    onPick(customer);
    setEditing(false);
    setQuery("");
  };
  const multiple = ids.length > 1;
  return (
    <div className="pricing-order-head">
      <div className="pricing-customer">
        <label htmlFor="pricing-customer-input">客户 <em>必填</em></label>
        <input
          id="pricing-customer-input"
          role="combobox"
          aria-expanded={editing}
          aria-controls="pricing-customer-options"
          autoComplete="off"
          className={currentId ? undefined : "pricing-missing"}
          disabled={disabled}
          placeholder={multiple ? `这段消息里有 ${ids.length} 个客户，选一个会全部改成同一个` : "输入客户名称、简称、联系人或电话搜索"}
          value={editing ? query : currentName}
          onFocus={() => { setEditing(true); setQuery(""); }}
          onBlur={() => setTimeout(() => setEditing(false), 150)}
          onChange={(event) => { setEditing(true); setQuery(event.target.value); }}
        />
        {editing ? (
          <ul id="pricing-customer-options" role="listbox" className="pricing-customer-options">
            {found.loading && !found.items.length ? <li className="muted">正在查找…</li> : null}
            {found.error ? <li className="muted">{found.error}</li> : null}
            {!found.loading && !found.error && !found.items.length ? <li className="muted">系统里没有{query.trim() ? `「${query.trim()}」` : "这个客户"}。</li> : null}
            {found.items.map((customer) => (
              <li key={customer.customerId} role="option" aria-selected={customer.customerId === currentId}
                onMouseDown={(event) => { event.preventDefault(); choose(customer); }}>
                <b>{customer.name}</b>
                <span>{[customer.contactName, customer.phone, customer.settlementCycle !== "未设置" ? customer.settlementCycle : ""].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
            <li className="pricing-customer-new" role="option" aria-selected="false"
              onMouseDown={(event) => { event.preventDefault(); setEditing(false); setCreating({ name: query.trim() }); }}>
              ＋ 新建客户{query.trim() ? `「${query.trim()}」` : ""}
            </li>
          </ul>
        ) : null}
        {!currentId && !editing && hint?.name ? (
          <p className="pricing-customer-info warn" role="status">
            {hint.customerId
              ? <>已找到客户「{hint.name}」。
                <button type="button" className="pricing-link-button" disabled={disabled} onClick={() => choose(hint)}>选用这个客户</button></>
              : hint.ambiguous?.length
              ? <>消息里写的「{hint.name}」对应多个客户：{hint.ambiguous.join("、")}，请在上面选一个。</>
              : <>消息里写的客户「{hint.name}」系统里没有。是否新建？
                <button type="button" className="pricing-link-button" disabled={disabled} onClick={() => setCreating({ name: hint.name })}>新建客户「{hint.name}」</button></>}
          </p>
        ) : null}
        {creating ? (
          <NewCustomerDialog
            authState={authState}
            operatorId={operatorId}
            initialName={creating.name}
            onClose={() => setCreating(null)}
            onCreated={(customer) => { setCreating(null); onPick(customer); }}
          />
        ) : null}
        {currentId && profile ? (
          <p className="pricing-customer-info" aria-label="客户信息">
            <span>联系人：{profile.contactName || "待补"}</span>
            <span>电话：{profile.phone || "待补"}</span>
            <span>结算：{profile.settlementCycle || "未设置"}</span>
          </p>
        ) : multiple ? (
          <p className="pricing-customer-info warn">各行客户不同：{rows.map((line) => line.customer || line.customerName).filter(Boolean).filter((name, index, all) => all.indexOf(name) === index).join("、")}。要分开下单请用「按客户/交付拆单」。</p>
        ) : null}
      </div>
      <label>
        交付（整单）
        <select aria-label="整单交付方式" disabled={disabled || !rows.length} value={fulfillment} onChange={(event) => onFulfillment(event.target.value)}>
          {!fulfillment ? <option value="">各行不同</option> : null}
          <option>自提</option>
          <option>送货</option>
          <option>快递快运</option>
        </select>
      </label>
      <label>
        需要日期（整单）
        <input aria-label="整单需要日期" disabled={disabled || !rows.length} placeholder={rows.length && !latest && rows.some((line) => String(line.latest ?? "").trim()) ? "各行不同" : "如 2026-10-25"}
          value={latest} onChange={(event) => onLatest(event.target.value)} />
      </label>
    </div>
  );
}

// 与「确认下单」前的缺字段判断保持一致（客户、规格、袋身颜色、数量）。
// 负责人 2026-11-08：印刷面要选单面印刷、双面相同或双面不同；只写了「双面」的要提醒补全。
function printSideMissing(line) {
  return privatePrint(line) && !["单面", "双面", "双面不同"].includes(String(line.printSide ?? "").trim());
}

function missingQuoteFields(line) {
  const lacks = [];
  if (!line.customerId) lacks.push("客户");
  if (!line.size) lacks.push("规格");
  if (!(line.color || line.bagColor)) lacks.push("袋身颜色");
  if (byIncomingRolls(line)) {
    const rolls = Number(line.incomingRollCount);
    if (!Number.isSafeInteger(rolls) || rolls < 1 || rolls > 9999) lacks.push("来料卷数");
  } else if (!Number.isSafeInteger(Number(line.qty)) || Number(line.qty) < 1) lacks.push("数量");
  return lacks;
}

// 负责人 2026-11-04：一个客户可能有多个收货地址。送货时选客户已有地址，或本单另填；不选用默认地址。
function DeliveryAddressField({ authState, disabled, index, line, onChange }) {
  const [book, setBook] = useState({ customerId: "", loading: false, addresses: [], error: "" });
  const [oneOff, setOneOff] = useState(Boolean(line.deliveryAddress));
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  // 客户资料随用随补：另填的地址可以顺手存进客户档案，下次直接选（负责人 2026-11-04）。
  const saveToCustomer = async () => {
    const address = String(line.deliveryAddress || "").trim();
    if (!address || saving) return;
    setSaving(true);
    setSaveNotice("");
    const result = await addOfficeCustomerDeliveryAddress({ customerId: line.customerId, address, source: "order_entry", authState }, { serverRequired: true });
    setSaving(false);
    if (result.blocked || !result.address?.addressId) { setSaveNotice(result.error?.message || "送货地址保存失败。"); return; }
    setBook((current) => current.addresses.some((item) => item.addressId === result.address.addressId)
      ? current : { ...current, addresses: [...current.addresses, result.address] });
    setOneOff(false);
    onChange("deliveryAddressId", result.address.addressId);
    onChange("deliveryAddress", "");
    setSaveNotice(result.created ? "已存进客户档案，这一单就用这个地址。" : "客户档案里已有这个地址，已选上。");
  };
  useEffect(() => {
    if (!line.customerId) return undefined;
    let live = true;
    setBook({ customerId: line.customerId, loading: true, addresses: [], error: "" });
    void getOfficeCustomerDeliveryAddresses({ customerId: line.customerId, authState }, { serverRequired: true }).then((result) => {
      if (!live) return;
      setBook({ customerId: line.customerId, loading: false, addresses: result.addresses ?? [],
        error: result.blocked ? result.error?.message || "客户收货地址读取失败。" : "" });
    });
    return () => { live = false; };
  }, [line.customerId, authState]);
  const defaultAddress = book.addresses.find((item) => item.isDefault) ?? book.addresses[0];
  const value = oneOff ? "__one_off__" : line.deliveryAddressId || "";
  return (
    <div className="pricing-delivery-address">
      <label>
        送货地址
        <select
          aria-label={`第${index + 1}行送货地址`}
          disabled={disabled || book.loading}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setOneOff(next === "__one_off__");
            onChange("deliveryAddressId", next === "__one_off__" ? "" : next);
            if (next !== "__one_off__") onChange("deliveryAddress", "");
          }}
        >
          <option value="">{defaultAddress ? `客户默认地址：${defaultAddress.address}` : book.loading ? "正在读取客户地址…" : "客户档案里还没有地址"}</option>
          {book.addresses.filter((item) => item !== defaultAddress).map((item) => (
            <option key={item.addressId} value={item.addressId}>{item.address}{item.remark ? `（${item.remark}）` : ""}</option>
          ))}
          <option value="__one_off__">本单另填地址…</option>
        </select>
      </label>
      {oneOff ? (
        <label>
          本单送到哪里
          <input
            aria-label={`第${index + 1}行本单送货地址`}
            disabled={disabled}
            maxLength={200}
            placeholder="如：某某镇某某村 XX 制袋厂（只用于这一单）"
            value={line.deliveryAddress || ""}
            onChange={(e) => onChange("deliveryAddress", e.target.value)}
          />
        </label>
      ) : null}
      {oneOff ? (
        <button type="button" className="secondary-button" disabled={disabled || saving || !String(line.deliveryAddress || "").trim()} onClick={() => void saveToCustomer()}>
          {saving ? "正在保存…" : "存进客户档案，下次直接选"}
        </button>
      ) : null}
      {saveNotice ? <p className="pricing-note" role="status">{saveNotice}</p> : null}
      {book.error ? <p className="pricing-note" role="alert">{book.error}</p> : null}
    </div>
  );
}

// 外加工按来料卷数下单：数量印完才有。
function byIncomingRolls(line) {
  return line?.orderType === "external_print" && line?.qtyBasis === "incoming_rolls";
}
