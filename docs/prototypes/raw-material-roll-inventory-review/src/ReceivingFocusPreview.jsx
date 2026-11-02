import { useMemo, useRef, useState } from "react";
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseOutlined, FileImageOutlined,
  FileTextOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined,
  SearchOutlined, WarningOutlined,
} from "@ant-design/icons";
import { initialRawMaterialInbounds } from "../../../../src/data/fixtures.js";
import { parseRawMaterialSpec } from "../../../../shared/rawMaterialSpec.js";
import { ColorChip } from "./FactoryColor.jsx";
import { SemanticTag } from "../../../../src/shared/ui/operational.jsx";
import { getOperationalStateTagValue } from "../../../../src/shared/labels.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import "./receiving-focus-preview.css";

const DEMO_IDS = ["RMI-0704-001", "RMI-0704-002", "RMI-0704-003"];
const clean = value => String(value ?? "").trim();
const numberText = value => Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
const weightText = value => Number(value) > 0 ? `${numberText(value)} kg` : "待称重";

// A self-contained design exercise. These copies never enter the API or fixtures.
function createDemoRecords() {
  return DEMO_IDS.map(id => {
    const source = initialRawMaterialInbounds.find(item => item.id === id);
    const parsed = parseRawMaterialSpec(source.specDisplay || source.spec);
    const rows = source.rolls.map((roll, index) => {
      const line = source.ocrLines?.find(item => item.lineId === roll.ocrLineId);
      const missingColourDemo = id === DEMO_IDS[0] && index === 1;
      return {
        id: roll.id,
        sequence: index + 1,
        supplierColor: missingColourDemo ? "" : clean(line?.values?.supplierColor || source.supplierColor),
        factoryColor: missingColourDemo ? "" : clean(roll.factoryColor || source.factoryColor),
        widthCm: Number(roll.widthCm || source.widthCm || parsed.widthCm) || 0,
        weightKg: Number(roll.weightKg) || 0,
        sourceText: line?.sourceText || "该历史示例未保留逐行识别文字。",
        sourceSupplierColor: clean(line?.values?.supplierColor || source.supplierColor),
        exception: "",
      };
    });
    return {
      id: source.id, supplierName: source.supplierName, receivedAt: source.receivedAt,
      deliveryNoteNo: source.deliveryNoteNo, materialType: source.materialType,
      productName: source.productName, spec: source.specDisplay || source.spec,
      totalWeightKg: source.totalWeightKg, amount: source.amount,
      status: source.status, unit: source.unit === "件" ? "件" : "卷",
      location: source.location, rows, history: [],
    };
  });
}

function recordStage(record) {
  if (record.rows.some(row => row.exception) || record.status.includes("异常")) return "异常";
  if (record.status === "已识别待复核") return "待核对";
  if (record.status.includes("待贴标")) return "待贴标";
  return "待打印";
}

function StageTag({ stage }) {
  const value = stage === "异常" ? "blocked" : stage === "待贴标" ? "已打印待贴标" : stage === "待核对" ? "已识别待复核" : "待打印";
  return <SemanticTag kind="state" label={stage} size="compact" value={getOperationalStateTagValue(value)} />;
}

function rowProblem(row) {
  if (row.exception) return `已标记异常：${row.exception}`;
  if (!clean(row.supplierColor) && !clean(row.factoryColor)) return "请补齐厂家票面色";
  if (!(Number(row.widthCm) > 0)) return "请补齐宽幅";
  if (!(Number(row.weightKg) > 0)) return "请填写实测重量";
  return "";
}

function ColourName({ row }) {
  const fullName = row.factoryColor
    ? `${row.factoryColor}（${row.supplierColor || "票面色待补"}）`
    : row.supplierColor || "颜色待补";
  return <span className="rf-colour" title={fullName}>
    <ColorChip color={row.factoryColor || row.supplierColor} />
    <span className={`rf-colour-text${!row.factoryColor && !row.supplierColor ? " rf-missing" : ""}`}>
      {row.factoryColor ? <>{row.factoryColor}<span className="rf-ticket-colour">（{row.supplierColor || "票面色待补"}）</span></>
        : row.supplierColor || "颜色待补"}
    </span>
  </span>;
}

