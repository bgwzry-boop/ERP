// P2-02 丝印领任务（负责人 2026-11-04）：
// 丝印工按油墨颜色自己挑任务——先印白色，黑色和多色放收尾。领了的显示“已被XX领取”，
// 自己领的、还没开始做的可以释放（比如临时有事）。
import { useCallback, useEffect, useRef, useState } from "react";
import { LockOutlined } from "@ant-design/icons";
import { claimSilkScreenTask, listSilkScreenClaimPool, releaseSilkScreenTask } from "../../services/silkScreenClaimApiClient.js";

export function useSilkScreenClaimPool({ authState, enabled }) {
  const [state, setState] = useState({ status: enabled ? "loading" : "off", items: [], groups: [], message: "" });
  const generation = useRef(0);
  const token = authState?.session?.accessToken || "";
  const reload = useCallback(async () => {
    if (!enabled || !token) { setState({ status: "off", items: [], groups: [], message: "" }); return; }
    const gen = ++generation.current;
    const result = await listSilkScreenClaimPool({ authState });
    if (gen !== generation.current) return;
    if (result.ok) setState({ status: "ready", items: result.data.items ?? [], groups: result.data.groups ?? [], truncated: Boolean(result.data.truncated), message: "" });
    // Not a silk-screen printer (or no machine yet): the entry simply does not show.
    else if (result.error?.status === 403) setState({ status: "off", items: [], groups: [], message: "" });
    else setState((current) => ({ ...current, status: "error", message: result.error?.message || "领任务列表读取失败，请稍后刷新。" }));
  }, [enabled, token]);
  useEffect(() => { void reload(); return () => { generation.current += 1; }; }, [reload]);
  return { ...state, reload };
}

export function SilkScreenClaimPool({ authState, pool, onChanged }) {
  const [busyId, setBusyId] = useState("");
  const [confirmReleaseId, setConfirmReleaseId] = useState("");
  const [message, setMessage] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  async function act(kind, item) {
    if (busyId) return;
    const productionTaskId = item.productionTaskId;
    const expectedRevision = Number(item.productionTask?.revision ?? 1);
    setBusyId(productionTaskId); setMessage("");
    const result = kind === "claim"
      ? await claimSilkScreenTask({ authState, productionTaskId, expectedRevision })
      : await releaseSilkScreenTask({ authState, productionTaskId, expectedRevision });
    if (!live.current) return;
    setBusyId(""); setConfirmReleaseId("");
    if (result.ok) setMessage(kind === "claim" ? `已领取 ${shortNo(item)}，已放进你的生产任务。` : `已释放 ${shortNo(item)}，别的师傅可以领了。`);
    else setMessage(result.error?.message || "操作没有成功，请刷新后再试。");
    // Always re-read: a lost race or an unconfirmed request is settled by what the server now says.
    await pool.reload();
    if (result.ok || result.uncertain) await onChanged?.();
  }

  if (pool.status === "loading") return <p className="silk-claim-status" role="status">正在读取丝印任务池…</p>;
  if (pool.status === "error") return <div className="silk-claim-status" role="alert">{pool.message}<button type="button" onClick={() => void pool.reload()}>重新读取</button></div>;
  const groups = (pool.groups.length ? pool.groups : [{ key: "all", label: "全部" }])
    .map((group) => ({ ...group, items: pool.items.filter((item) => group.key === "all" || item.inkGroup === group.key) }))
    .filter((group) => group.items.length);
  const mine = pool.items.filter((item) => item.claimedByMe).length;
  return (
    <section className="silk-claim-pool" aria-label="丝印领任务">
      <header className="silk-claim-head">
        <div>
          <h2>领丝印任务</h2>
          <p>先印白色，黑色和多色放到最后。已领 {mine} 个。</p>
        </div>
        <button type="button" disabled={Boolean(busyId)} onClick={() => void pool.reload()}>刷新</button>
      </header>
      {message ? <p className="silk-claim-message" role="status">{message}</p> : null}
      {pool.truncated ? <p className="silk-claim-message" role="note">任务太多，只显示前 200 个。</p> : null}
      {!groups.length ? <p className="silk-claim-status">现在没有可领的丝印任务。</p> : groups.map((group) => (
        <section key={group.key} className={`silk-claim-group ink-${group.key}`} aria-label={group.label}>
          <h3>{group.label}<small>{group.items.length} 个</small></h3>
          <ul>
            {group.items.map((item) => {
              const line = item.orderLine ?? {};
              const task = item.productionTask ?? {};
              const claimer = String(task.claimedByUserId ?? "").trim();
              const started = claimer && task.taskStatus !== "丝印已排产";
              return (
                <li key={item.productionTaskId} className={`silk-claim-row${claimer ? item.claimedByMe ? " mine" : " taken" : ""}`}>
                  <div className="silk-claim-info">
                    <strong>{shortNo(item)} · 印{line.printColor || "色待确认"}{line.printSide ? ` · ${line.printSide}` : ""}</strong>
                    <span>{[line.productName, line.size, line.bagColor].filter(Boolean).join(" · ")}</span>
                    <small>{Number(task.plannedQty ?? 0) ? `${task.plannedQty} 个` : "按来料卷数"}{line.latestNeededAt ? ` · 最晚 ${formatDay(line.latestNeededAt)}` : ""}</small>
                  </div>
                  <div className="silk-claim-actions">
                    {!claimer ? (
                      <button type="button" className="primary-action" disabled={Boolean(busyId)} onClick={() => void act("claim", item)}>
                        {busyId === item.productionTaskId ? "领取中…" : "领取"}
                      </button>
                    ) : item.claimedByMe ? (
                      <>
                        <span className="silk-claim-lock mine">{started ? "我在做" : "我已领取"}</span>
                        {!started ? confirmReleaseId === item.productionTaskId ? (
                          <span className="silk-claim-confirm">
                            <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmReleaseId("")}>不释放</button>
                            <button type="button" className="danger-action" disabled={Boolean(busyId)} onClick={() => void act("release", item)}>
                              {busyId === item.productionTaskId ? "释放中…" : "确认释放"}
                            </button>
                          </span>
                        ) : (
                          <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmReleaseId(item.productionTaskId)}>释放</button>
                        ) : null}
                      </>
                    ) : (
                      <span className="silk-claim-lock"><LockOutlined aria-hidden="true" /> 已被{task.claimedByName || "别人"}领取</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}

function shortNo(item) {
  const line = item.orderLine ?? {};
  return line.orderId || item.orderLineId || item.productionTaskId;
}

function formatDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : `${date.getMonth() + 1}月${date.getDate()}日`;
}
