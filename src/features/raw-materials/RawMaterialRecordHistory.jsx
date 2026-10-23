import {
  formatRawMaterialIssueRecord, formatRawMaterialSplitRecord, formatRawMaterialConsumptionRecord,
  formatRawMaterialLeftoverReturnRecord, formatRawMaterialLeftoverReviewRecord,
  formatRawMaterialCostAllocationDraft, formatRawMaterialCostAllocationConfirmation,
  formatRawMaterialCostLossCalibration, formatRawMaterialOrderMarginSnapshot, formatRawMaterialOrderMarginReport,
} from './rawMaterialInboundWorkflow.js';
import '../../styles/features/raw-material-record-history.css';

const GROUPS = [
  ['rawMaterialIssueRecords', '领料记录', formatRawMaterialIssueRecord, false, 4],
  ['rawMaterialSplitRecords', '拆卷记录', formatRawMaterialSplitRecord, false, 4],
  ['rawMaterialConsumptionRecords', '消耗确认', formatRawMaterialConsumptionRecord, false, 4],
  ['rawMaterialLeftoverReturnRecords', '余料退回', formatRawMaterialLeftoverReturnRecord, false, 4],
  ['rawMaterialLeftoverReviewRecords', '余料复核', formatRawMaterialLeftoverReviewRecord, false, 4],
  ['rawMaterialCostAllocationDrafts', '成本草稿', formatRawMaterialCostAllocationDraft, true, 4],
  ['rawMaterialCostAllocationConfirmations', '成本确认', formatRawMaterialCostAllocationConfirmation, true, 3],
  ['rawMaterialCostLossCalibrations', '损耗校准', formatRawMaterialCostLossCalibration, true, 3],
  ['rawMaterialOrderMarginSnapshots', '毛利快照', formatRawMaterialOrderMarginSnapshot, true, 3],
  ['rawMaterialOrderMarginReports', '毛利报表', formatRawMaterialOrderMarginReport, true, 3],
  ['rawMaterialCostAllocationWarnings', '成本草稿提示', value => String(value), false, 3],
];

export function RawMaterialRecordHistory({selected = {}, canViewCost = false, money}) {
  const groups = GROUPS.filter(([key]) => Array.isArray(selected[key]) && selected[key].length
    && (key !== 'rawMaterialCostAllocationWarnings' || canViewCost));
  if (!groups.length) return <p>暂无领料、消耗或成本记录。</p>;
  return <div className="raw-material-record-history" key={selected.id}>
    <p className="record-history-order">最近登记在前，可展开查看较早记录。</p>
    {groups.map(([key, title, format, financial, limit]) => {
      const records = [...selected[key]].reverse();
      const render = (record, index) => <li key={index}>{financial ? format(record, canViewCost, money) : format(record)}</li>;
      return <section key={key} aria-label={title}>
        <h4>{title}<span>共 {records.length} 条</span></h4>
        <ol>{records.slice(0, limit).map(render)}</ol>
        {records.length > limit ? <details>
          <summary>查看较早 {records.length - limit} 条{title}</summary>
          <ol start={limit + 1}>{records.slice(limit).map(render)}</ol>
        </details> : null}
      </section>;
    })}
  </div>;
}
