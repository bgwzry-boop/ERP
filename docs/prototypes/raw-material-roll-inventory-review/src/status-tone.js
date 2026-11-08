// 2026-11-08：状态颜色统一为四级 + 中性，避免"黄色同时表示四件事"。
// 级别含义见 STATUS_TONE_TABLE，页面只按 tone 取色，不再按状态文字逐个写 class。
export const STATUS_TONE_TABLE = Object.freeze([
  // 阻塞：必须有人处理，否则流程走不下去
  ["缺货待处理", "blocked"], ["缺货", "blocked"], ["库存不足", "blocked"],
  ["数量差异", "blocked"], ["数量不符", "blocked"], ["异常", "blocked"],
  ["送货异常", "blocked"], ["疑似重复", "blocked"], ["读取失败", "blocked"],
  ["冻结", "blocked"], ["未就绪", "blocked"],
  // 待办：轮到某人做
  ["待出库", "todo"], ["待贴标", "todo"], ["待核对", "todo"], ["待确认", "todo"],
  ["待打印标签", "todo"], ["待确认拉走", "todo"], ["待打包", "todo"], ["待排产", "todo"],
  ["待补印", "todo"], ["待收款确认", "todo"], ["收款待确认", "todo"], ["本期待对账", "todo"], ["待核实", "todo"],
  ["有欠款/差异", "todo"], ["待对账", "todo"], ["待收款", "todo"], ["待发货/待自提", "todo"], ["机台待确认", "todo"], ["待打印卷标", "todo"], ["余料待复核", "todo"],
  ["待逐卷核对", "todo"], ["待处理差异", "todo"],
  // 进行中：正在做，不用催
  ["生产中", "doing"], ["丝印中", "doing"], ["制袋中", "doing"], ["印刷中", "doing"],
  ["配送中", "doing"], ["运输中", "doing"], ["已备货", "doing"], ["机边领用", "doing"],
  // 完成：已结束
  ["已交付", "done"], ["已结清", "done"], ["已确认对账", "done"], ["可用", "done"],
  ["正常", "done"], ["已完成", "done"], ["已付款", "done"], ["已结算", "done"], ["已清点", "done"],
  // 其他：不做催促，也不代表完成
  ["停用", "neutral"], ["已取消", "neutral"], ["已作废", "neutral"], ["草稿", "neutral"],
]);

const TABLE = new Map(STATUS_TONE_TABLE);

export function statusTone(text) {
  const value = String(text ?? "").trim();
  if (!value) return "neutral";
  if (TABLE.has(value)) return TABLE.get(value);
  // 兜底：不在表里的按关键词推断，仍拿不准就是中性（不误报成"阻塞"）
  if (/异常|差异|不符|缺货|不足|失败|冻结|阻塞|重复/.test(value)) return "blocked";
  if (/待|等待|待处理|未开始/.test(value)) return "todo";
  if (/中$|进行中|已备货|领用/.test(value)) return "doing";
  if (/已[交付结算清确认]|完成|正常|可用/.test(value)) return "done";
  return "neutral";
}

export const STATUS_TONE_LABEL = Object.freeze({ blocked: "要处理", todo: "待办", doing: "进行中", done: "完成", neutral: "其他" });
