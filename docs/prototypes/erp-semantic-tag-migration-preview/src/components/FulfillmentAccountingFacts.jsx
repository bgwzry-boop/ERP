const shipmentLedger = {
  "ORD-0729-026-07": { shipped: 0, current: 0 },
  "ORD-0729-026-08": { shipped: 1200, current: 800 },
  "ORD-0729-026-09": { shipped: 0, current: 0 },
  "ORD-0729-026-10": { shipped: 500, current: 1000 },
  "ORD-0729-026-11": { shipped: 2400, current: 0 },
  "ORD-0729-026-12": { shipped: 0, current: 0 },
  "ORD-0729-026-13": { shipped: 0, current: 0 },
  "ORD-0729-026-14": { shipped: 600, current: 1200 },
};

const receivableLedger = {
  "ORD-0729-026-07": { historical: 840, currentOrder: 1260 },
  "ORD-0729-026-08": { historical: 1800, currentOrder: 2730 },
  "ORD-0729-026-09": { historical: 0, currentOrder: 1260 },
  "ORD-0729-026-10": { historical: 622, currentOrder: 1575 },
  "ORD-0729-026-11": { historical: 2400, currentOrder: 2520 },
  "ORD-0729-026-12": { historical: 920, currentOrder: 1890 },
  "ORD-0729-026-13": { historical: 0, currentOrder: 2310 },
  "ORD-0729-026-14": { historical: 1240, currentOrder: 2520 },
};

const formatQuantity = (value) => new Intl.NumberFormat("zh-CN").format(value);
const formatMoney = (value) => `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2 }).format(value)}`;

function getShipmentFacts(order) {
  const ledger = shipmentLedger[order.id] || { shipped: 0, current: 0 };
  return {
    ordered: order.quantity,
    shipped: ledger.shipped,
    current: ledger.current,
    remaining: Math.max(0, order.quantity - ledger.shipped - ledger.current),
  };
}

function getReceivableFacts(order) {
  const ledger = receivableLedger[order.id] || { historical: 0, currentOrder: Math.round(order.quantity * 1.05) };
  return { ...ledger, total: ledger.historical + ledger.currentOrder };
}

export function ShipmentProgress({ order, compact = false }) {
  const facts = getShipmentFacts(order);
  return (
    <section className={`shipment-progress ${compact ? "is-compact" : ""}`} aria-label="发货数量核对">
      <header><strong>发货数量</strong><small>按已确认出库记录自动汇总</small></header>
      <div className="shipment-progress-values">
        <span><small>订货数量</small><strong>{formatQuantity(facts.ordered)}</strong></span>
        <span><small>已发数量</small><strong>{formatQuantity(facts.shipped)}</strong></span>
        <span className="is-current"><small>本次发货</small><strong>{formatQuantity(facts.current)}</strong></span>
        <span><small>剩余未发</small><strong>{formatQuantity(facts.remaining)}</strong></span>
      </div>
    </section>
  );
}

export function ReceivableSnapshot({ order }) {
  const facts = getReceivableFacts(order);
  return (
    <section className="receivable-snapshot" aria-label="客户账款提示">
      <header><strong>客户账款提示</strong><small>只读核对</small></header>
      <div>
        <span><small>历史欠款</small><strong>{formatMoney(facts.historical)}</strong></span>
        <span><small>本单应收</small><strong>{formatMoney(facts.currentOrder)}</strong></span>
        <span className="is-total"><small>累计待收</small><strong>{formatMoney(facts.total)}</strong></span>
      </div>
      <p>仅作办公室交付核对，不自动拦截本次出库。</p>
    </section>
  );
}
