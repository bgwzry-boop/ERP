export const customers = [
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

export const initialOrderLines = [
  line("ORD-0629-001", "01", "C001", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 500, "现货有货", "待出库", "自提", "今天 15:00", 180, [], "有货"),
  line("ORD-0629-001", "02", "C001", "空白袋", "30*38*10", "黑色", "普通提", "空白袋", "否", 100, "现货缺货", "缺货待处理", "自提", "今天 15:00", 36, ["库存不足"], "缺货"),
  line("ORD-0629-002", "01", "C002", "服装店白袋", "25*32*10", "白色", "加长提", "空白袋", "否", 1200, "现货有货", "已备货", "送货", "今天 16:30", 408, [], "已占用"),
  line("ORD-0629-003", "01", "C004", "美的空调", "30*38*10", "白色", "普通提", "空白袋", "是", 1000, "定制印刷", "制袋中", "快递快运", "明天 18:00", 480, ["待打印标签"], "生产中", "双面", "黄色", ""),
  line("ORD-0629-004", "01", "C005", "小熊袋", "25*23*8", "红色", "普通提", "小熊袋", "是", 800, "印刷通货", "待出库", "自提", "今天 17:00", 376, [], "有货"),
  line("ORD-0629-005", "01", "C006", "喜字袋", "30*37*10", "红色", "普通提", "喜", "是", 300, "印刷通货", "已交付", "自提", "昨天 11:00", 174, [], "已完成"),
  line("ORD-0629-006", "01", "C007", "福字袋", "35*41*12", "红色", "普通提", "福", "是", 500, "印刷通货", "待对账", "送货", "今天 14:00", 390, [], "已交付"),
  line("ORD-0629-007", "01", "C008", "同行来料印刷", "40*32*10", "牛仔蓝", "普通提", "外加工", "是", 2600, "外加工印刷", "丝印中", "送货", "明天 10:00", 234, [], "不入库存"),
  line("ORD-0629-008", "01", "C009", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 50, "现货有货", "待收款确认", "自提", "今天 12:00", 18, ["现场现结"], "已交付"),
  line("ORD-0629-009", "01", "C010", "黑马服装", "40*32*10", "黑色", "加长提", "空白袋", "是", 2000, "定制印刷", "待打包", "送货", "明天 17:00", 980, ["数量差异"], "生产完成", "单面", "白色", "加长提"),
  line("ORD-0629-010", "01", "C011", "白鲸活动袋", "35*27*10", "白色", "普通提", "空白袋", "是", 1500, "定制印刷", "待快运拉走", "快递快运", "今天 19:00", 600, ["待确认拉走"], "待提货锁定", "单面", "黑色", "", "黑色"),
  line("ORD-0629-011", "01", "C003", "空白袋", "40*30*10", "蓝色", "普通提", "空白袋", "否", 600, "现货有货", "已交付", "送货", "今天 10:30", 228, [], "已完成"),
  line("ORD-0629-012", "01", "C002", "空白袋", "30*36*8", "绿色", "普通提", "空白袋", "否", 700, "现货缺货", "缺货待处理", "送货", "明天 12:00", 245, ["库存不足"], "缺货"),
  line("ORD-0629-013", "01", "C004", "美的空调", "30*38*10", "红色", "普通提", "空白袋", "是", 1005, "定制印刷", "数量差异待处理", "快递快运", "今天 18:30", 480, ["多 5 个赠送"], "待处理", "双面", "黄色", "多 5 个赠送"),
  line("ORD-0629-014", "01", "C005", "加长提空白", "30*38*10", "米白", "加长提", "空白袋", "否", 900, "现货有货", "待出库", "自提", "明天 09:30", 351, [], "有货"),
  line("ORD-0629-015", "01", "C001", "空白袋", "25*32*10", "红色", "普通提", "空白袋", "否", 300, "现货有货", "待对账", "自提", "昨天 16:00", 93, [], "已交付"),
  line("ORD-0629-016", "01", "C010", "黑马二批", "45*37*10", "黑色", "普通提", "空白袋", "是", 1800, "定制印刷", "待排产", "送货", "后天 18:00", 990, [], "未生产", "单面", "白色", ""),
  line("ORD-0629-017", "01", "C011", "自营补单", "30*38*10", "红色", "普通提", "空白袋", "是", 980, "定制印刷", "待补印", "快递快运", "明天 16:00", 468, ["少发补印"], "待处理", "单面", "黑色", "少发补印"),
  line("ORD-0629-018", "01", "C006", "喜字袋", "25*30*10", "红色", "普通提", "喜", "是", 200, "印刷通货", "待出库", "自提", "今天 18:00", 106, [], "有货"),
  line("ORD-0629-019", "01", "C007", "福字袋", "30*37*10", "红色", "普通提", "福", "是", 400, "印刷通货", "待对账", "送货", "昨天 18:30", 232, [], "已交付"),
  line("ORD-0629-020", "01", "C012", "原料入库演示", "78*90*1500", "大红", "布料", "原材料", "否", 2, "原材料", "资料占位", "其他", "后续", 0, [], "占位"),
  line("ORD-0629-021", "01", "C003", "空白袋", "50*40*12", "白色", "普通提", "空白袋", "否", 200, "现货缺货", "缺货待处理", "自提", "明天 11:30", 124, ["建议排产"], "缺货"),
  line("ORD-0629-022", "01", "C002", "外卖活动袋", "40*30*10", "黄色", "普通提", "空白袋", "是", 3000, "定制印刷", "丝印中", "送货", "明天 19:00", 1380, [], "生产中", "双面", "黑色", "", "红色"),
  line("ORD-0629-023", "01", "C004", "空白袋", "35*41*12", "白色", "普通提", "空白袋", "否", 600, "现货有货", "待出库", "快递快运", "今天 17:40", 300, ["待打印标签"], "已占用"),
  line("ORD-0629-024", "01", "C009", "空白袋", "25*32*10", "蓝色", "普通提", "空白袋", "否", 100, "现货有货", "已交付", "自提", "今天 09:10", 31, [], "已完成"),
  line("ORD-0629-025", "01", "C001", "空白袋", "30*38*10", "红色", "普通提", "空白袋", "否", 700, "现货有货", "待出库", "送货", "今天 16:00", 252, [], "有货"),
  line("ORD-0629-026", "01", "C005", "服装长提", "40*32*10", "粉色", "加长提", "空白袋", "否", 1000, "现货有货", "待备货", "自提", "明天 14:00", 420, [], "有货"),
  line("ORD-0629-027", "01", "C008", "同行来料蓝印", "35*27*10", "浅蓝", "普通提", "外加工", "是", 1800, "外加工印刷", "待交付", "自提", "今天 17:20", 162, [], "服务单"),
  line("ORD-0629-028", "01", "C010", "黑马三批", "40*32*10", "黑色", "加长提", "空白袋", "是", 1000, "定制印刷", "待对账", "送货", "昨天 13:00", 520, [], "已交付", "单面", "白色", "加长提"),
  line("ORD-0629-029", "01", "C011", "白鲸小单", "30*38*10", "红色", "普通提", "空白袋", "否", 120, "现货有货", "待收款确认", "快递快运", "今天 18:20", 43.2, ["收款截图"], "已交付"),
  line("ORD-0629-030", "01", "C006", "喜字袋", "35*41*12", "红色", "普通提", "喜", "是", 100, "印刷通货", "待出库", "自提", "明天 10:00", 78, [], "有货"),
];

export const initialInventories = [
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

export const initialTodos = [
  todo("T001", "订单草稿待确认", "C001", "ORD-0629-001", "30*38 红500、黑100，黑色库存不足需确认", "12分钟", "今天 15:00", "急", "库存影响"),
  todo("T002", "缺货待处理", "C002", "ORD-0629-012", "30*36*8 绿色 700 个缺货，建议生成补货建议", "38分钟", "明天 12:00", "异常", "可能影响送货"),
  todo("T003", "数量差异待处理", "C004", "ORD-0629-013", "实际打包 1005 个，计费 1000，需标记赠送", "28分钟", "今天 18:30", "异常", "影响对账"),
  todo("T004", "待打印标签", "C011", "ORD-0629-010", "快运 3 包，打包工已提交包裹明细", "46分钟", "今天 19:00", "今天", "快运可能傍晚拉走"),
  todo("T005", "快递/快运待确认拉走", "C004", "ORD-0629-023", "昨晚待快运区 2 包，需要确认是否已拉走", "2小时", "今天", "今天", "影响对账日期"),
  todo("T006", "待生成对账", "C007", "ORD-0629-019", "福字袋 400 个已送货，进入本期待对账", "1天", "本期", "普通", "应收 232"),
  todo("T007", "收款差额待确认", "C002", "ST-0629-002", "应收 108000，客户实付 80000，差额需处理", "20分钟", "本期", "异常", "形成欠款"),
  todo("T008", "老板/管理待查看", "C010", "ORD-0629-028", "月结客户欠款超过阈值，接单不阻塞但需查看", "3小时", "本周", "关注", "欠款 5300"),
];

export const initialFulfillments = [
  fulfill("F001", "自提", "C001", "ORD-0629-001-01", "30*38 红色空白袋", 500, "1件散装", "待出库", "今天 15:00", "A区-30*38", "仓库已清点"),
  fulfill("F002", "送货", "C002", "ORD-0629-002-01", "25*32 白色加长提", 1200, "3包", "已备货", "今天 16:30", "B区-服装", "仓库已清点"),
  fulfill("F003", "快递快运", "C011", "ORD-0629-010-01", "白鲸活动袋 35*27 白印", 1500, "3包", "待打印标签", "今天 19:00", "待快运区", "待提货锁定"),
  fulfill("F004", "快递快运", "C004", "ORD-0629-023-01", "35*41 白色空白袋", 600, "2包", "待确认拉走", "今天", "待快运区", "待提货锁定"),
  fulfill("F005", "自提", "C005", "ORD-0629-004-01", "25*23 红色小熊袋", 800, "2包", "待出库", "今天 17:00", "印刷通货区", "仓库已清点"),
  fulfill("F006", "送货", "C010", "ORD-0629-009-01", "40*32 黑色加长提 黑印", 2000, "4包", "数量不符", "明天 17:00", "打包区", "打包清点库存"),
  fulfill("F007", "自提", "C009", "ORD-0629-008-01", "30*38 红色空白袋", 50, "1件散装", "已交付", "今天 12:00", "A区-30*38", "仓库已清点"),
  fulfill("F008", "送货", "C002", "ORD-0629-022-01", "外卖活动袋 40*30 黄袋红提", 3000, "6包", "待出库", "明天 19:00", "打包区", "生产中"),
];

export const initialStatements = [
  statement("ST-0629-001", "C001", "待生成", 273, 0, 0, "06-22 至 06-29", ["ORD-0629-015-01", "ORD-0629-001-01"]),
  statement("ST-0629-002", "C002", "差额待确认", 108000, 80000, 28000, "06-15 至 06-29", ["ORD-0629-002-01", "ORD-0629-011-01", "ORD-0629-022-01"]),
  statement("ST-0629-003", "C004", "待发送", 1480, 0, 0, "06-01 至 06-29", ["ORD-0629-003-01", "ORD-0629-013-01", "ORD-0629-023-01"]),
  statement("ST-0629-004", "C007", "待生成", 622, 0, 0, "06-22 至 06-29", ["ORD-0629-006-01", "ORD-0629-019-01"]),
  statement("ST-0629-005", "C010", "有欠款", 1510, 0, 5300, "06-01 至 06-29", ["ORD-0629-028-01"]),
  statement("ST-0629-006", "C011", "收款待确认", 643.2, 43.2, 0, "06-22 至 06-29", ["ORD-0629-010-01", "ORD-0629-029-01"]),
];

export const initialRawMaterialInbounds = [
  rawMaterialInbound({
    id: "RMI-0704-001",
    supplierName: "宏尚布业",
    deliveryNoteNo: "",
    receivedAt: "2026-07-04 09:20",
    materialType: "布料",
    productName: "无纺布卷料",
    supplierColor: "大红",
    factoryColor: "红色",
    spec: "78*90g*1500m",
    unit: "kg",
    rollCount: 2,
    totalWeightKg: 212.4,
    unitPrice: 9,
    amount: 1911.6,
    status: "已识别待复核",
    source: "手机拍照 / OCR 预填",
    ocrStatus: "OCR 预填，供应商未提供单号，待人工核对原材料送货单和实物原标签",
    photoStatus: "送货单照片已上传",
    signedNoteStatus: "待上传签单信息",
    nextStep: "客服/办公室核对原材料送货单、OCR 字段和实物原标签；无供应商单号时用系统入库单号追踪。",
    note: "该供应商随货单据未提供单号；OCR 只能预填，不直接入库；复核后再打印一卷一标。",
    location: "原料待检区",
    statementStatus: "待月结对账",
    statementSummary: "供应商月结 Excel 未上传；供应商无原始单号时优先用 ERP 入库单号、日期、规格、颜色和分卷重量候选匹配。",
    statementDifferences: ["供应商单号未提供", "待供应商月结单匹配"],
    rolls: [
      rawMaterialRoll("RM-240704-001-01", "重1", 105.4, "待生成标签", "不可用", "原料待检区"),
      rawMaterialRoll("RM-240704-001-02", "重2", 107, "待生成标签", "不可用", "原料待检区"),
    ],
  }),
  rawMaterialInbound({
    id: "RMI-0704-002",
    supplierName: "白侯无纺布",
    deliveryNoteNo: "BH-240704-015",
    receivedAt: "2026-07-04 10:35",
    materialType: "无纺布",
    productName: "白色无纺布",
    supplierColor: "本白",
    factoryColor: "白色",
    spec: "90g*1600m",
    unit: "kg",
    rollCount: 3,
    totalWeightKg: 318.8,
    unitPrice: 8.6,
    amount: 2741.68,
    status: "已打印待贴标",
    source: "手机拍照 / 人工复核",
    ocrStatus: "已复核",
    photoStatus: "送货单照片已上传",
    signedNoteStatus: "待贴标扫码上传",
    nextStep: "把系统标签贴到对应卷料，手机扫码并上传签单信息后才可用。",
    note: "白侯模板月结时需拆重1-重5，并识别纸管扣项。",
    location: "原料待贴标区",
    statementStatus: "月结待匹配",
    statementSummary: "待供应商 Excel 上传；纸管扣项必须人工复核。",
    statementDifferences: ["待核纸管扣项", "待核分卷重量"],
    rolls: [
      rawMaterialRoll("RM-240704-002-01", "重1", 106.2, "已打印待贴标", "不可用", "原料待贴标区"),
      rawMaterialRoll("RM-240704-002-02", "重2", 105.8, "已打印待贴标", "不可用", "原料待贴标区"),
      rawMaterialRoll("RM-240704-002-03", "重3", 106.8, "已打印待贴标", "不可用", "原料待贴标区"),
    ],
  }),
  rawMaterialInbound({
    id: "RMI-0704-003",
    supplierName: "北陈辅料",
    deliveryNoteNo: "BC-240704-029",
    receivedAt: "2026-07-04 11:10",
    materialType: "提手",
    productName: "黑色加长提手",
    supplierColor: "黑",
    factoryColor: "黑色",
    spec: "5cm*加长提",
    unit: "件",
    rollCount: 4,
    totalWeightKg: 0,
    unitPrice: 0.18,
    amount: 720,
    status: "部分贴标",
    source: "手机拍照 / 人工复核",
    ocrStatus: "已复核",
    photoStatus: "送货单照片已上传",
    signedNoteStatus: "部分签单已上传",
    nextStep: "剩余件数继续贴标扫码，未贴标部分不能作为可用原料。",
    note: "北陈月结 Excel 用批号强匹配，分段表头和退货行需归一化。",
    location: "提手区",
    statementStatus: "存在差异",
    statementSummary: "ERP 已入库 4 件；供应商表有退货分段，待核金额。",
    statementDifferences: ["批号匹配", "退货行待核", "金额差异待确认"],
    rolls: [
      rawMaterialRoll("RM-240704-003-01", "批号BC029-1", 0, "已贴标入库/可用", "可用", "提手区-A1", "2026-07-04 11:32"),
      rawMaterialRoll("RM-240704-003-02", "批号BC029-2", 0, "已贴标入库/可用", "可用", "提手区-A1", "2026-07-04 11:36"),
      rawMaterialRoll("RM-240704-003-03", "批号BC029-3", 0, "已打印待贴标", "不可用", "提手区待贴标"),
      rawMaterialRoll("RM-240704-003-04", "批号BC029-4", 0, "已打印待贴标", "不可用", "提手区待贴标"),
    ],
  }),
];

export const sampleText = "张三服饰，30*38红500个明天下午自提，30*38黑100个；美的空调 30*38 白袋 黄印 双面 1000个 周五快运；白鲸自营店 35*27 白印黑 白袋黑提 单面 1500个 今天快运；李四电商 外卖活动袋 40*30 黄印黑 黄袋红提 双面 3000个 明天送货；小熊童装 25*32 白色加长提 1200个送货";

export const defaultOfficeScenarioId = "p0-office-core";

export const officeScenarioDefinitions = [
  {
    id: defaultOfficeScenarioId,
    name: "P0 办公室六页联动基线",
    modules: ["公共待办", "订单录入", "订单池", "库存查询", "出库交付", "对账收款"],
    description: "覆盖办公室端 6 个核心页面的默认演示数据，包含急单、缺货、定制印刷、快递快运、数量差异、收款差额和库存修正场景。",
    sampleText,
    focus: {
      todoId: "T001",
      orderId: "ORD-0629-010-01",
      stockId: "30*38*10-红色-普通提-空白袋-A区-30*38",
      fulfillmentId: "F003",
      statementId: "ST-0629-002",
    },
    acceptance: ["六个办公室页面可打开", "公共待办角标为 8", "订单录入样例可识别多行", "出库快运可打印后待拉走", "李四电商差额可处理为欠款"],
  },
  {
    id: "p0-order-entry-shorthand",
    name: "订单录入定制短写识别",
    modules: ["订单录入", "订单池"],
    description: "验证白印黑、白袋黑提、黄印黑、黄袋红提等工厂短写可以落到袋色、印色、提手色、单双面和备注字段。",
    sampleText,
    focus: { orderId: "ORD-0629-010-01", draftCustomerId: "C011" },
    acceptance: ["白印黑识别为白色袋子印黑色", "白袋黑提识别为白袋黑提手", "定制印刷表格显示定制印刷而不是空白袋"],
  },
  {
    id: "p0-fulfillment-express-exception",
    name: "出库快运打印和异常处理",
    modules: ["出库交付", "公共待办"],
    description: "验证快递快运先打印标签再确认拉走，数量不符和无法出库生成办公室公共待办并可定位。",
    sampleText,
    focus: { fulfillmentId: "F003", todoId: "T004", orderId: "ORD-0629-010-01" },
    acceptance: ["快运打印后进入待确认拉走", "数量不符生成公共待办", "打开待办不会重复创建同明细待办"],
  },
  {
    id: "p0-statement-underpayment",
    name: "对账少付差额转欠款",
    modules: ["对账收款", "公共待办"],
    description: "验证李四电商 10.8 万应收、8 万实收、2.8 万差额，必须先处理差额才能进入核销判断。",
    sampleText,
    focus: { statementId: "ST-0629-002", customerId: "C002", todoId: "T007" },
    acceptance: ["未处理差额前核销被拦截", "登记实收保持差额待确认", "未收差额转欠款后保留在欠款/差额筛选"],
  },
  {
    id: "p0-inventory-shortage-correction",
    name: "库存缺货和修正草稿",
    modules: ["库存查询", "公共待办", "订单录入"],
    description: "验证待处理库存默认折叠，客户要货数量大于可用库存时显示缺口、参考话术和库存修正草稿。",
    sampleText,
    focus: { stockId: "30*38*10-红色-普通提-空白袋-A区-30*38", todoId: "T002" },
    acceptance: ["可用库存按在库减占用减锁定减待处理计算", "待处理库存默认不计可用", "库存修正只生成待确认草稿"],
  },
  {
    id: "p0-shared-todo-priority",
    name: "公共待办优先级和处理动作",
    modules: ["公共待办"],
    description: "验证急单、异常、今天要发、最晚时间和等待时长排序，以及按类型显示处理动作、稍后提醒和低风险批量打印。",
    sampleText,
    focus: { todoId: "T001" },
    acceptance: ["未处理待办默认按优先级排序", "影响库存/金额/数量的待办逐条处理", "打印标签类待办支持低风险批量处理"],
  },
];

export const officeScenarioCatalog = Object.fromEntries(officeScenarioDefinitions.map((scenario) => [scenario.id, scenario]));

export function createOfficeScenarioData(scenarioId = defaultOfficeScenarioId) {
  const scenario = officeScenarioCatalog[scenarioId] ?? officeScenarioCatalog[defaultOfficeScenarioId];
  return {
    scenario,
    customers: cloneFixtureRows(customers),
    initialOrderLines: cloneFixtureRows(initialOrderLines),
    initialInventories: cloneFixtureRows(initialInventories),
    initialTodos: cloneFixtureRows(initialTodos),
    initialFulfillments: cloneFixtureRows(initialFulfillments),
    initialStatements: cloneFixtureRows(initialStatements),
    initialRawMaterialInbounds: cloneFixtureRows(initialRawMaterialInbounds),
    sampleText: scenario.sampleText ?? sampleText,
  };
}

export function makeOrderLine(input) {
  return line(
    input.orderNo,
    input.lineNo,
    input.customerId,
    input.product,
    input.size,
    input.color,
    input.handle,
    input.style,
    input.print,
    input.qty,
    input.orderType,
    input.status,
    input.fulfillment,
    input.latest,
    input.amount,
    input.exceptions,
    input.inventory,
    input.printSide,
    input.printColor,
    input.note,
    input.handleColor,
  );
}

export function makeTodo(input) {
  const base = todo(input.id, input.type, input.customerId, input.ref, input.summary, input.wait, input.latest, input.urgency, input.impact);
  return { ...base, ...input, id: input.id };
}

export function makeFulfillment(input) {
  return fulfill(input.id, input.method, input.customerId, input.lineId, input.goods, input.qty, input.packages, input.status, input.latest, input.zone, input.source);
}

function customer(id, name, cycle, contact, phone, address, receivable, debt, lastStatement, tags) {
  return { id, name, cycle, contact, phone, address, receivable, debt, lastStatement, tags };
}

function line(orderNo, lineNo, customerId, product, size, color, handle, style, print, qty, orderType, status, fulfillment, latest, amount, exceptions, inventory, printSide = "", printColor = "", note = "", handleColor = "") {
  return { id: `${orderNo}-${lineNo}`, orderNo, lineNo, customerId, product, size, color, handle, style, print, qty, orderType, status, fulfillment, latest, amount, exceptions, inventory, printSide, printColor, note, handleColor };
}

function stock(size, color, handle, style, zone, state, inStock, reserved, locked, pending, estimated) {
  return { id: `${size}-${color}-${handle}-${style}-${zone}`, size, color, handle, style, zone, state, inStock, reserved, locked, pending, estimated };
}

function todo(id, type, customerId, ref, summary, wait, latest, urgency, impact) {
  return { id, type, customerId, ref, summary, wait, latest, urgency, impact, handled: false };
}

function fulfill(id, method, customerId, lineId, goods, qty, packages, status, latest, zone, source) {
  return { id, method, customerId, lineId, goods, qty, packages, status, latest, zone, source, printed: status === "已交付" };
}

function statement(id, customerId, status, receivable, received, variance, period, lineIds) {
  return { id, customerId, status, receivable, received, variance, period, lineIds, sent: status !== "待生成" };
}

function rawMaterialInbound(input) {
  return { ...input };
}

function rawMaterialRoll(id, supplierRollNo, weightKg, labelStatus, inventoryStatus, location, scannedAt = "") {
  return {
    id,
    supplierRollNo,
    weightKg,
    labelStatus,
    inventoryStatus,
    location,
    scannedAt,
    signedNoteStatus: scannedAt ? "已扫码/签单" : "待扫码/签单",
  };
}

function cloneFixtureRows(rows) {
  return rows.map((row) => {
    const next = { ...row };
    if (Array.isArray(row.tags)) next.tags = [...row.tags];
    if (Array.isArray(row.exceptions)) next.exceptions = [...row.exceptions];
    if (Array.isArray(row.lineIds)) next.lineIds = [...row.lineIds];
    if (Array.isArray(row.rolls)) next.rolls = row.rolls.map((roll) => ({ ...roll }));
    if (Array.isArray(row.statementDifferences)) next.statementDifferences = [...row.statementDifferences];
    return next;
  });
}