export function ReceivingFocusPreview() {
  const [records, setRecords] = useState(createDemoRecords);
  const [selectedId, setSelectedId] = useState(DEMO_IDS[0]);
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editError, setEditError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const firstInput = useRef(null);
  const selected = records.find(record => record.id === selectedId);
  const isPending = selected?.status === "已识别待复核";
  const visibleRecords = useMemo(() => records.filter(record => {
    if (filter !== "全部" && recordStage(record) !== filter) return false;
    return `${record.supplierName} ${record.id} ${record.deliveryNoteNo}`.includes(query.trim());
  }), [records, filter, query]);
  const selectionVisible = visibleRecords.some(record => record.id === selectedId);
  const problems = selected?.rows.map(row => ({ row, message: rowProblem(row) })).filter(item => item.message) || [];
  const total = selected?.rows.reduce((sum, row) => sum + Number(row.weightKg || 0), 0) || 0;
  const weightMismatch = Boolean(selected?.totalWeightKg > 0 && Math.abs(total - selected.totalWeightKg) > 0.005);
  const canPreview = isPending && problems.length === 0 && !weightMismatch;
  const selectedStage = selected ? recordStage(selected) : "";

  function openRecord(id) {
    setSelectedId(id); setShowQueue(false); setNotice(""); setSourceOpen(false);
  }
  function resetDemo() {
    setRecords(createDemoRecords()); setSelectedId(DEMO_IDS[0]); setFilter("全部");
    setQuery(""); setDialog(null); setEdit(null); setNotice(""); setSourceOpen(false); setShowQueue(false);
  }
  function openEditor(row) {
    setEdit({ ...row, supplierColor: row.supplierColor, widthCm: String(row.widthCm || ""), weightKg: String(row.weightKg || "") });
    setEditError(""); setDialog("edit");
  }
  function saveEditor(event) {
    event.preventDefault();
    const supplierColor = clean(edit.supplierColor);
    const widthCm = Number(edit.widthCm);
    const weightKg = Number(edit.weightKg);
    if (!supplierColor) return setEditError("请按票面填写厂家颜色。");
    if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) {
      return setEditError("宽幅和公斤都需要填写大于 0 的实际数值。");
    }
    // A changed supplier label does not create or silently amend a factory mapping.
    const previous = selected.rows.find(row => row.id === edit.id);
    const factoryColor = previous.supplierColor === supplierColor ? previous.factoryColor : "";
    setRecords(current => current.map(record => record.id !== selectedId ? record : {
      ...record,
      rows: record.rows.map(row => row.id !== edit.id ? row : { ...row, supplierColor, factoryColor, widthCm, weightKg }),
      history: [...record.history, `第 ${edit.sequence} ${record.unit}信息已在本页修改。`],
    }));
    setNotice(`第 ${edit.sequence} ${selected.unit}已修改，仅保留在本页。`);
    setDialog(null); setEdit(null);
  }
  function markException(event) {
    event.preventDefault();
    const reason = clean(edit?.exception);
    if (!reason) return setEditError("请写明需要核实的问题。");
    setRecords(current => current.map(record => record.id !== selectedId ? record : {
      ...record,
      rows: record.rows.map(row => row.id !== edit.id ? row : { ...row, exception: reason }),
      history: [...record.history, `第 ${edit.sequence} ${record.unit}标记异常：${reason}（本页演示）。`],
    }));
    setNotice("异常已标记，处理完成前不能确认核对。仅为本页演示。"); setDialog(null); setEdit(null);
  }
  function clearException(row) {
    setRecords(current => current.map(record => record.id !== selectedId ? record : {
      ...record, rows: record.rows.map(item => item.id === row.id ? { ...item, exception: "" } : item),
      history: [...record.history, `第 ${row.sequence} ${record.unit}异常标记已在本页撤销。`],
    }));
    setNotice("已撤销本页异常标记，原有信息仍保留。");
  }
  function selectFilter(value) {
    setFilter(value);
    const match = records.find(record => value === "全部" || recordStage(record) === value);
    if (match) openRecord(match.id);
  }

  return <div className={`receiving-focus-preview${showQueue ? " rf-show-queue" : ""}`}>
    <div className="rf-design-note"><span>界面试稿 · 示例演示，修改仅保留在本页</span><button className="rf-text-button" onClick={resetDemo} type="button"><ReloadOutlined />重置演示</button></div>
    <header className="rf-page-heading"><div><h1>收货录入</h1></div><button className="rf-primary" onClick={() => setDialog("capture")} type="button"><PlusOutlined />录入送货/退货单</button></header>
    <div className="rf-layout">
      <section aria-label="收货单据队列" className="rf-queue">
        <header className="rf-queue-heading"><h2>待办单据</h2><span>{records.length} 张示例</span></header>
        <div aria-label="筛选单据状态" className="rf-tabs" role="tablist">{["全部", "待核对", "待贴标", "异常"].map(value => <button aria-selected={filter === value} className={filter === value ? "rf-tab-active" : ""} key={value} onClick={() => selectFilter(value)} role="tab" type="button">{value}<span>{value === "全部" ? records.length : records.filter(record => recordStage(record) === value).length}</span></button>)}</div>
        <label className="rf-search"><SearchOutlined /><input aria-label="搜索送货单位或单号" onChange={event => setQuery(event.target.value)} placeholder="搜索送货单位 / 单号" value={query} /></label>
        <div className="rf-receipt-list">
          {visibleRecords.length ? visibleRecords.map(record => {
            const stage = recordStage(record);
            return <button aria-pressed={record.id === selectedId} className={`rf-receipt${record.id === selectedId ? " rf-selected" : ""}`} key={record.id} onClick={() => openRecord(record.id)} type="button">
              <span className="rf-receipt-main"><strong>{record.supplierName}</strong><StageTag stage={stage} /></span>
              <span className="rf-receipt-id">{record.deliveryNoteNo || record.id}</span>
              <span className="rf-receipt-bottom"><span>{record.rows.length} {record.unit}<i>·</i>{weightText(record.totalWeightKg)}</span><time>{record.receivedAt.slice(5)}</time></span>
              {record.id === DEMO_IDS[0] && record.rows.some(row => !row.supplierColor && !row.factoryColor) ? <span className="rf-receipt-warning"><WarningOutlined />第 2 卷颜色待补</span> : null}
            </button>;
          }) : <div className="rf-empty"><SearchOutlined /><strong>没有找到这张单</strong><p>换个单号或送货单位试试。</p><button className="rf-text-button" onClick={() => { setQuery(""); setFilter("全部"); }} type="button">清除筛选</button></div>}
        </div>
        <footer className="rf-queue-foot">示例沿用历史单据，日期与数量保持原样。</footer>
      </section>

      <section aria-label="选中单据逐卷核对" className="rf-detail">
        {selectionVisible ? <>
        <div className="rf-detail-scroll">
          <button className="rf-back-button" onClick={() => setShowQueue(true)} type="button"><ArrowLeftOutlined />单据列表<span>{selected?.supplierName}</span></button>
          <header className="rf-detail-heading"><div><span className="rf-eyebrow">本单信息</span><h2>{selected.supplierName}</h2></div><StageTag stage={selectedStage} /></header>
          <dl className="rf-facts"><div><dt>供应商单号</dt><dd>{selected.deliveryNoteNo || "未提供"}</dd></div><div><dt>收货时间</dt><dd>{selected.receivedAt}</dd></div><div><dt>ERP 入库单</dt><dd>{selected.id}</dd></div><div><dt>本单汇总</dt><dd><strong>{selected.rows.length} {selected.unit}</strong><span> / {weightText(selected.totalWeightKg)}</span></dd></div></dl>
          <div className="rf-source-strip"><span className="rf-source-icon"><FileImageOutlined /></span><div><strong>原单照片与识别明细</strong><span>该示例未附原图</span></div><button aria-expanded={sourceOpen} className="rf-text-button" onClick={() => setSourceOpen(!sourceOpen)} type="button">{sourceOpen ? "收起明细" : "查看识别明细"}</button></div>
          {sourceOpen ? <section aria-label="原始识别明细" className="rf-source-details"><dl><div><dt>原料</dt><dd>{selected.productName}</dd></div><div><dt>票面规格</dt><dd>{selected.spec}</dd></div><div><dt>声明金额</dt><dd>¥ {numberText(selected.amount)}</dd></div></dl><ol>{selected.rows.map(row => <li key={row.id}><span>第 {row.sequence} {selected.unit}</span>{row.sourceText}</li>)}</ol><p>原始文字只供对照，修改请在下面对应的卷料行完成。</p></section> : null}

          <section aria-labelledby="rf-roll-heading" className="rf-roll-section">
            <header className="rf-section-heading"><h3 id="rf-roll-heading">逐卷核对</h3><span>颜色 · 宽幅 · 公斤</span></header>
            {selected.id === DEMO_IDS[0] ? <div className={`rf-review-note${problems.length ? " rf-review-note-warning" : ""}`}><span>{problems.length ? <WarningOutlined /> : <CheckCircleOutlined />}</span><p>{problems.length ? (problems[0].row.sequence === 2 && !problems[0].row.supplierColor && !problems[0].row.factoryColor ? "本页演示第 2 卷缺色，点该行「补颜色」试试。" : `第 ${problems[0].row.sequence} ${selected.unit}：${problems[0].message}`) : "本页缺项已补齐，请逐卷对照原单和实物。"}</p></div> : null}
            <div className="rf-roll-table" role="table" aria-label="逐卷颜色宽幅公斤核对表"><div className="rf-roll-head" role="row"><span role="columnheader">卷 / 件</span><span role="columnheader">颜色</span><span role="columnheader">宽幅</span><span role="columnheader">公斤</span><span role="columnheader">核对操作</span></div>
              {selected.rows.map(row => <div className={`rf-roll-wrap${rowProblem(row) ? " rf-roll-needs-review" : ""}`} key={row.id}><div className="rf-roll-row" role="row"><strong role="cell" className="rf-roll-number">第 {row.sequence} {selected.unit}</strong><span role="cell"><ColourName row={row} /></span><span role="cell" className="rf-number">{row.widthCm ? <>{numberText(row.widthCm)}<small> cm</small></> : "待确认"}</span><span role="cell" className="rf-number">{row.weightKg ? <>{numberText(row.weightKg)}<small> kg</small></> : "待称重"}</span><span role="cell" className="rf-row-actions">{isPending ? <button className="rf-text-button" onClick={() => openEditor(row)} type="button">{!row.supplierColor && !row.factoryColor ? "补颜色" : "修改"}</button> : <span className="rf-row-readonly">历史示例</span>}</span></div>{row.exception ? <div className="rf-row-exception"><WarningOutlined /><span>{row.exception}</span><button className="rf-text-button" onClick={() => clearException(row)} type="button">撤销标记</button></div> : null}</div>)}
            </div>
            <div className={`rf-roll-total${weightMismatch ? " rf-total-mismatch" : ""}`}><span>合计 {selected.rows.length} {selected.unit}</span><strong>{weightText(total)}</strong><span>{weightMismatch ? `与声明 ${weightText(selected.totalWeightKg)} 不一致` : selected.totalWeightKg > 0 ? "与本单总重量一致" : "真实重量待补齐"}</span></div>
          </section>
          {notice ? <p className="rf-notice" role="status"><CheckCircleOutlined />{notice}</p> : null}
          <details className="rf-history"><summary>操作记录<span>{selected.history.length ? `${selected.history.length} 条本页记录` : ""}</span></summary>{selected.history.length ? <ol>{selected.history.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol> : <p>本页尚未修改示例。正式单据的原图与历史记录仍由原系统保留。</p>}</details>
        </div>
        <footer className="rf-action-dock"><div className="rf-action-summary">{isPending ? <><strong>{problems.length ? `还有 ${problems.length} ${selected.unit}需要核实` : weightMismatch ? "请核实总重量差异" : "可以继续核对确认"}</strong><span>{problems.length ? problems[0].message : weightMismatch ? "逐卷重量与声明重量一致后才能继续。" : "确认后查看示意，不发送打印或入库指令。"}</span></> : <><strong>{selected.status}</strong><span>此历史示例仅供查看，当前改版演示聚焦待核对单据。</span></>}</div><div className="rf-action-buttons">{isPending ? <><button className="rf-secondary" onClick={() => { setEdit({ ...selected.rows[0], exception: "" }); setEditError(""); setDialog("exception"); }} type="button">标记异常</button><button className="rf-primary" disabled={!canPreview} onClick={() => { if (canPreview) setDialog("print"); }} type="button"><PrinterOutlined />确认核对，查看打印预览</button></> : <button className="rf-secondary" onClick={() => { setFilter("全部"); openRecord(DEMO_IDS[0]); }} type="button">返回待核对示例</button>}</div></footer>
        </> : <div className="rf-empty rf-detail-empty"><FileTextOutlined /><strong>{visibleRecords.length ? "选择一张单据开始核对" : "当前筛选下没有单据"}</strong><p>{visibleRecords.length ? "点击左侧单据查看明细。" : "清除筛选后继续，本页修改仍然保留。"}</p><button className="rf-text-button" onClick={() => { setQuery(""); setFilter("全部"); setShowQueue(true); }} type="button">查看单据列表</button></div>}
      </section>
    </div>

    {dialog ? <ReviewDialog className="rf-dialog" labelledBy="rf-dialog-title" onClose={() => { setDialog(null); setEdit(null); }}><header className="rf-dialog-heading"><h2 id="rf-dialog-title">{dialog === "edit" ? `修改第 ${edit.sequence} ${selected.unit}` : dialog === "exception" ? "标记待核实问题" : dialog === "print" ? "核对结果 · 打印示意" : "录入送货 / 原料退货单"}</h2><button aria-label="关闭演示弹窗" className="rf-icon-button" onClick={() => { setDialog(null); setEdit(null); }} type="button"><CloseOutlined /></button></header>
      {dialog === "edit" ? <form onSubmit={saveEditor}><div className="rf-dialog-body"><p className="rf-dialog-context">{selected.supplierName} · 第 {edit.sequence} {selected.unit}</p><label className="rf-field">厂家票面色<input autoFocus maxLength={50} onChange={event => setEdit(current => ({ ...current, supplierColor: event.target.value }))} placeholder="按票面填写，例如大红" ref={firstInput} value={edit.supplierColor} /></label><p className="rf-field-help">原识别文字：{edit.sourceText}</p><div className="rf-field-grid"><label className="rf-field">宽幅（cm）<input inputMode="decimal" min="0.001" onChange={event => setEdit(current => ({ ...current, widthCm: event.target.value }))} step="0.001" type="number" value={edit.widthCm} /></label><label className="rf-field">重量（kg）<input inputMode="decimal" min="0.001" onChange={event => setEdit(current => ({ ...current, weightKg: event.target.value }))} step="0.001" type="number" value={edit.weightKg} /></label></div><p className="rf-field-help">只改本页票面值；不会新建厂内颜色或修改厂家映射。</p>{editError ? <p className="rf-error" role="alert">{editError}</p> : null}</div><footer className="rf-dialog-footer"><button className="rf-secondary" onClick={() => { setDialog(null); setEdit(null); }} type="button">取消</button><button className="rf-primary" type="submit">保存本页修改</button></footer></form> : null}
      {dialog === "exception" ? <form onSubmit={markException}><div className="rf-dialog-body"><label className="rf-field">需要核实的卷料<select onChange={event => { const row = selected.rows.find(item => item.id === event.target.value); setEdit({ ...row, exception: edit.exception }); }} value={edit.id}>{selected.rows.map(row => <option key={row.id} value={row.id}>第 {row.sequence} {selected.unit} · {weightText(row.weightKg)}</option>)}</select></label><label className="rf-field">问题说明<textarea autoFocus onChange={event => setEdit(current => ({ ...current, exception: event.target.value }))} placeholder="例如：票面公斤与实物标签不一致" rows={3} value={edit.exception} /></label>{editError ? <p className="rf-error" role="alert">{editError}</p> : null}</div><footer className="rf-dialog-footer"><button className="rf-secondary" onClick={() => { setDialog(null); setEdit(null); }} type="button">取消</button><button className="rf-primary" type="submit">标记本页异常</button></footer></form> : null}
      {dialog === "print" ? <><div className="rf-dialog-body"><p className="rf-preview-disclaimer">仅展示核对结果，不生成正式卷标、不发送打印。</p><div className="rf-print-summary"><CheckCircleOutlined /><div><strong>{selected.rows.length} {selected.unit}信息已在本页核对</strong><span>{selected.supplierName} · {weightText(total)}</span></div></div><div className="rf-print-rows">{selected.rows.map(row => <div key={row.id}><strong>第 {row.sequence} {selected.unit}</strong><ColourName row={row} /><span>{numberText(row.widthCm)} cm · {weightText(row.weightKg)}</span></div>)}</div><p className="rf-field-help">正式接入时继续使用现有 76 × 130 mm 卷标与打印、贴标校验。</p></div><footer className="rf-dialog-footer"><button className="rf-primary" onClick={() => setDialog(null)} type="button">返回核对页</button></footer></> : null}
      {dialog === "capture" ? <><div className="rf-dialog-body"><p className="rf-preview-disclaimer">本轮评审核对布局；此入口不拍照、不上传文件。</p><div className="rf-capture-types"><span>送货单</span><span>原料退货单</span></div><div className="rf-capture-options"><div><FileImageOutlined /><strong>摄像头 / 高拍仪</strong></div><div><FileTextOutlined /><strong>照片 / PDF</strong></div></div><p>正式接入时继续复用现有多页预览与识别流程，同一张单最多 4 页，全部添加后再识别。</p></div><footer className="rf-dialog-footer"><button className="rf-primary" onClick={() => setDialog(null)} type="button">继续看核对效果</button></footer></> : null}
    </ReviewDialog> : null}
  </div>;
}
