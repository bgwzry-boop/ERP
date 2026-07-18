import {
  AppstoreOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  InboxOutlined,
  ReloadOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { readFileAsDataUrl } from "../../app/browserFileActions.js";
import {
  createMaintenanceEvidenceAttachmentInput,
  createOfficeAttachment,
} from "../../services/officeAttachmentApiClient.js";
import {
  listMaintenanceTasks,
  normalizeMaintenanceTask,
  updateMaintenanceTask,
} from "../../services/maintenanceTaskApiClient.js";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];
const TERMINAL_STATUSES = new Set(["已恢复", "已完成"]);

const DEFAULT_TASKS = Object.freeze([
  { id: "MT-BAG-01", machineId: "BAG-01", machineName: "1号制袋机", type: "日常巡检", status: "待检查", priority: "今天", faultCategory: "例行检查", summary: "检查温控、切刀、计数器和安全防护。", due: "今天 16:00", revision: 1, photoAttachmentIds: [] },
  { id: "MT-PRINT-01", machineId: "PRINT-01", machineName: "1号丝印机", type: "设备报修", status: "待处理", priority: "异常", faultCategory: "定位偏差", summary: "连续印刷时定位出现偏差，需检查夹具和传感器。", due: "尽快", revision: 1, photoAttachmentIds: [] },
  { id: "MT-PACK-01", machineId: "PACK-01", machineName: "打包标签机", type: "预防维护", status: "待维护", priority: "本周", faultCategory: "蓝牙连接", summary: "检查配对稳定性、走纸和标签校准。", due: "周五前", revision: 1, photoAttachmentIds: [] },
]);

