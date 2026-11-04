// P2-03 今天先发（负责人 2026-11-04）：发不发、发多少由客户定（客户叫快递来厂取件）。
// 办公室记下客户要今天发之后，打包工按整包装：填装了几包、每包几个，系统按这个数拆出来先发，
// 照常生成打包任务（再按包登记贴标签）；做好但没装包的、没做完的，明天接着发。
import { useCallback, useEffect, useRef, useState } from "react";
import { listEarlyShipmentsForPacking, splitForEarlyShipment } from "../../services/earlyShipmentApiClient.js";

export function EarlyShipmentPackingPanel({ authState, onChanged }) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [inputs, setInputs] = useState({});
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const live = useRef(true);
  const token = authState?.session?.accessToken || "";
  const reload = useCallback(async () => {
    if (!token) return;
    const result = await listEarlyShipmentsForPacking({ authState });
    if (!live.current) return;
    if (result.ok) setItems(result.items);
    else if (result.error?.status !== 403) setMessage(result.error?.message || "");
  }, [token]);
  useEffect(() => { live.current = true; void reload(); return () => { live.current = false; }; }, [reload]);

  if (!items.length && !message) return null;

  function update(id, field, value) {
    setInputs((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [field]: value } }));
    setConfirmId("");
  }

  async function submit(item, packageCount, qtyPerPackage) {
    if (busyId) return;
    setBusyId(item.productionTaskId); setMessage("");
    const result = await splitForEarlyShipment({
      authState,
      productionTaskId: item.productionTaskId,
      expectedRevision: Number(item.productionTask?.revision ?? 1),
      packageCount,
      qtyPerPackage,
    });
    if (!live.current) return;
    setBusyId(""); setConfirmId("");
    if (result.ok) {
      const data = result.data;
      setMessage(`已拆出 ${data.shippedNowQty} 个先发${data.completion?.status === "completed" ? "，打包任务已生成，请按包登记贴标签" : `（${data.completion?.message || "请车间点「报工完成」"}）`}；剩下 ${data.remainderQty} 个${data.carriedReadyQty ? `（含已做好没装包的 ${data.carriedReadyQty} 个）` : ""}明天接着发。`);
      setInputs((current) => ({ ...current, [item.productionTaskId]: {} }));
    } else {
      setMessage(result.error?.message || "没有成功，请刷新后再试。");
    }
    await reload();
    if (result.ok || result.uncertain) await onChanged?.();
  }

  return (
    <section className="early-ship-packing" aria-label="今天先发">
      <h3>今天先发（客户要今天发）</h3>
      {message ? <p className="early-ship-message" role="status">{message}</p> : null}
      <ul>
        {items.map((item) => {
          const line = item.orderLine ?? {};
          const task = item.productionTask ?? {};
          const own = inputs[item.productionTaskId] ?? {};
          const packageCount = Number(own.packageCount);
          const qtyPerPackage = Number(own.qtyPerPackage);
          const total = Number.isSafeInteger(packageCount) && Number.isSafeInteger(qtyPerPackage) && packageCount > 0 && qtyPerPackage > 0 ? packageCount * qtyPerPackage : 0;
          const cap = Number(task.earlyShipMaxQty) || 0;
          const limit = cap > 0 ? Math.min(cap, item.reportedQty) : item.reportedQty;
          const tooMany = total > limit;
          return (
            <li key={item.productionTaskId}>
              <div className="early-ship-info">
                <strong>{item.customerName || line.customerId} · {[line.productName, line.size, line.bagColor].filter(Boolean).join(" ")}</strong>
                <span>整单 {task.plannedQty} 个，车间已报做好 {item.reportedQty} 个{cap ? `；客户要今天发 ${cap} 个` : "；客户要有多少发多少"}</span>
                {task.earlyShipNote ? <small>{task.earlyShipNote}</small> : null}
              </div>
              <div className="early-ship-form">
                <label><span>装了几包</span><input type="number" min="1" inputMode="numeric" value={own.packageCount ?? ""} onChange={(event) => update(item.productionTaskId, "packageCount", event.target.value)} /></label>
                <label><span>每包几个</span><input type="number" min="1" inputMode="numeric" value={own.qtyPerPackage ?? ""} onChange={(event) => update(item.productionTaskId, "qtyPerPackage", event.target.value)} /></label>
              </div>
              {tooMany ? <p className="early-ship-warning" role="alert">一共 {total} 个，超过了可发的 {limit} 个，请少装几包。</p> : null}
              {total > 0 && !tooMany ? (
                confirmId === item.productionTaskId ? (
                  <div className="early-ship-actions">
                    <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmId("")}>再看看</button>
                    <button type="button" className="primary-action" disabled={Boolean(busyId)} onClick={() => void submit(item, packageCount, qtyPerPackage)}>
                      {busyId === item.productionTaskId ? "处理中…" : `确认先发 ${packageCount} 包 × ${qtyPerPackage} 个`}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="primary-action" disabled={Boolean(busyId)} onClick={() => setConfirmId(item.productionTaskId)}>
                    先发 {total} 个（{packageCount} 包）
                  </button>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
