import { useMemo, useState } from "react";
import {
  AccountBookOutlined,
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  SyncOutlined,
  UnorderedListOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";

const pages = [
  { key: "todos", label: "公共待办", icon: DashboardOutlined },
  { key: "entry", label: "订单录入", icon: PlusOutlined },
  { key: "orders", label: "订单池", icon: ShoppingCartOutlined },
  { key: "inventory", label: "库存查询", icon: DatabaseOutlined },
  { key: "fulfillment", label: "出库交付", icon: InboxOutlined },
  { key: "statements", label: "对账收款", icon: AccountBookOutlined },
];

const laterPages = [
  { label: "排产", icon: AppstoreOutlined },
  { label: "打包/标签", icon: UnorderedListOutlined },
  { label: "客户", icon: UserOutlined },
  { label: "价格表", icon: SettingOutlined },
  { label: "车间手机端", icon: AppstoreOutlined },
  { label: "司机端", icon: CheckCircleOutlined },
];

const customers = [
  customer("C001", "张三服饰", "7天一结", "张三", "138****1234", "虎门镇人民路 8 号", 18650, 2400, "06-26", ["自提多", "常用30*38"]),
  customer("C002", "李四电商", "15天一结", "李四", "139****6221", "厚街仓库 A 区", 32860, 8800, "06-20", ["送货", "欠款关注"]),
  customer("C003", "王五包装", "现结", "王五", "136****7709", "本村市场南门", 0, 0, "06-28", ["现场付款"]),
  customer("C004", "美的空调网店", "月结", "陈会计", "137****5510", "广州白云快运点", 51200, 12600, "06-01", ["快运", "定制多"]),
  customer("C005", "小熊童装", "5天一结", "赵姐", "135****9901", "虎门服装城", 8700, 0, "06-25", ["加长提"]),
  customer("C006", "喜铺礼品", "现结", "刘先生", "132****4468", "长安镇", 1260, 0, "06-28", ["印刷通货"]),
  customer("C007", "福袋批发", "7天一结", "周会计", "188****2034", "本村北口", 11340, 1200, "06-23", ["印刷通货"]),
  customer("C008", "同行加工A", "15天一结", "林厂", "189****7300", "隔壁村工业区", 9200, 0, "06-24", ["外加工"]),
  customer("C009", "红叶电商", "现结", "叶小姐", "131****8234", "沙田快递站", 540, 0, "06-28", ["小单"]),
  customer("C010", "黑马服装", "月结", "马老板", "150****5532", "虎门大道 36 号", 27600, 5300, "06-12", ["送货", "大客户"]),
  customer("C011", "白鲸自营店", "7天一结", "店铺客服", "177****1160", "自营店仓", 4420, 0, "06-27", ["自营网店"]),
  customer("C012", "宏尚布业", "现结", "张师傅", "139****4088", "河北到货自提", 0, 0, "06-29", ["原料供应"]),
];

function customer(id, name, cycle, contact, phone, address, receivable, debt, lastStatement, tags) {
  return { id, name, cycle, contact, phone, address, receivable, debt, lastStatement, tags };
}

const orderLines = [
  line("ORD-0629-001", "01", "C001", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 500, "现货有货", "待出库", "自提", "今天 15:00", 180, [], "有货"),
  line("ORD-0629-001", "02", "C001", "空白袋", "30*38*10", "黑色", "普通提", "空白袋", "否", 100, "现货缺货", "缺货待处理", "自提", "今天 15:00", 36, ["库存不足"], "缺货"),
  line("ORD-0629-002", "01", "C002", "服装店白袋", "25*32*10", "白色", "加长提", "空白袋", "否", 1200, "现货有货", "已备货", "送货", "今天 16:30", 408, [], "已占用"),
  line("ORD-0629-003", "01", "C004", "美的空调", "30*38*10", "白色", "普通提", "空白袋", "是", 1000, "定制印刷", "制袋中", "快递快运", "明天 18:00", 480, ["待打印标签"], "生产中"),
  line("ORD-0629-004", "01", "C005", "小熊袋", "25*23*8", "红色", "普通提", "小熊袋", "是", 800, "印刷通货", "待出库", "自提", "今天 17:00", 376, [], "有货"),
  line("ORD-0629-005", "01", "C006", "喜字袋", "30*37*10", "红色", "普通提", "喜", "是", 300, "印刷通货", "已交付", "自提", "昨天 11:00", 174, [], "已完成"),
  line("ORD-0629-006", "01", "C007", "福字袋", "35*41*12", "红色", "普通提", "福", "是", 500, "印刷通货", "待对账", "送货", "今天 14:00", 390, [], "已交付"),
  line("ORD-0629-007", "01", "C008", "同行来料印刷", "40*32*10", "牛仔蓝", "普通提", "外加工", "是", 2600, "外加工印刷", "丝印中", "送货", "明天 10:00", 234, [], "不入库存"),
  line("ORD-0629-008", "01", "C009", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 50, "现货有货", "待收款确认", "自提", "今天 12:00", 18, ["现场现结"], "已交付"),
  line("ORD-0629-009", "01", "C010", "黑马服装", "40*32*10", "黑色", "加长提", "空白袋", "是", 2000, "定制印刷", "待打包", "送货", "明天 17:00", 980, ["数量差异"], "生产完成"),
  line("ORD-0629-010", "01", "C011", "白鲸活动袋", "35*27*10", "白色", "普通提", "空白袋", "是", 1500, "定制印刷", "待快运拉走", "快递快运", "今天 19:00", 600, ["待确认拉走"], "待提货锁定"),
  line("ORD-0629-011", "01", "C003", "空白袋", "40*30*10", "蓝色", "普通提", "空白袋", "否", 600, "现货有货", "已交付", "送货", "今天 10:30", 228, [], "已完成"),
  line("ORD-0629-012", "01", "C002", "空白袋", "30*36*8", "绿色", "普通提", "空白袋", "否", 700, "现货缺货", "缺货待处理", "送货", "明天 12:00", 245, ["库存不足"], "缺货"),
  line("ORD-0629-013", "01", "C004", "美的空调", "30*38*10", "红色", "普通提", "空白袋", "是", 1005, "定制印刷", "数量差异待处理", "快递快运", "今天 18:30", 480, ["多 5 个赠送"], "待处理"),
  line("ORD-0629-014", "01", "C005", "加长提空白", "30*38*10", "米白", "加长提", "空白袋", "否", 900, "现货有货", "待出库", "自提", "明天 09:30", 351, [], "有货"),
  line("ORD-0629-015", "01", "C001", "空白袋", "25*32*10", "红色", "普通提", "空白袋", "否", 300, "现货有货", "待对账", "自提", "昨天 16:00", 93, [], "已交付"),
  line("ORD-0629-016", "01", "C010", "黑马二批", "45*37*10", "黑色", "普通提", "空白袋", "是", 1800, "定制印刷", "待排产", "送货", "后天 18:00", 990, [], "未生产"),
  line("ORD-0629-017", "01", "C011", "自营补单", "30*38*10", "红色", "普通提", "空白袋", "是", 980, "定制印刷", "待补印", "快递快运", "明天 16:00", 468, ["少发补印"], "待处理"),
  line("ORD-0629-018", "01", "C006", "喜字袋", "25*30*10", "红色", "普通提", "喜", "是", 200, "印刷通货", "待出库", "自提", "今天 18:00", 106, [], "有货"),
  line("ORD-0629-019", "01", "C007", "福字袋", "30*37*10", "红色", "普通提", "福", "是", 400, "印刷通货", "待对账", "送货", "昨天 18:30", 232, [], "已交付"),
  line("ORD-0629-020", "01", "C012", "原料入库演示", "78*90*1500", "大红", "布料", "原材料", "否", 2, "原材料", "资料占位", "其他", "后续", 0, [], "占位"),
  line("ORD-0629-021", "01", "C003", "空白袋", "50*40*12", "白色", "普通提", "空白袋", "否", 200, "现货缺货", "缺货待处理", "自提", "明天 11:30", 124, ["建议排产"], "缺货"),
  line("ORD-0629-022", "01", "C002", "外卖活动袋", "40*30*10", "黄色", "普通提", "空白袋", "是", 3000, "定制印刷", "丝印中", "送货", "明天 19:00", 1380, [], "生产中"),
  line("ORD-0629-023", "01", "C004", "空白袋", "35*41*12", "白色", "普通提", "空白袋", "否", 600, "现货有货", "待出库", "快递快运", "今天 17:40", 300, ["待打印标签"], "已占用"),
  line("ORD-0629-024", "01", "C009", "空白袋", "25*32*10", "蓝色", "普通提", "空白袋", "否", 100, "现货有货", "已交付", "自提", "今天 09:10", 31, [], "已完成"),
  line("ORD-0629-025", "01", "C001", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 700, "现货有货", "待出库", "送货", "今天 16:00", 252, [], "有货"),
  line("ORD-0629-026", "01", "C005", "服装长提", "40*32*10", "粉色", "加长提", "空白袋", "否", 1000, "现货有货", "待备货", "自提", "明天 14:00", 420, [], "有货"),
  line("ORD-0629-027", "01", "C008", "同行来料蓝印", "35*27*10", "浅蓝", "普通提", "外加工", "是", 1800, "外加工印刷", "待交付", "自提", "今天 17:20", 162, [], "服务单"),
  line("ORD-0629-028", "01", "C010", "黑马三批", "40*32*10", "黑色", "加长提", "空白袋", "是", 1000, "定制印刷", "待对账", "送货", "昨天 13:00", 520, [], "已交付"),
  line("ORD-0629-029", "01", "C011", "白鲸小单", "30*38*10", "红色", "普通提", "空白袋", "否", 120, "现货有货", "待收款确认", "快递快运", "今天 18:20", 43.2, ["收款截图"], "已交付"),
  line("ORD-0629-030", "01", "C006", "喜字袋", "35*41*12", "红色", "普通提", "喜", "是", 100, "印刷通货", "待出库", "自提", "明天 10:00", 78, [], "有货"),
];

function line(orderNo, lineNo, customerId, product, size, color, handle, style, print, qty, orderType, status, fulfillment, latest, amount, exceptions, inventory) {
  return { id: `${orderNo}-${lineNo}`, orderNo, lineNo, customerId, product, size, color, handle, style, print, qty, orderType, status, fulfillment, latest, amount, exceptions, inventory };
}

const inventories = [
  stock("30*38*10", "红色", "普通提", "空白袋", "A区-30*38", "仓库已清点", 2480, 1320, 120, 0, false),
  stock("30*38*10", "黑色", "普通提", "空白袋", "A区-30*38", "仓库已清点", 80, 40, 0, 0, false),
  stock("25*32*10", "白色", "加长提", "空白袋", "B区-服装", "仓库已清点", 2100, 1200, 0, 0, false),
  stock("25*32*10", "红色", "普通提", "空白袋", "A区-25*32", "车间报数/散装", 650, 300, 0, 0, true),
  stock("30*38*10", "白色", "普通提", "空白袋", "待快运区", "待提货锁定", 1005, 0, 1005, 0, false),
  stock("25*23*8", "红色", "普通提", "小熊袋", "印刷通货区", "仓库已清点", 1100, 800, 0, 0, false),
  stock("30*37*10", "红色", "普通提", "喜", "印刷通货区", "仓库已清点", 900, 600, 0, 0, false),
  stock("35*41*12", "红色", "普通提", "福", "印刷通货区", "仓库已清点", 500, 500, 0, 0, false),
  stock("40*32*10", "黑色", "加长提", "空白袋", "B区-服装", "仓库已清点", 1600, 1000, 0, 0, false),
  stock("30*36*8", "绿色", "普通提", "空白袋", "A区-30*36", "估算/待复核", 180, 0, 0, 0, true),
  stock("50*40*12", "白色", "普通提", "空白袋", "C区-大号", "仓库已清点", 0, 0, 0, 0, false),
  stock("35*41*12", "白色", "普通提", "空白袋", "C区-大号", "仓库已清点", 720, 600, 0, 0, false),
  stock("40*30*10", "蓝色", "普通提", "空白袋", "B区-横款", "仓库已清点", 950, 600, 0, 0, false),
  stock("35*27*10", "白色", "普通提", "空白袋", "B区-横款", "待处理/报废", 0, 0, 0, 260, false),
];

function stock(size, color, handle, style, zone, state, inStock, reserved, locked, pending, estimated) {
  return { id: `${size}-${color}-${handle}-${style}-${zone}`, size, color, handle, style, zone, state, inStock, reserved, locked, pending, estimated };
}

const initialTodos = [
  todo("T001", "订单草稿待确认", "C001", "ORD-0629-001", "30*38 红500、黑100，黑色库存不足需确认", "12分钟", "今天 15:00", "急", "库存影响"),
  todo("T002", "缺货待处理", "C002", "ORD-0629-012", "30*36*8 绿色 700 个缺货，建议生成补货建议", "38分钟", "明天 12:00", "异常", "可能影响送货"),
  todo("T003", "数量差异待处理", "C004", "ORD-0629-013", "实际打包 1005 个，计费 1000，需标记赠送", "28分钟", "今天 18:30", "异常", "影响对账"),
  todo("T004", "待打印标签", "C011", "ORD-0629-010", "快运 3 包，打包工已提交包裹明细", "46分钟", "今天 19:00", "今天", "快运可能傍晚拉走"),
  todo("T005", "快递/快运待确认拉走", "C004", "ORD-0629-023", "昨晚待快运区 2 包，需要确认是否已拉走", "2小时", "今天", "今天", "影响对账日期"),
  todo("T006", "待生成对账", "C007", "ORD-0629-019", "福字袋 400 个已送货，进入本期待对账", "1天", "本期", "普通", "应收 232"),
  todo("T007", "收款差额待确认", "C002", "ST-0629-002", "应收 108000，客户实付 80000，差额需处理", "20分钟", "本期", "异常", "形成欠款"),
  todo("T008", "老板/管理待查看", "C010", "ORD-0629-028", "月结客户欠款超过阈值，接单不阻塞但需查看", "3小时", "本周", "关注", "欠款 5300"),
];

function todo(id, type, customerId, ref, summary, wait, latest, urgency, impact) {
  return { id, type, customerId, ref, summary, wait, latest, urgency, impact, handled: false };
}

const initialFulfillments = [
  fulfill("F001", "自提", "C001", "ORD-0629-001-01", "30*38 红色空白袋", 500, "1件散装", "待出库", "今天 15:00", "A区-30*38", "仓库已清点"),
  fulfill("F002", "送货", "C002", "ORD-0629-002-01", "25*32 白色加长提", 1200, "3包", "已备货", "今天 16:30", "B区-服装", "仓库已清点"),
  fulfill("F003", "快递快运", "C011", "ORD-0629-010-01", "白鲸活动袋 35*27 白印", 1500, "3包", "待打印标签", "今天 19:00", "待快运区", "待提货锁定"),
  fulfill("F004", "快递快运", "C004", "ORD-0629-023-01", "35*41 白色空白袋", 600, "2包", "待确认拉走", "今天", "待快运区", "待提货锁定"),
  fulfill("F005", "自提", "C005", "ORD-0629-004-01", "25*23 红色小熊袋", 800, "2包", "待出库", "今天 17:00", "印刷通货区", "仓库已清点"),
  fulfill("F006", "送货", "C010", "ORD-0629-009-01", "40*32 黑色加长提 黑印", 2000, "4包", "数量不符", "明天 17:00", "打包区", "打包清点库存"),
  fulfill("F007", "自提", "C009", "ORD-0629-008-01", "30*38 红色空白袋", 50, "1件散装", "已交付", "今天 12:00", "A区-30*38", "仓库已清点"),
];

function fulfill(id, method, customerId, lineId, goods, qty, packages, status, latest, zone, source) {
  return { id, method, customerId, lineId, goods, qty, packages, status, latest, zone, source, printed: status === "已交付" };
}

const statements = [
  statement("ST-0629-001", "C001", "待生成", 273, 0, 0, "06-22 至 06-29", ["ORD-0629-015-01", "ORD-0629-001-01"]),
  statement("ST-0629-002", "C002", "差额待确认", 108000, 80000, 28000, "06-15 至 06-29", ["ORD-0629-002-01", "ORD-0629-011-01", "ORD-0629-022-01"]),
  statement("ST-0629-003", "C004", "待发送", 1480, 0, 0, "06-01 至 06-29", ["ORD-0629-003-01", "ORD-0629-013-01", "ORD-0629-023-01"]),
  statement("ST-0629-004", "C007", "待生成", 622, 0, 0, "06-22 至 06-29", ["ORD-0629-006-01", "ORD-0629-019-01"]),
  statement("ST-0629-005", "C010", "有欠款", 1510, 0, 5300, "06-01 至 06-29", ["ORD-0629-028-01"]),
  statement("ST-0629-006", "C011", "收款待确认", 643.2, 43.2, 0, "06-22 至 06-29", ["ORD-0629-010-01", "ORD-0629-029-01"]),
];

function statement(id, customerId, status, receivable, received, variance, period, lineIds) {
  return { id, customerId, status, receivable, received, variance, period, lineIds, sent: status !== "待生成" };
}

const sampleText = "张三服饰，30*38红500个明天下午自提，30*38黑100个；美的空调 30*38 白袋 黄印 双面 1000个 周五快运；小熊童装 25*32 白色加长提 1200个送货";

const money = (value) => `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 1 : 0, maximumFractionDigits: 1 })}`;

function getCustomer(id) {
  return customers.find((item) => item.id === id) ?? customers[0];
}

function getOrderLine(id) {
  return orderLines.find((item) => item.id === id);
}

function statusTone(status) {
  if (status.includes("缺货") || status.includes("异常") || status.includes("差异") || status.includes("不足")) return "danger";
  if (status.includes("待") || status.includes("确认") || status.includes("备货") || status.includes("打印")) return "warning";
  if (status.includes("已") || status.includes("有货")) return "success";
  return "neutral";
}

function parseOrderText(text) {
  const normalized = text || sampleText;
  const customerName = customers.find((item) => normalized.includes(item.name.slice(0, 2)))?.name ?? "待确认客户";
  const chunks = normalized
    .replace(/\s+/g, " ")
    .split(/[；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const rows = [];
  chunks.forEach((chunk, index) => {
    const size = chunk.match(/(\d{2})\s*[*xX×]\s*(\d{2})(?:\s*[*xX×]\s*(\d{1,2}))?/);
    const qtyMatches = [...chunk.matchAll(/(红|黑|白|蓝|绿|黄|粉|米白|浅蓝)?色?\s*(\d{2,5})\s*个/g)];
    const colorHint = chunk.match(/红|黑|白|蓝|绿|黄|粉|米白|浅蓝/)?.[0] ?? "待确认";
    const product = chunk.includes("小熊") ? "小熊袋" : chunk.includes("美的") ? "美的空调" : chunk.includes("喜") ? "喜字袋" : "空白袋";
    const fulfillment = chunk.includes("快运") || chunk.includes("快递") ? "快递快运" : chunk.includes("送货") ? "送货" : "自提";
    const print = chunk.includes("印") || chunk.includes("美的") ? "是" : "否";
    const handle = chunk.includes("长提") || chunk.includes("加长") ? "加长提" : "普通提";
    const latest = chunk.includes("明天") ? "明天" : chunk.includes("周五") ? "周五" : chunk.includes("下午") ? "今天下午" : "待确认";
    const sizeText = size ? `${size[1]}*${size[2]}*${size[3] ?? "10"}` : "待确认";
    const quantities = qtyMatches.length ? qtyMatches : [[null, colorHint, chunk.match(/(\d{2,5})\s*个/)?.[1] ?? "0"]];

    quantities.forEach((match, qtyIndex) => {
      const color = match[1] || colorHint;
      const qty = Number(match[2] ?? match[1] ?? 0);
      rows.push({
        id: `DRAFT-${index + 1}-${qtyIndex + 1}`,
        customer: customerName,
        product,
        size: sizeText,
        color,
        handle,
        style: product === "小熊袋" ? "小熊袋" : "空白袋",
        print,
        qty,
        fulfillment,
        latest,
        inventory: sizeText === "待确认" || color === "待确认" ? "待确认" : qty > 900 && !chunk.includes("美的") ? "需复核" : "可用",
        amount: qty ? Math.round(qty * (print === "是" ? 0.48 : 0.36) * 10) / 10 : 0,
        confidence: sizeText === "待确认" || color === "待确认" ? "low" : latest === "待确认" ? "medium" : "high",
        source: chunk,
      });
    });
  });
  return rows;
}

export function App() {
  const [activePage, setActivePage] = useState("todos");
  const [toast, setToast] = useState("P0 原型已载入：6 个办公室核心页使用本地假数据模拟。");
  const [todos, setTodos] = useState(initialTodos);
  const [selectedTodoId, setSelectedTodoId] = useState(initialTodos[0].id);
  const [entryText, setEntryText] = useState(sampleText);
  const [draftRows, setDraftRows] = useState(() => parseOrderText(sampleText));
  const [selectedDraftId, setSelectedDraftId] = useState("DRAFT-1-1");
  const [orderFilter, setOrderFilter] = useState("全部");
  const [selectedOrderId, setSelectedOrderId] = useState(orderLines[0].id);
  const [selectedStockId, setSelectedStockId] = useState(inventories[0].id);
  const [fulfillmentTab, setFulfillmentTab] = useState("全部");
  const [fulfillments, setFulfillments] = useState(initialFulfillments);
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState(initialFulfillments[0].id);
  const [selectedStatementId, setSelectedStatementId] = useState(statements[0].id);
  const [modal, setModal] = useState(null);

  const activeMeta = pages.find((item) => item.key === activePage) ?? pages[0];

  function handleTodo(action) {
    setTodos((current) => current.map((item) => (item.id === selectedTodoId ? { ...item, handled: action === "handled" ? true : item.handled } : item)));
    setToast(action === "handled" ? "已记录实际处理人：办公室A，事项进入今日已处理。" : "已生成稍后提醒，不影响订单继续流转。");
  }

  function recognize() {
    const rows = parseOrderText(entryText);
    setDraftRows(rows);
    setSelectedDraftId(rows[0]?.id ?? "");
    setToast(`已识别 ${rows.length} 行明细；库存与价格为识别时快照，保存正式订单前会重新校验。`);
  }

  function entryAction(label) {
    if (label === "保存并确认") {
      setToast("已模拟生成正式订单，并重新查库存/价格；可在订单池查看。");
      setActivePage("orders");
      return;
    }
    setToast(`${label} 已模拟完成，本地原型不会写入真实数据库。`);
  }

  function updateFulfillment(action) {
    if (action === "数量不符") {
      setModal({ type: "mismatch" });
      return;
    }
    if (action === "打印预览") {
      setModal({ type: "print" });
      return;
    }
    setFulfillments((current) =>
      current.map((item) => {
        if (item.id !== selectedFulfillmentId) return item;
        if (action === "标记已备货") return { ...item, status: "已备货" };
        if (action === "完成出库/交付") return { ...item, status: "已交付" };
        if (action === "确认已拉走") return { ...item, status: "已交快递/快运" };
        if (action === "无法出库") return { ...item, status: "无法出库" };
        return item;
      }),
    );
    setToast(`${action} 已模拟记录，操作人：办公室A。`);
  }

  function statementAction(action) {
    if (action === "登记实收") {
      setModal({ type: "payment" });
      return;
    }
    setToast(`${action} 已模拟完成；客户版展示汇总，内部保留交付证据。`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>P0 办公室端</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {pages.map(({ key, label, icon: Icon }) => (
            <button className={activePage === key ? "nav-item active" : "nav-item"} key={key} onClick={() => setActivePage(key)}>
              <Icon />
              <span>{label}</span>
              {key === "todos" && <b className="nav-badge">8</b>}
            </button>
          ))}
          <div className="nav-divider">后续模块</div>
          {laterPages.map(({ label, icon: Icon }) => (
            <button className="nav-item disabled" key={label} onClick={() => setToast(`${label} 是后续模块，P0 只做占位。`)}>
              <Icon />
              <span>{label}</span>
              <RightOutlined className="nav-caret" />
            </button>
          ))}
        </nav>
        <button className="collapse-menu">
          <MenuFoldOutlined />
          收起菜单
        </button>
      </aside>

      <div className="workspace">
        <Topbar onNavigate={setActivePage} />
        <main className="content">
          <PageHead page={activeMeta} onRefresh={() => setToast(`${activeMeta.label} 已刷新本地假数据。`)} />
          {activePage === "todos" && <TodoPage todos={todos} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} onAction={handleTodo} />}
          {activePage === "entry" && (
            <EntryPage
              entryText={entryText}
              setEntryText={setEntryText}
              draftRows={draftRows}
              selectedDraftId={selectedDraftId}
              setSelectedDraftId={setSelectedDraftId}
              onRecognize={recognize}
              onAction={entryAction}
            />
          )}
          {activePage === "orders" && <OrderPoolPage selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} filter={orderFilter} setFilter={setOrderFilter} setToast={setToast} />}
          {activePage === "inventory" && <InventoryPage selectedStockId={selectedStockId} setSelectedStockId={setSelectedStockId} setToast={setToast} />}
          {activePage === "fulfillment" && (
            <FulfillmentPage
              tab={fulfillmentTab}
              setTab={setFulfillmentTab}
              fulfillments={fulfillments}
              selectedId={selectedFulfillmentId}
              setSelectedId={setSelectedFulfillmentId}
              onAction={updateFulfillment}
            />
          )}
          {activePage === "statements" && <StatementPage selectedId={selectedStatementId} setSelectedId={setSelectedStatementId} onAction={statementAction} />}
          <div className="toast" role="status">{toast}</div>
        </main>
      </div>

      {modal && <ActionModal modal={modal} onClose={() => setModal(null)} setToast={setToast} />}
    </div>
  );
}

function Topbar({ onNavigate }) {
  return (
    <header className="topbar">
      <div className="factory-switcher">
        虎门工厂
        <DownOutlined />
      </div>
      <label className="search">
        <SearchOutlined />
        <input placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" />
      </label>
      <div className="sync-status">
        <span className="dot" />
        本地模拟
      </div>
      <span className="last-sync">当前：2026-06-29 10:30</span>
      <button className="primary-button" onClick={() => onNavigate("entry")}>
        <PlusOutlined />
        新建订单
      </button>
      <button className="icon-button has-badge" aria-label="通知">
        <BellOutlined />
      </button>
      <button className="icon-button" aria-label="用户">
        <UserOutlined />
      </button>
      <div className="user-block">
        <strong>办公室A</strong>
        <span>录单 / 对账</span>
      </div>
    </header>
  );
}

function PageHead({ page, onRefresh }) {
  const subtitles = {
    todos: "共享待办池，按急单、异常、最晚要货和等待时长排序。",
    entry: "整段粘贴或手动输入客户消息，规则识别后在表格里修正。",
    orders: "按订单明细查询状态、库存、生产、交付、对账和操作记录。",
    inventory: "按尺寸/颜色/提手/款式/库区/状态精确查询可用库存。",
    fulfillment: "统一处理自提、送货、快递快运的出库和交付确认。",
    statements: "按客户生成对账、登记实收、处理差额和欠款。",
  };

  return (
    <section className="page-head">
      <div>
        <h1>{page.label}</h1>
        <p>{subtitles[page.key]}</p>
      </div>
      <div className="head-actions">
        <button className="ghost-button" onClick={onRefresh}>
          <ReloadOutlined />
          刷新
        </button>
        <button className="ghost-button">
          <SyncOutlined />
          本地演示
        </button>
      </div>
    </section>
  );
}

function TodoPage({ todos, selectedTodoId, onSelect, onAction }) {
  const openTodos = todos.filter((item) => !item.handled);
  const selected = todos.find((item) => item.id === selectedTodoId) ?? todos[0];
  const customerInfo = getCustomer(selected.customerId);
  const stats = [
    ["未处理", openTodos.length, "warning"],
    ["今天要发", openTodos.filter((item) => item.latest.includes("今天")).length, "blue"],
    ["异常红点", openTodos.filter((item) => item.urgency === "异常").length, "danger"],
    ["已处理(今日)", todos.filter((item) => item.handled).length, "success"],
  ];

  return (
    <section className="page-grid two-col">
      <div className="list-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact">
          <h2>公共待办池</h2>
          <span>不抢单，记录实际处理人</span>
        </div>
        <div className="todo-list">
          {todos.map((item) => {
            const customerInfo = getCustomer(item.customerId);
            return (
              <button className={item.id === selected.id ? "todo-row active" : "todo-row"} key={item.id} onClick={() => onSelect(item.id)}>
                <div className="todo-main">
                  <strong>{item.type}</strong>
                  <span>{customerInfo.name} · {item.ref}</span>
                  <small>{item.summary}</small>
                </div>
                <div className="todo-side">
                  <StatusPill tone={item.urgency === "异常" ? "danger" : item.urgency === "急" || item.urgency === "今天" ? "warning" : "neutral"}>{item.urgency}</StatusPill>
                  <em>{item.wait}</em>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <DetailPane title={selected.type} subtitle={`${customerInfo.name} · ${selected.ref}`}>
        <InfoGrid
          rows={[
            ["客户", customerInfo.name],
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["最晚时间", selected.latest],
            ["等待时长", selected.wait],
            ["影响", selected.impact],
            ["办公室备注", "按客户沟通结果处理，关键动作写操作记录"],
          ]}
        />
        <section className="detail-section">
          <h3>摘要</h3>
          <p>{selected.summary}</p>
        </section>
        <section className="detail-section">
          <h3>建议动作</h3>
          <div className="action-row">
            <button className="primary-action" onClick={() => onAction("handled")}>处理完成</button>
            <button onClick={() => onAction("snooze")}>稍后提醒</button>
            <button>打开订单</button>
            <button>打印预览</button>
          </div>
        </section>
        <Timeline items={["系统创建待办", "办公室A 查看详情", "等待人工处理"]} />
      </DetailPane>
    </section>
  );
}

function EntryPage({ entryText, setEntryText, draftRows, selectedDraftId, setSelectedDraftId, onRecognize, onAction }) {
  const selected = draftRows.find((item) => item.id === selectedDraftId) ?? draftRows[0];
  return (
    <section className="page-stack">
      <div className="entry-box">
        <textarea value={entryText} onChange={(event) => setEntryText(event.target.value)} />
        <div className="entry-actions">
          <button className="primary-button" onClick={onRecognize}>识别</button>
          <button onClick={() => setEntryText("")}>清空</button>
          <button onClick={() => setEntryText(sampleText)}>填入样例</button>
        </div>
      </div>
      <section className="page-grid split-detail">
        <div className="table-pane">
          <DataTable
            columns={["客户", "品名/印刷内容", "尺寸", "颜色", "提手", "款式", "印刷", "数量", "交付", "库存", "预估金额"]}
            rows={draftRows.map((row) => ({
              id: row.id,
              active: row.id === selected?.id,
              tone: row.confidence,
              onClick: () => setSelectedDraftId(row.id),
              cells: [row.customer, row.product, row.size, row.color, row.handle, row.style, row.print, row.qty, row.fulfillment, row.inventory, money(row.amount)],
            }))}
          />
          <div className="footer-actions">
            {["保存草稿", "保存并确认", "拆分订单", "作废草稿"].map((item) => (
              <button className={item === "保存并确认" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
            ))}
          </div>
        </div>
        <DetailPane title="识别详情" subtitle={selected?.id ?? "未选择"}>
          {selected ? (
            <>
              <InfoGrid
                rows={[
                  ["置信度", selected.confidence === "high" ? "高" : selected.confidence === "medium" ? "中，需要确认" : "低，必须补充"],
                  ["原文片段", selected.source],
                  ["印刷图/稿件", selected.print === "是" ? "待上传 / 侧栏补充" : "非印刷不需要"],
                  ["客户备注", "从原文识别，文员可补充"],
                  ["价格快照", `${money(selected.amount)}，正式保存前重算`],
                ]}
              />
              <section className="detail-section">
                <h3>缺字段检查</h3>
                <StatusPill tone={selected.confidence === "low" ? "danger" : selected.confidence === "medium" ? "warning" : "success"}>
                  {selected.confidence === "low" ? "缺少尺寸/颜色" : selected.confidence === "medium" ? "缺最晚要货时间" : "可保存确认"}
                </StatusPill>
              </section>
            </>
          ) : null}
        </DetailPane>
      </section>
    </section>
  );
}

function OrderPoolPage({ selectedOrderId, setSelectedOrderId, filter, setFilter, setToast }) {
  const filtered = orderLines.filter((item) => filter === "全部" || item.status.includes(filter) || item.orderType.includes(filter) || item.fulfillment === filter);
  const selected = getOrderLine(selectedOrderId) ?? filtered[0];
  const customerInfo = getCustomer(selected.customerId);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <Segmented value={filter} onChange={setFilter} items={["全部", "待", "缺货", "定制印刷", "自提", "送货", "快递快运"]} />
          <span>默认：近30天未完成 + 今日完成</span>
        </div>
        <DataTable
          columns={["订单/明细", "客户", "品名", "尺寸", "颜色", "提手", "数量", "类型", "状态", "交付", "金额"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedOrderId(row.id),
            cells: [`${row.orderNo}-${row.lineNo}`, getCustomer(row.customerId).name, row.product, row.size, row.color, row.handle, row.qty, row.orderType, row.status, row.fulfillment, money(row.amount)],
          }))}
        />
      </div>
      <DetailPane title={`${selected.orderNo}-${selected.lineNo}`} subtitle={`${customerInfo.name} · ${selected.status}`}>
        <InfoGrid
          rows={[
            ["产品", `${selected.product} / ${selected.size} / ${selected.color}`],
            ["数量", `${selected.qty} 个`],
            ["交付", `${selected.fulfillment} · ${selected.latest}`],
            ["库存", selected.inventory],
            ["金额", money(selected.amount)],
            ["异常", selected.exceptions.length ? selected.exceptions.join("、") : "无"],
          ]}
        />
        <section className="detail-section">
          <h3>流转摘要</h3>
          <Timeline items={["订单确认", selected.print === "是" ? "丝印/制袋" : "查库存", selected.status, "等待下一动作"]} />
        </section>
        <div className="action-row">
          <button onClick={() => setToast("已复制订单摘要。")}>复制</button>
          <button onClick={() => setToast("已打开详情抽屉。")}>打开详情</button>
          <button onClick={() => setToast("草稿单可作废；正式单需走关闭流程。")}>作废草稿</button>
        </div>
      </DetailPane>
    </section>
  );
}

function InventoryPage({ selectedStockId, setSelectedStockId, setToast }) {
  const visible = inventories.filter((item) => !item.state.includes("待处理"));
  const selected = inventories.find((item) => item.id === selectedStockId) ?? visible[0];
  const available = selected.inStock - selected.reserved - selected.locked - selected.pending;
  const shortage = Math.max(0, 500 - available);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <label className="search small">
            <SearchOutlined />
            <input placeholder="尺寸 / 颜色 / 款式" />
          </label>
          <span>待处理/报废库存默认折叠</span>
        </div>
        <DataTable
          columns={["尺寸", "颜色", "提手", "款式", "库区/状态", "在库", "占用", "锁定", "可用", "可信度"]}
          rows={visible.map((row) => {
            const available = row.inStock - row.reserved - row.locked - row.pending;
            return {
              id: row.id,
              active: row.id === selected.id,
              tone: available <= 0 ? "danger" : row.estimated ? "medium" : "success",
              onClick: () => setSelectedStockId(row.id),
              cells: [row.size, row.color, row.handle, row.style, `${row.zone} / ${row.state}`, row.inStock, row.reserved, row.locked, available, row.estimated ? "估算/待复核" : "已清点"],
            };
          })}
        />
      </div>
      <DetailPane title="库存明细" subtitle={`${selected.size} ${selected.color} ${selected.handle} ${selected.style}`}>
        <InfoGrid
          rows={[
            ["精确库存键", `${selected.size} + ${selected.color} + ${selected.handle} + ${selected.style} + ${selected.zone}`],
            ["在库/占用/锁定", `${selected.inStock} / ${selected.reserved} / ${selected.locked}`],
            ["可用库存", `${available} 个`],
            ["来源摘要", selected.estimated ? "估算库存 / 待复核" : selected.state],
            ["待处理", `${selected.pending} 个`],
          ]}
        />
        {shortage > 0 && (
          <section className="detail-section alert">
            <h3>缺货判断</h3>
            <p>按 500 个示例订单计算，缺口 {shortage} 个。建议生成补货建议，预计 1 卷毛料可先粗算。</p>
          </section>
        )}
        <section className="detail-section">
          <h3>参考提示</h3>
          <p>近似颜色/尺寸只作参考：30*38 红色普通提空白袋有货；不能一键替代，也不能自动生成有货话术。</p>
        </section>
        <div className="action-row">
          <button className="primary-action" onClick={() => setToast("已生成库存修正草稿，需有权限账号确认后生效。")}>发起库存修正</button>
          <button onClick={() => setToast("已复制客户话术：这款暂时缺货，可确认是否等待生产。")}>复制客户话术</button>
        </div>
      </DetailPane>
    </section>
  );
}

function FulfillmentPage({ tab, setTab, fulfillments, selectedId, setSelectedId, onAction }) {
  const filtered = fulfillments.filter((item) => tab === "全部" || item.method === tab);
  const selected = fulfillments.find((item) => item.id === selectedId) ?? filtered[0] ?? fulfillments[0];
  const customerInfo = getCustomer(selected.customerId);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <Segmented value={tab} onChange={setTab} items={["全部", "自提", "送货", "快递快运"]} />
        <DataTable
          columns={["交付方式", "客户", "订单尾号", "货品摘要", "数量", "包裹", "最晚", "状态", "备注"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedId(row.id),
            cells: [row.method, getCustomer(row.customerId).name, row.lineId.slice(-5), row.goods, row.qty, row.packages, row.latest, row.status, row.status.includes("数量") ? "需办公室处理" : "正常"],
          }))}
        />
      </div>
      <DetailPane title={`${selected.method} · ${selected.status}`} subtitle={`${customerInfo.name} · ${selected.lineId}`}>
        <InfoGrid
          rows={[
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["地址", customerInfo.address],
            ["货品", selected.goods],
            ["数量/包裹", `${selected.qty} 个 / ${selected.packages}`],
            ["库存来源", `${selected.zone} / ${selected.source}`],
            ["单据状态", selected.printed ? "已打印" : "未打印/预览"],
          ]}
        />
        <section className="detail-section document-preview">
          <h3>{selected.method === "快递快运" ? "包裹标签预览" : "单据预览"}</h3>
          <p>{customerInfo.name} / {selected.goods} / {selected.qty} 个 / {selected.packages}</p>
        </section>
        <div className="action-row">
          {["标记已备货", "完成出库/交付", "数量不符", "无法出库", "打印预览", "确认已拉走"].map((item) => (
            <button className={item === "完成出库/交付" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
          ))}
        </div>
      </DetailPane>
    </section>
  );
}

function StatementPage({ selectedId, setSelectedId, onAction }) {
  const selected = statements.find((item) => item.id === selectedId) ?? statements[0];
  const customerInfo = getCustomer(selected.customerId);
  const lines = selected.lineIds.map(getOrderLine).filter(Boolean);
  return (
    <section className="page-grid statement-layout">
      <div className="customer-list">
        <div className="panel-head compact">
          <h2>客户对账</h2>
          <span>默认：本期待对账 / 欠款 / 收款待确认</span>
        </div>
        {statements.map((item) => {
          const customerInfo = getCustomer(item.customerId);
          return (
            <button className={item.id === selected.id ? "customer-row active" : "customer-row"} key={item.id} onClick={() => setSelectedId(item.id)}>
              <strong>{customerInfo.name}</strong>
              <span>{customerInfo.cycle} · 上次 {customerInfo.lastStatement}</span>
              <small>{money(item.receivable)} · {item.status}</small>
            </button>
          );
        })}
      </div>
      <div className="statement-main">
        <div className="statement-summary">
          <div>
            <span>客户</span>
            <strong>{customerInfo.name}</strong>
          </div>
          <div>
            <span>本期应收</span>
            <strong>{money(selected.receivable)}</strong>
          </div>
          <div>
            <span>已收</span>
            <strong>{money(selected.received)}</strong>
          </div>
          <div>
            <span>差额/欠款</span>
            <strong>{money(selected.variance || customerInfo.debt)}</strong>
          </div>
        </div>
        <DataTable
          columns={["订单明细", "产品", "尺寸/颜色", "交付", "计费数量", "原金额", "调整", "最终应收", "备注"]}
          rows={lines.map((row) => ({
            id: row.id,
            tone: row.exceptions.length ? "warning" : "neutral",
            cells: [`${row.orderNo}-${row.lineNo}`, row.product, `${row.size} ${row.color}`, row.fulfillment, row.qty, money(row.amount), row.exceptions.length ? "赠送/差异" : "0", money(row.amount), row.exceptions.join("、") || "正常"],
          }))}
        />
        <div className="statement-actions">
          {["生成对账单预览", "标记已发送", "登记实收", "差额待确认", "确认核销", "导出占位"].map((item) => (
            <button className={item === "确认核销" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionModal({ modal, onClose, setToast }) {
  const title = modal.type === "mismatch" ? "数量不符" : modal.type === "payment" ? "登记实收金额" : "单据 / 标签预览";
  function confirm() {
    if (modal.type === "mismatch") setToast("已提交数量不符：实际 430，原因库存不足，进入办公室待办。");
    if (modal.type === "payment") setToast("已登记实收金额，少付自动进入差额待确认。");
    if (modal.type === "print") setToast("已模拟打印成功；真实打印机后续接入。");
    onClose();
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <div>
            <span>P0 模拟动作</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {modal.type === "print" ? (
          <div className="print-sheet">
            <h3>设计中心小工厂</h3>
            <p>客户：张三服饰　货品：30*38 红色空白袋　数量：500 个</p>
            <p>此处为浏览器预览，后续对接针式打印机 / 标签机。</p>
          </div>
        ) : (
          <div className="form-grid">
            <label>
              {modal.type === "payment" ? "实收金额" : "实际数量"}
              <input defaultValue={modal.type === "payment" ? "80000" : "430"} />
            </label>
            <label>
              原因
              <select defaultValue={modal.type === "payment" ? "客户少付，差额待确认" : "库存不足"}>
                <option>库存不足</option>
                <option>找不到货</option>
                <option>颜色/尺寸不符</option>
                <option>客户少付，差额待确认</option>
                <option>其他</option>
              </select>
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={confirm}>确认模拟</button>
        </div>
      </section>
    </div>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="metric-strip">
      {items.map(([label, value, tone]) => (
        <div className={`metric ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="data-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row) => (
        <button className={`data-row ${row.active ? "active" : ""} ${row.tone ?? ""}`} key={row.id} onClick={row.onClick}>
          {row.cells.map((cell, index) => <span key={`${row.id}-${index}`}>{cell}</span>)}
        </button>
      ))}
    </div>
  );
}

function DetailPane({ title, subtitle, children }) {
  return (
    <aside className="detail-pane">
      <div className="detail-head">
        <div>
          <span>{subtitle}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </aside>
  );
}

function InfoGrid({ rows }) {
  return (
    <div className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ol>
  );
}

function StatusPill({ tone = "neutral", children }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

function Segmented({ value, onChange, items }) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button className={value === item ? "selected" : ""} key={item} onClick={() => onChange(item)}>{item}</button>
      ))}
    </div>
  );
}
