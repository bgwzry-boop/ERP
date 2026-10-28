import { ReviewDialog } from "./ReviewDialog.jsx";

const money = (value) => Number.isFinite(value) ? `¥${value.toFixed(2)}` : "待核价";

export function OrderEntrySplitDialog({ plan, rows, quote, locked, busy, pending, notice, canConfirm, onClose, onConfirm }) {
  const groupRows = (group) => group.draftLineIds.map((id) => rows.find((row) => row.id === id)).filter(Boolean);
  const amount = (group) => {
    const values = group.draftLineIds.map((id) => locked
      ? rows.find((row) => row.id === id)?.amount
      : quote?.lines.find((line) => line.draftLineId === id)?.amount);
    return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  return <ReviewDialog className="pricing-split-dialog" labelledBy="pricing-split-title" onClose={onClose}>
    <header>
      <h2 id="pricing-split-title">拆单预览与确认</h2>
      <p>按客户、原始来单组、交付方式和最晚要货时间分组。不同颜色、尺寸或是否印刷不直接决定拆单。</p>
    </header>
    <div className="pricing-split-content">
      <p>将生成 <strong>{plan.groups.length}</strong> 张正式订单，共 {plan.activeDraftLineCount} 行。
        {plan.cancelledDraftLineIds.length ? ` 已取消的 ${plan.cancelledDraftLineIds.length} 行只保留记录，不下单。` : ""}</p>
      <ol aria-label="正式订单拆单分组">
        {plan.groups.map((group) => <li key={group.groupId}>
          <h3>第{group.sequence}单 · {group.customerName || "客户待确认"}</h3>
          <p>{group.fulfillmentMethod} · {group.latestNeededAt} · {group.quantityTotal}个 · {money(amount(group))}</p>
          <ul>{groupRows(group).map((row) => <li key={row.id}>{row.product || "袋子"} · {row.size} · {row.color || row.bagColor} · {row.qty}个</li>)}</ul>
          {group.reviewReasons.length ? <p role="alert">待核对：{group.reviewReasons.join("、")}</p> : null}
        </li>)}
      </ol>
      {plan.noSplitNeeded ? <p>当前只有一个交付组，无需拆单。返回后使用“确认下单”生成一张订单。</p> : null}
      {!locked && !quote ? <p>请返回生成正式报价，再重新预览拆单。</p> : null}
      {quote?.affectedOrders.length ? <p>本次还会按已勾选确认的报价修订 {quote.affectedOrders.length} 条关联原单价格；旧报价记录保留。</p> : null}
      {quote && !canConfirm && !plan.noSplitNeeded && plan.canConfirm ? <p>请返回，逐项确认正式报价中受影响的原单后再拆单。</p> : null}
      <p>确认后会创建正式订单、价格快照及相应库存占用、交付任务或生产任务；办公室仍须逐单安排出库或生产排单。</p>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
    <footer>
      <button type="button" disabled={busy || pending} onClick={onClose}>返回修改</button>
      <button type="button" className="primary-button" disabled={busy || !canConfirm} onClick={onConfirm}>
        {busy ? "正在确认…" : pending ? "按原内容重试拆单" : `确认生成 ${plan.groups.length} 张订单`}
      </button>
    </footer>
  </ReviewDialog>;
}