export function MaintenanceMobilePage({ authState, currentUser = {}, tasks = DEFAULT_TASKS }) {
  const [view, setView] = useState("current");
  const [queueMode, setQueueMode] = useState("pending");
  const [taskRecords, setTaskRecords] = useState(() => normalizeTasks(tasks));
  const [selectedId, setSelectedId] = useState(tasks[0]?.id ?? "");
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState(null);
  const [readState, setReadState] = useState({ loading: false, error: "" });
  const [confirmation, setConfirmation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isFormalSession = authState?.source === "api_runtime" && authState?.authenticated === true;
  const pendingTasks = useMemo(() => taskRecords.filter((task) => !TERMINAL_STATUSES.has(task.status)), [taskRecords]);
  const completedTasks = useMemo(() => taskRecords.filter((task) => TERMINAL_STATUSES.has(task.status)), [taskRecords]);
  const selected = taskRecords.find((task) => task.id === selectedId) ?? pendingTasks[0] ?? taskRecords[0] ?? null;
  const draft = drafts[selected?.id] ?? buildDraft(selected);
  const frozen = Boolean(confirmation) || submitting;

  useEffect(() => {
    if (!isFormalSession) {
      setTaskRecords(normalizeTasks(tasks));
      setReadState({ loading: false, error: "" });
      return undefined;
    }
    let active = true;
    setReadState({ loading: true, error: "" });
    listMaintenanceTasks({ authState, operatorId: currentUser.userId }).then((result) => {
      if (!active) return;
      if (result.blocked) {
        setReadState({ loading: false, error: result.error?.message || "设备任务读取失败，请稍后重试。" });
        return;
      }
      setTaskRecords(result.items ?? []);
      setReadState({ loading: false, error: "" });
      setSelectedId((current) => result.items?.some((item) => item.id === current) ? current : (result.items?.[0]?.id ?? ""));
    });
    return () => { active = false; };
  }, [authState, currentUser.userId, isFormalSession, tasks]);

  function openTask(taskId) {
    setSelectedId(taskId);
    setNotice(null);
    setConfirmation(null);
    setQueueMode("pending");
    setView("current");
  }

  function updateDraft(field, value) {
    if (!selected || frozen) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: { ...buildDraft(selected), ...(current[selected.id] ?? {}), [field]: value },
    }));
    setNotice(null);
  }

  function beginSubmit() {
    if (!selected || submitting) return;
    const error = validateDraft(selected, draft);
    if (error) {
      setNotice({ tone: "danger", text: error });
      return;
    }
    if (TERMINAL_STATUSES.has(draft.status)) {
      setConfirmation({ taskId: selected.id, expectedRevision: selected.revision });
      setNotice(null);
      return;
    }
    submitTask({ completionConfirmed: false });
  }

  async function submitTask({ completionConfirmed }) {
    if (!selected || !isFormalSession || submitting) return;
    setSubmitting(true);
    setNotice(null);
    let photoAttachmentIds = [...(selected.photoAttachmentIds ?? [])];
    try {
      if (draft.photoFile) {
        const contentDataUrl = await readFileAsDataUrl(draft.photoFile);
        if (!contentDataUrl) throw new Error("设备照片读取失败，请重新拍摄或选择。");
        const file = {
          name: draft.photoFile.name,
          type: draft.photoFile.type,
          size: draft.photoFile.size,
          contentDataUrl,
        };
        const upload = await createOfficeAttachment(
          createMaintenanceEvidenceAttachmentInput({
            taskId: selected.id,
            operatorId: currentUser.userId,
            remark: `${selected.machineName} · ${draft.status} · 设备检查留痕`,
            file,
          }),
          { serverRequired: true },
        );
        if (upload.blocked || !upload.attachment?.attachmentId) {
          throw new Error(upload.error?.message || "设备照片上传失败，任务尚未提交。");
        }
        photoAttachmentIds = [...new Set([...photoAttachmentIds, upload.attachment.attachmentId])];
      }
      const result = await updateMaintenanceTask({
        authState,
        operatorId: currentUser.userId,
        taskId: selected.id,
        expectedRevision: selected.revision,
        finding: draft.finding.trim(),
        actionTaken: draft.action.trim(),
        status: draft.status,
        photoAttachmentIds,
        completionConfirmed,
      });
      if (result.blocked || !result.task) {
        const conflict = result.error?.code === "MAINTENANCE_TASK_REVISION_CONFLICT";
        throw new Error(conflict ? "任务已被另一台设备更新，请刷新后重新核对。" : (result.error?.message || "设备任务提交失败。"));
      }
      const saved = normalizeMaintenanceTask(result.task);
      setTaskRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[saved.id];
        return next;
      });
      setConfirmation(null);
      setNotice({
        tone: "success",
        text: TERMINAL_STATUSES.has(saved.status)
          ? `已完成 ${saved.machineName} 的任务，实际机修人员、时间、照片和办公室待办均已留痕。`
          : `已保存“${saved.status}”，办公室共享待办已同步。`,
      });
      if (TERMINAL_STATUSES.has(saved.status)) {
        const nextTask = pendingTasks.find((item) => item.id !== saved.id);
        if (nextTask) setSelectedId(nextTask.id);
      }
    } catch (error) {
      setNotice({ tone: "danger", text: error?.message || String(error) });
      setConfirmation(null);
    } finally {
      setSubmitting(false);
    }
  }

  function refreshTasks() {
    if (!isFormalSession) return;
    setReadState({ loading: true, error: "" });
    listMaintenanceTasks({ authState, operatorId: currentUser.userId }).then((result) => {
      if (result.blocked) {
        setReadState({ loading: false, error: result.error?.message || "设备任务读取失败。" });
        return;
      }
      setTaskRecords(result.items ?? []);
      setReadState({ loading: false, error: "" });
      setNotice({ tone: "success", text: "已刷新服务器设备任务。" });
    });
  }

  function openFirstType(type) {
    const task = pendingTasks.find((item) => item.type === type) ?? taskRecords.find((item) => item.type === type);
    if (task) openTask(task.id);
  }

  function showRecords() {
    setQueueMode("completed");
    setView("pending");
  }

  const queueTasks = queueMode === "completed" ? completedTasks : pendingTasks;

  return (
    <section className={`maintenance-mobile-page guided-mobile-page view-${view}`} aria-label="现场机修手机工作台">
      <header className="guided-mobile-hero maintenance-mobile-hero">
        <div>
          <h1>设备任务</h1>
        </div>
        <strong>{pendingTasks.length}<small>待处理</small></strong>
      </header>

      {readState.error ? <p className="maintenance-mobile-notice danger" role="alert">{readState.error} 当前暂停提交，避免覆盖其他人的处理结果。</p> : null}
      {notice ? <p className={`maintenance-mobile-notice ${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>{notice.text}</p> : null}

      {view === "current" ? (
        selected ? <section className="maintenance-mobile-card">
          <header>
            <div><span>{selected.id}</span><h2>{selected.machineName}</h2></div>
            <em className={selected.priority === "异常" ? "danger" : TERMINAL_STATUSES.has(selected.status) ? "success" : "warning"}>{selected.status}</em>
          </header>
          <dl>
            <div><dt>任务类型</dt><dd>{selected.type}</dd></div>
            <div><dt>机台编号</dt><dd>{selected.machineId}</dd></div>
            <div><dt>故障分类</dt><dd>{selected.faultCategory}</dd></div>
            <div><dt>最晚处理</dt><dd>{formatDue(selected)}</dd></div>
          </dl>
          <p className="maintenance-mobile-summary">{selected.summary}</p>
          {TERMINAL_STATUSES.has(selected.status) ? (
            <section className="maintenance-mobile-completed-summary">
              <strong><CheckCircleOutlined /> 已完成并留痕</strong>
              <p>{selected.finding || "检查结果已记录"}；{selected.actionTaken || "处理措施已记录"}</p>
              <span>{selected.photoAttachmentIds?.length ?? 0} 张照片 · {formatTimestamp(selected.completedAt)}</span>
            </section>
          ) : (
            <>
              <section className="maintenance-mobile-steps" aria-label="设备任务处理步骤">
                <span className="active">1 查看任务</span><span>2 记录处理</span><span>3 确认提交</span>
              </section>
              <section className="maintenance-mobile-form">
                <label><span>检查发现</span><textarea disabled={frozen} maxLength={500} onChange={(event) => updateDraft("finding", event.target.value)} placeholder="写清看到的问题或检查结果" value={draft.finding} /></label>
                <label><span>采取措施</span><textarea disabled={frozen} maxLength={500} onChange={(event) => updateDraft("action", event.target.value)} placeholder="维修、调整、更换或继续观察" value={draft.action} /></label>
                <label><span>处理状态</span><select disabled={frozen} onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                  <option value="">请选择</option><option>处理中</option><option>已恢复</option><option>等待配件</option><option>需要停机</option><option>转办公室协调</option>
                </select></label>
                <label className="maintenance-photo-field"><CameraOutlined /><span>拍照或选择设备照片</span><input accept="image/*" capture="environment" disabled={frozen} onChange={(event) => updateDraft("photoFile", event.target.files?.[0] ?? null)} type="file" /></label>
                {draft.photoFile ? <p className="maintenance-photo-name">已选择：{draft.photoFile.name}</p> : selected.photoAttachmentIds?.length ? <p className="maintenance-photo-name">服务器已有 {selected.photoAttachmentIds.length} 张照片</p> : null}
              </section>
              {!confirmation ? (
                <>
                  {draft.status === "已恢复" ? <section className="maintenance-mobile-boundary">
                    <strong><WarningOutlined /> 完成任务</strong>
                    <p>确认后记录处理人、完成时间和照片，并关闭办公室待办。</p>
                  </section> : null}
                  <button className="maintenance-mobile-primary" disabled={!isFormalSession || Boolean(readState.error) || readState.loading || submitting} onClick={beginSubmit} type="button">
                    <CheckCircleOutlined /> {!isFormalSession ? "正式账号登录后提交" : draft.status === "已恢复" ? "核对并提交完成" : "保存处理进度"}
                  </button>
                </>
              ) : (
                <section className="maintenance-completion-confirmation" aria-live="polite">
                  <strong>最终确认：提交设备已恢复</strong>
                  <dl>
                    <div><dt>任务 / 机台</dt><dd>{selected.id} · {selected.machineName}</dd></div>
                    <div><dt>检查发现</dt><dd>{draft.finding}</dd></div>
                    <div><dt>采取措施</dt><dd>{draft.action}</dd></div>
                    <div><dt>设备照片</dt><dd>{draft.photoFile ? `新照片：${draft.photoFile.name}` : `服务器已有 ${selected.photoAttachmentIds?.length ?? 0} 张`}</dd></div>
                  </dl>
                  <p>确认后写入实际机修人员和完成时间，并把同一设备任务的办公室待办标为已处理；历史结果不可被旧版本覆盖。</p>
                  <div>
                    <button disabled={submitting} onClick={() => setConfirmation(null)} type="button">返回修改</button>
                    <button className="primary-action" disabled={!isFormalSession || submitting || Boolean(readState.error)} onClick={() => submitTask({ completionConfirmed: true })} type="button">{submitting ? "正在上传并提交…" : isFormalSession ? "确认完成任务" : "正式账号登录后提交"}</button>
                  </div>
                </section>
              )}
            </>
          )}
        </section> : <section className="maintenance-mobile-empty"><CheckCircleOutlined /><strong>当前没有设备任务</strong><span>新的报修或巡检任务会出现在这里。</span></section>
      ) : null}

      {view === "pending" ? <section className="guided-mobile-queue maintenance-mobile-queue" aria-label="设备任务列表">
        <header><div><h2>{queueMode === "completed" ? "维护记录" : "待处理任务"}</h2></div><strong>{queueTasks.length}</strong></header>
        {queueTasks.length ? queueTasks.map((task) => <button key={task.id} onClick={() => openTask(task.id)} type="button"><span>{task.type} · {task.priority}</span><strong>{task.machineName} · {task.faultCategory}</strong><small>{task.summary}</small></button>) : <p className="maintenance-queue-empty">当前没有{queueMode === "completed" ? "维护记录" : "待处理任务"}。</p>}
      </section> : null}

      {view === "all" ? <section className="guided-mobile-functions maintenance-mobile-functions" aria-label="机修全部功能">
        <header><h2>任务分类</h2></header>
        <div>
          <FunctionButton count={pendingTasks.filter((task) => task.type === "设备报修").length} icon={WarningOutlined} label="设备报修" onClick={() => openFirstType("设备报修")} />
          <FunctionButton count={pendingTasks.filter((task) => task.type === "日常巡检").length} icon={CheckCircleOutlined} label="日常巡检" onClick={() => openFirstType("日常巡检")} />
          <FunctionButton count={pendingTasks.filter((task) => task.type === "预防维护").length} icon={ToolOutlined} label="预防维护" onClick={() => openFirstType("预防维护")} />
          <FunctionButton count={completedTasks.length} icon={HistoryOutlined} label="维护记录" onClick={showRecords} />
          <button disabled={!isFormalSession || readState.loading} onClick={refreshTasks} type="button"><ReloadOutlined /><strong>刷新任务</strong><span>{readState.loading ? "读取中" : isFormalSession ? "服务器" : "正式账号"}</span></button>
        </div>
      </section> : null}

      <nav className="mobile-role-bottom-nav" aria-label="现场机修手机导航">
        {MOBILE_VIEWS.map(([key, label, Icon]) => <button aria-current={view === key ? "page" : undefined} className={view === key ? "active" : ""} key={key} onClick={() => { setQueueMode("pending"); setView(key); }} type="button"><Icon /><span>{label}</span>{key === "pending" && pendingTasks.length ? <b>{pendingTasks.length}</b> : null}</button>)}
      </nav>
    </section>
  );
}

function FunctionButton({ count, icon: Icon, label, onClick }) {
  return <button disabled={!count} onClick={onClick} type="button"><Icon /><strong>{label}</strong><span>{count} 项</span></button>;
}

function normalizeTasks(value) {
  return (Array.isArray(value) ? value : []).map((item) => normalizeMaintenanceTask(item)).filter(Boolean);
}

function buildDraft(task) {
  return {
    finding: task?.finding ?? "",
    action: task?.actionTaken ?? "",
    status: TERMINAL_STATUSES.has(task?.status) ? task.status : "",
    photoFile: null,
  };
}

function validateDraft(task, draft) {
  if (!draft.finding?.trim() || draft.finding.trim().length < 2) return "请填写至少 2 个字的检查发现。";
  if (!draft.action?.trim() || draft.action.trim().length < 2) return "请填写至少 2 个字的采取措施。";
  if (!draft.status) return "请选择处理状态。";
  if (TERMINAL_STATUSES.has(draft.status) && !draft.photoFile && !(task.photoAttachmentIds ?? []).length) return "提交设备已恢复前，至少拍摄或选择一张设备照片。";
  return "";
}

function formatDue(task) {
  if (task?.due) return task.due;
  const timestamp = Date.parse(task?.dueAt ?? "");
  if (!Number.isFinite(timestamp)) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
}

function formatTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "完成时间已留痕";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
}

export { DEFAULT_TASKS as defaultMaintenanceTasks };
