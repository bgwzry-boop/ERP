import { useEffect, useRef, useState } from "react";
import { getOfficeDraft } from "../../../../src/services/officeOrderApiClient.js";
import { quoteOfficeOrderDraft } from "../../../../src/services/officeOrderPricingApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { normalizeOrderType } from "../../../../shared/orderRouting.js";
import { splitDraftRow } from "../../../../src/state/officeDraftActions.js";
import { OrderEntrySplitDialog } from "./OrderEntrySplitDialog.jsx";
import "./order-pricing-entry.css";

const unresolvedWrites = new Map();

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
  const session = formal.authState?.session?.accessToken || "";
  // Keep the accepted default draft stable while editing or showing its receipt.
  // Refreshing the queue can remove a confirmed draft; it must not silently
  // remount the editor on a different draft and erase the successful result.
  const defaultDraft = useRef({ session, draft: null });
  if (defaultDraft.current.session !== session) defaultDraft.current = { session, draft: null };
  if (!selectedId && !defaultDraft.current.draft && formal.data.orderDrafts?.[0]) {
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
    : defaultDraft.current.draft;
  const identity = `${session}:${selectedId || draftIdentity(selected)}`;
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
  const [rows, setRows] = useState(
    initial?.rows ?? selected?.lines ?? selected?.rows ?? [],
  );
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
  const [splitPlan, setSplitPlan] = useState(initial?.splitPlan ?? null);
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(
      recovered ? `${recovered.kind}结果待核对，请按原内容重试。` : "",
    ),
    [complete, setComplete] = useState(false);
  const splitTrigger = useRef(null);
  const requests = useRef({});
  const frozenRequest = useRef(recovered ?? null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [pendingKind, setPendingKind] = useState(recovered?.kind ?? "");
  const editingLocked = !!busy || complete || !!pendingKind || !!splitPlan;
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
  const update = (index, key, value) => {
    if (frozenRequest.current || splitPlan) return;
    invalidate();
    setRows((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
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
        rows,
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
          { status: result.error?.status },
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
        if (["确认", "拆单确认"].includes(kind)) {
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
        setRows(result.rows);
        setDraftId(draftIdentity(result.draft));
        setRevision(nextRevision);
        setOverrides({});
        setSupplementIds([]);
        setBatch("");
        setReason("");
        setSameBatch(false);
        setNotice("已识别，请核对类型、规格、颜色和交期。");
      },
    );
  const save = () =>
    execute(
      "保存",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: source,
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
        setNotice("草稿已保存，请生成正式报价后确认。");
      },
    );
  const pricing = () =>
    execute(
      "报价",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: source,
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
        setAffected([]);
        requests.current.confirm = null;
        setNotice("正式报价已保存。请核对金额和受影响原单，再确认下单。");
      },
    );
  const confirm = () =>
    execute(
      "确认",
      {
        draftId,
        clientRevision: revision,
        rows,
        sourceText: source,
        pricingQuoteId: quote?.quoteId,
        confirmedAffectedOrderLineIds: affected,
        idempotencyKey: nextKey("confirm"),
      },
      (input) => formal.actions.confirmOrderDraft(input),
      (result) => {
        if (
          !result.confirmation?.orderLines?.length ||
          !result.confirmation.orderId
        )
          throw new Error("没有取得完整订单回执。");
        setComplete(true);
        setNotice("正式订单已生成，办公室仍需安排出库或生产排单。");
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
    setNotice(`${result.toast} 请分别核对数量、交付和日期，并重新生成正式报价；原行的本单改价需重新填写，避免费用重复。`);
  };
  const previewSplit = async () => {
    if (inFlight.current || editingLocked || !canConfirmOrder || !draftId || !rows.length) return;
    inFlight.current = true;
    setBusy("拆单预览");
    try {
      const result = await formal.actions.previewOrderDraftSplit({ draftId, clientRevision: revision, rows, sourceText: source });
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
  const confirmSplit = () => execute(
    "拆单确认",
    { draftId, clientRevision: revision, rows, sourceText: source, splitPlanHash: splitPlan?.planHash,
      pricingQuoteId: quote?.quoteId, confirmedAffectedOrderLineIds: affected, idempotencyKey: nextKey("splitConfirm") },
    (input) => formal.actions.confirmOrderDraftSplit(input),
    (result) => {
      const confirmation = result.confirmation;
      if (!confirmation?.splitConfirmed || !Array.isArray(confirmation.orderIds) ||
          confirmation.orderIds.length !== splitPlan?.groups.length || !confirmation.orderLines?.length) {
        throw new Error("没有取得完整拆单回执。");
      }
      setSplitPlan(null);
      setComplete(true);
      setNotice(`已生成 ${confirmation.orderIds.length} 张正式订单：${confirmation.orderIds.join("、")}。办公室仍需安排出库或生产排单。`);
      void Promise.resolve(formal.actions.refreshAll()).catch(() => setNotice("拆单已成功，请刷新订单池核对全部订单。"));
    },
  );
  const candidates = (formal.data.orderLines || []).filter(
    (line) =>
      rows.some((row) => row.customerId === line.customerId) &&
      privatePrint(line) &&
      !/已交付|已完成|已作废|取消/u.test(line.status || ""),
  );
  const missing = rows.some(
    (line) =>
      !line.customerId ||
      !line.size ||
      !(line.color || line.bagColor) ||
      !Number.isSafeInteger(Number(line.qty)) ||
      Number(line.qty) < 1,
  );
  const acknowledge = quote?.affectedOrders.every((line) =>
    affected.includes(line.orderLineId),
  );
  return (
    <div
      className="order-pricing-entry source-grounded-workbench"
      aria-label="订单录入与正式报价"
    >
      <main className="pricing-editor">
        <header className="pricing-heading">
          <div>
            <h2>订单录入</h2>
            <p>核对来单 → 正式报价 → 确认下单</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={editingLocked}
            onClick={() => onNavigate("order-pool")}
          >
            查看订单池
          </button>
        </header>
        <section className="pricing-source">
          <label htmlFor="pricing-source">客户订单原文</label>
          <textarea
            id="pricing-source"
            value={source}
            disabled={editingLocked}
            onChange={(event) => {
              invalidate();
              setSource(event.target.value);
            }}
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
          <header>
            <h3>订单明细</h3>
            <span>{rows.length} 行</span>
          </header>
          {!rows.length ? (
            <p className="pricing-empty">
              粘贴客户消息并识别，或从留货记录转入草稿。
            </p>
          ) : (
            rows.map((line, index) => (
              <fieldset key={line.id} disabled={editingLocked || locked}>
                <legend>
                  第 {index + 1} 行 ·{" "}
                  {line.customer || line.customerName || line.customerId}
                </legend>
                <div className="pricing-line-fields">
                  <label>
                    订单分类
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
                      <option value="external_print">外来袋印刷</option>
                    </select>
                  </label>
                  <label>
                    规格（宽×高×侧）
                    <input
                      aria-label={`第${index + 1}行规格`}
                      value={line.size || ""}
                      onChange={(e) => update(index, "size", e.target.value)}
                    />
                  </label>
                  <label>
                    袋身颜色
                    <input
                      value={line.color || line.bagColor || ""}
                      onChange={(e) => update(index, "color", e.target.value)}
                    />
                  </label>
                  <label>
                    数量（个）
                    <input
                      aria-label={`第${index + 1}行数量`}
                      inputMode="numeric"
                      value={line.qty ?? ""}
                      onChange={(e) =>
                        update(index, "qty", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    提手
                    <select
                      value={line.handle || "普通提"}
                      onChange={(e) => update(index, "handle", e.target.value)}
                    >
                      <option>普通提</option>
                      <option>加长提</option>
                    </select>
                  </label>
                  <label>
                    是否印刷
                    <select
                      value={line.print || "否"}
                      onChange={(e) => update(index, "print", e.target.value)}
                    >
                      <option>否</option>
                      <option>是</option>
                    </select>
                  </label>
                  <label>
                    交付
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
                    需要日期
                    <input
                      aria-label={`第${index + 1}行需要日期`}
                      placeholder="如 2026-10-25"
                      value={line.latest || ""}
                      onChange={(e) => update(index, "latest", e.target.value)}
                    />
                  </label>
                </div>
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
                        value={line.printSide || "单面"}
                        onChange={(e) =>
                          update(index, "printSide", e.target.value)
                        }
                      >
                        <option>单面</option>
                        <option>双面</option>
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
                {line.inventory === "缺货" ? (
                  <p className="pricing-note">
                    库存不足，确认后仍须安排生产或核对补货。
                  </p>
                ) : null}
              </fieldset>
            ))
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
        <footer className="pricing-actions">
          <p role="status" aria-live="polite">
            {notice || "草稿不占用库存；确认下单后由办公室安排出库或生产。"}
          </p>
          <div>
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
            {!locked ? (
              <button
                type="button"
                className="primary-button"
                disabled={
                  !!splitPlan ||
                  !!busy ||
                  !draftId ||
                  missing ||
                  !rows.length ||
                  complete ||
                  (!!pendingKind && pendingKind !== "报价")
                }
                onClick={() => void pricing()}
              >
                {busy === "报价"
                  ? "正在生成报价…"
                  : pendingKind === "报价"
                    ? "按原内容重试报价"
                    : "生成正式报价"}
              </button>
            ) : null}
            <button type="button" ref={splitTrigger} disabled={editingLocked || !canConfirmOrder || !draftId || !rows.length}
              onClick={() => void previewSplit()}>
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
                (!locked && (!quote || !acknowledge)) ||
                (!!pendingKind && pendingKind !== "确认")
              }
              onClick={() => void confirm()}
            >
              {busy === "确认"
                ? "正在确认…"
                : pendingKind === "确认"
                  ? "按原内容重试确认"
                  : "确认下单"}
            </button>
          </div>
        </footer>
      </main>
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
          <p className="pricing-empty">
            核对明细后生成报价。缺少发布价或已确认材料价时会保留草稿；有权限人员可填写本单价及原因。
          </p>
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
                    <dd>{line.chargeableQty} 个</dd>
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
