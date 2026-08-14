const urgentProductionOrder = {
  id: "ORD-URGENT-001",
  customer: "郑蓉",
  product: "白鲸购物袋",
  size: "30×38×10",
  color: "蓝印白",
  planned: 1200,
  type: "定制单",
  priority: "加急",
  eta: "预计明天 00:30",
  silkSpec: "30×38×10 · 白袋 · 蓝墨单面 · 1,200",
};

const urgentProductionQueueTask = [
  urgentProductionOrder.customer,
  `${urgentProductionOrder.product} · ${urgentProductionOrder.size}`,
  urgentProductionOrder.eta,
  urgentProductionOrder.planned,
  urgentProductionOrder.type,
  [urgentProductionOrder.priority],
  { product: urgentProductionOrder.product, color: urgentProductionOrder.color },
];

const machines = [
  {
    id: "BAG-01",
    short: "1 号机",
    workshop: "1号车间",
    state: "running",
    stateLabel: "生产中",
    setSpeed: 58,
    currentSequence: 3,
    order: "ORD-0629-003",
    customer: "王芳",
    product: "美的空调",
    type: "定制印刷",
    spec: "30×38×10 · 白色 · 普通提",
    visual: {
      bagLabel: "白色",
      bagHex: "#ffffff",
      bagSideHex: "#d9dee5",
      handleLabel: "白色（默认）",
      handleType: "普通提",
      handleHex: "#ffffff",
      outlineHex: "#9199a4",
      printLabel: "黄色 · 双面",
      printHex: "#d7a600",
      artworkLine1: "MIDEA",
      artworkLine2: "美的空调",
      artworkState: "图稿已确认 · V3",
    },
    planned: 1000,
    done: 620,
    eta: "预计今天 21:00",
    etaBasis: "试算",
    delivery: "明天 18:00",
    reason: "已发布排产",
    next: `${urgentProductionOrder.customer} · ${urgentProductionOrder.product}`,
    queue: [
      urgentProductionQueueTask,
      ["陈敏", "米白长提袋 · 30×38×10", "预计明天 11:00", 2800, "现货通货", ["加长提"], { product: "", color: "米白袋米提" }],
      ["刘晓燕", "绿色空白袋 · 30×36×8", "预计明天 16:00", 2400, "现货通货", ["按扣"], { product: "", color: "绿袋绿提" }],
    ],
  },
  {
    id: "BAG-02",
    short: "2 号机",
    workshop: "1号车间",
    state: "running",
    stateLabel: "生产中",
    currentSequence: 2,
    order: "ORD-0629-016",
    customer: "赵倩",
    product: "黑马二批",
    type: "定制印刷",
    spec: "45×37×10 · 黑色 · 普通提",
    visual: {
      bagLabel: "黑色",
      bagHex: "#202323",
      bagSideHex: "#14171a",
      handleLabel: "黑色（默认）",
      handleType: "普通提",
      handleHex: "#202323",
      outlineHex: "#616973",
      printLabel: "白色 · 单面",
      printHex: "#f5f5ef",
      artworkLine1: "黑马",
      artworkLine2: "服装",
      artworkState: "图稿已确认 · V2",
    },
    planned: 1800,
    done: 760,
    eta: "预计明天 10:00",
    etaBasis: "试算",
    delivery: "后天 18:00",
    reason: "已发布排产",
    next: "孙玲 · 京东电器",
    queue: [
      ["孙玲", "京东电器 · 30×38×10", "预计明天 14:00", 2400, "定制单", [], { product: "京东电器", color: "黑印红" }],
      ["刘晓燕", "绿色空白袋 · 30×36×8", "预计明天 18:00", 2400, "现货通货", ["按扣"], { product: "", color: "绿袋绿提" }],
      ["周燕", "喜字袋 · 35×41×12", "预计后天 09:00", 1200, "印刷通货", [], { product: "喜字袋", color: "金印红" }],
    ],
  },
  {
    id: "BAG-03",
    short: "3 号机",
    workshop: "1号车间",
    state: "running",
    stateLabel: "生产中",
    currentSequence: 4,
    order: "ORD-0629-017",
    customer: "孙玲",
    product: "京东电器",
    type: "定制印刷",
    spec: "30×38×10 · 红色 · 普通提",
    visual: {
      bagLabel: "红色",
      bagHex: "#e52124",
      bagSideHex: "#9f3039",
      handleLabel: "红色",
      handleType: "普通提",
      handleHex: "#e52124",
      outlineHex: "#8e2c34",
      printLabel: "黑色 · 单面",
      printHex: "#20242a",
      artworkLine1: "京东",
      artworkLine2: "电器",
      artworkState: "图稿已确认 · V2",
    },
    planned: 2400,
    done: 1420,
    eta: "预计今天 20:00",
    etaBasis: "试算",
    delivery: "明天 16:00",
    reason: "已发布排产",
    next: "周燕 · 喜字袋",
    queue: [
      ["周燕", "喜字袋 · 35×41×12", "预计今天 23:00", 1200, "印刷通货", [], { product: "喜字袋", color: "金印红" }],
      ["吴洁", "白色空白袋 · 50×40×12", "预计明天 10:00", 2600, "现货通货", [], { product: "", color: "白袋白提" }],
      ["郑蓉", "白鲸小单 · 30×38×10", "预计明天 15:00", 2200, "现货通货", [], { product: "白鲸小单", color: "米白袋米提" }],
    ],
  },
  {
    id: "BAG-04",
    short: "4 号机",
    workshop: "2号车间",
    state: "running",
    stateLabel: "生产中",
    currentSequence: 1,
    order: "ORD-0629-022",
    customer: "刘晓燕",
    product: "外卖活动袋",
    type: "定制印刷",
    spec: "40×30×10 · 黄色 · 普通提",
    visual: {
      bagLabel: "黄色",
      bagHex: "#f2ba22",
      bagSideHex: "#b68d20",
      handleLabel: "黄色（默认）",
      handleType: "普通提",
      handleHex: "#f2ba22",
      outlineHex: "#9c781b",
      printLabel: "黑色 · 单面",
      printHex: "#20242a",
      artworkLine1: "外卖",
      artworkLine2: "活动袋",
      artworkState: "图稿已确认 · V4",
    },
    planned: 3000,
    done: 1440,
    eta: "预计明天 14:00",
    etaBasis: "试算",
    delivery: "明天 19:00",
    reason: "已发布排产",
    next: "马俊 · 来料蓝印",
    queue: [
      ["马俊", "来料蓝印 · 35×27×10", "预计明天 18:00", 1800, "定制单", ["来料加工"], { product: "", color: "蓝印浅蓝" }],
      ["王芳", "白色空白袋 · 35×41×12", "预计后天 09:00", 2400, "现货通货", ["按扣"], { product: "", color: "白袋白提" }],
      ["赵倩", "黑马三批 · 40×32×10", "预计后天 15:00", 1600, "定制单", ["加长提"], { product: "黑马三批", color: "白印黑" }],
    ],
  },
  {
    id: "BAG-05",
    short: "5 号机",
    workshop: "2号车间",
    state: "running",
    stateLabel: "生产中",
    currentSequence: 2,
    order: "ORD-0629-026",
    customer: "陈敏",
    product: "服装长提",
    type: "纯色通货",
    specials: ["加长提"],
    spec: "40×32×10 · 粉色 · 加长提",
    visual: {
      bagLabel: "粉色",
      bagHex: "#e7a3b6",
      bagSideHex: "#c47d92",
      handleLabel: "米色",
      handleType: "加长提",
      handleHex: "#d9c7a7",
      outlineHex: "#ae6e82",
      printLabel: "无印刷",
      printHex: "#ffffff",
      artworkLine1: "",
      artworkLine2: "",
      artworkState: "纯色通货 · 无图稿",
    },
    planned: 2600,
    done: 1680,
    eta: "预计今天 17:00",
    etaBasis: "试算",
    delivery: "明天 14:00",
    reason: "已发布排产",
    next: "黄秀兰 · 福字袋",
    queue: [
      ["黄秀兰", "福字袋 · 35×41×12", "预计今天 21:00", 1200, "印刷通货", [], { product: "福字袋", color: "金印红" }],
      ["赵倩", "黑色加长提 · 40×32×10", "预计明天 09:00", 2000, "定制单", ["加长提"], { product: "", color: "黑袋黑提" }],
      ["孙玲", "白鲸活动袋 · 35×27×10", "预计明天 14:00", 1500, "定制单", [], { product: "白鲸活动袋", color: "黑印白" }],
    ],
  },
  {
    id: "BAG-06",
    short: "6 号机",
    workshop: "2号车间",
    state: "paused",
    stateLabel: "异常暂停",
    currentSequence: 1,
    order: "ORD-0629-021",
    customer: "吴洁",
    product: "空白袋",
    type: "补货",
    specials: ["按扣"],
    spec: "50×40×12 · 白色 · 普通提",
    visual: {
      bagLabel: "白色",
      bagHex: "#ffffff",
      bagSideHex: "#d5dae0",
      handleLabel: "白色（默认）",
      handleType: "普通提",
      handleHex: "#ffffff",
      outlineHex: "#9199a4",
      printLabel: "无印刷",
      printHex: "#ffffff",
      artworkLine1: "",
      artworkLine2: "",
      artworkState: "纯色补货 · 无图稿",
    },
    planned: 2200,
    done: 880,
    eta: "恢复后约 3 小时",
    etaBasis: "待恢复重算",
    delivery: "明天 11:30",
    reason: "设备暂停",
    next: "等待恢复后继续",
    queue: [
      ["周燕", "喜字袋 · 25×30×10", "预计明天 12:00", 1000, "印刷通货", [], { product: "喜字袋", color: "金印红" }],
      ["张丽", "红色空白袋 · 25×32×10", "预计明天 16:00", 2500, "现货通货", [], { product: "", color: "红袋红提" }],
      ["郑蓉", "蓝色空白袋 · 25×32×10", "预计后天 09:00", 2200, "现货通货", ["按扣"], { product: "", color: "蓝袋蓝提" }],
    ],
  },
  {
    id: "BAG-07",
    short: "7 号机",
    workshop: "3号车间",
    state: "running",
    stateLabel: "生产中",
    currentSequence: 3,
    order: "ORD-0629-014",
    customer: "陈敏",
    product: "加长提空白",
    type: "纯色通货",
    specials: ["加长提"],
    spec: "30×38×10 · 米白 · 加长提",
    visual: {
      bagLabel: "米白色",
      bagHex: "#e9e1cf",
      bagSideHex: "#c9c0ad",
      handleLabel: "米色",
      handleType: "加长提",
      handleHex: "#b49c70",
      outlineHex: "#a89d88",
      printLabel: "无印刷",
      printHex: "#ffffff",
      artworkLine1: "",
      artworkLine2: "",
      artworkState: "纯色通货 · 无图稿",
    },
    planned: 2500,
    done: 1510,
    eta: "预计今天 19:00",
    etaBasis: "试算",
    delivery: "明天 09:30",
    reason: "已发布排产",
    next: "郑蓉 · 白鲸小单",
    queue: [
      ["郑蓉", "白鲸小单 · 30×38×10", "预计今天 22:00", 2200, "现货通货", [], { product: "白鲸小单", color: "米白袋米提" }],
      ["周燕", "喜字袋 · 35×41×12", "预计明天 10:00", 1000, "印刷通货", [], { product: "喜字袋", color: "金印红" }],
      ["王芳", "红色定制袋 · 30×38×10", "预计明天 15:00", 1500, "定制单", [], { product: "", color: "黄印红" }],
    ],
  },
  {
    id: "BAG-08",
    short: "8 号机",
    workshop: "3号车间",
    state: "carry",
    stateLabel: "跨日继续",
    currentSequence: 2,
    order: "ORD-0629-007",
    customer: "马俊",
    product: "同行来料印刷",
    type: "外加工",
    spec: "40×32×10 · 牛仔蓝 · 普通提",
    visual: {
      bagLabel: "牛仔蓝",
      bagHex: "#3f6384",
      bagSideHex: "#24435b",
      handleLabel: "牛仔蓝",
      handleType: "普通提",
      handleHex: "#3f6384",
      outlineHex: "#1e3a50",
      printLabel: "白色 · 单面",
      printHex: "#f5f5ef",
      artworkLine1: "同行",
      artworkLine2: "来料印刷",
      artworkState: "来料图稿已确认 · V1",
    },
    planned: 2600,
    done: 1980,
    eta: "预计今天 11:00",
    etaBasis: "试算",
    delivery: "明天 10:00",
    reason: "跨日继续",
    next: "王芳 · 红色定制",
    queue: [
      ["王芳", "红色定制袋 · 30×38×10", "预计今天 16:00", 1500, "定制单", [], { product: "", color: "黄印红" }],
      ["赵倩", "黑马二批 · 45×37×10", "预计明天 09:00", 1800, "定制单", [], { product: "黑马二批", color: "白印黑" }],
      ["孙玲", "京东电器 · 30×38×10", "预计明天 14:00", 2400, "定制单", [], { product: "京东电器", color: "黑印红" }],
    ],
  },
  {
    id: "BAG-09",
    short: "9 号机",
    workshop: "3号车间",
    state: "idle",
    stateLabel: "待机",
    order: "",
    customer: "等待已发布任务",
    product: "暂无当前任务",
    type: "待机",
    spec: "—",
    planned: 0,
    done: 0,
    eta: "—",
    etaBasis: "",
    delivery: "—",
    reason: "暂无已发布排产",
    next: "办公室发布后自动显示",
    queue: [],
  },
];

const silkStations = [
  {
    marker: 1,
    code: "印1-01",
    name: "丝印 1 号机",
    state: "生产中",
    officeStatus: "正在印",
    officeTime: "预计今天 16:30",
    customer: "马俊",
    task: "同行来料印刷",
    print: "蓝红双色 · 单面",
    spec: "30×38×10 · 白色",
    visual: {
      bagLabel: "白色",
      materialSource: "来料",
      bagHex: "#ffffff",
      handleLabel: "白色",
      handleType: "普通提",
      handleHex: "#ffffff",
      printLabel: "蓝色 + 红色 · 单面",
      printHex: "#3f6384",
      printColors: ["#3f6384", "#e52124"],
      artworkLine1: "同行",
      artworkLine2: "来料印刷",
      artworkState: "图稿已确认 · V2",
    },
    done: 980,
    planned: 2600,
  },
  {
    marker: 2,
    code: "印2-01",
    name: "丝印 2 号机",
    state: "生产中",
    officeStatus: "正在印",
    officeTime: "预计今天 18:00",
    customer: "刘晓燕",
    task: "外卖活动袋",
    print: "黑红白多色 · 单面",
    spec: "40×30×10 · 黄色",
    visual: {
      bagLabel: "黄色",
      bagHex: "#f2ba22",
      handleLabel: "黄色（默认）",
      handleType: "普通提",
      handleHex: "#f2ba22",
      printLabel: "黑色 + 红色 + 白色 · 单面",
      printHex: "#20242a",
      printColors: ["#20242a", "#e52124", "#f5f5ef"],
      artworkLine1: "外卖",
      artworkLine2: "活动袋",
      artworkState: "图稿已确认 · V4",
    },
    done: 1440,
    planned: 3000,
  },
  {
    marker: 3,
    code: "印3-01",
    name: "丝印 3 号机",
    state: "生产中",
    officeStatus: "正在印",
    officeTime: "预计今天 15:40",
    customer: "孙玲",
    task: "京东电器",
    print: "黑墨 · 单面",
    spec: "30×38×10 · 红色",
    visual: {
      bagLabel: "红色",
      bagHex: "#e52124",
      handleLabel: "红色",
      handleType: "普通提",
      handleHex: "#e52124",
      printLabel: "黑色 · 单面",
      printHex: "#20242a",
      printColors: ["#20242a"],
      artworkLine1: "京东",
      artworkLine2: "电器",
      artworkState: "图稿已确认 · V2",
    },
    done: 1420,
    planned: 2400,
  },
  { marker: 4, code: "印4-01", name: "丝印 4 号机", state: "待机", officeStatus: "待印", officeTime: "最晚明天 18:00", task: "同行来料蓝印", print: "下一单 印4-01 同行来料蓝印", done: 0, planned: 0 },
];

const silkPool = [
  {
    marker: 1,
    code: "印1-02",
    customer: "王芳",
    product: "美的空调",
    spec: "30×38×10 · 白袋 · 黄墨双面 · 1,000",
    shipAt: "23日 18:00",
    shipRemaining: "2天4时",
    shipRemainingMinutes: 3120,
    printDeadline: "明天 12:00",
    downstreamBuffer: "预留制袋 1天6时",
  },
  {
    marker: 1,
    code: "印1-03",
    customer: "张丽",
    product: "红色定制袋",
    spec: "30×38×10 · 红袋 · 黄墨双面 · 1,500",
    shipAt: "25日 01:00",
    shipRemaining: "3天11时",
    shipRemainingMinutes: 4980,
    printDeadline: "23日 18:00",
    downstreamBuffer: "预留制袋 1天7时",
  },
  {
    marker: 2,
    code: "印2-02",
    customer: "赵倩",
    product: "黑马二批",
    spec: "45×37×10 · 黑袋 · 白墨单面 · 1,800",
    shipAt: "24日 18:00",
    shipRemaining: "3天4时",
    shipRemainingMinutes: 4560,
    printDeadline: "23日 08:00",
    downstreamBuffer: "预留制袋 1天10时",
  },
  {
    marker: 2,
    code: "印2-03",
    customer: "孙玲",
    product: "白鲸活动袋",
    spec: "35×27×10 · 白袋 · 黑墨单面 · 1,500",
    shipAt: "26日 17:00",
    shipRemaining: "5天3时",
    shipRemainingMinutes: 7380,
    printDeadline: "25日 10:00",
    downstreamBuffer: "预留制袋 1天7时",
  },
  {
    marker: 3,
    code: "印3-02",
    customer: "孙玲",
    product: "京东电器",
    spec: "30×38×10 · 红袋 · 黑墨单面 · 2,400",
    shipAt: "25日 16:00",
    shipRemaining: "4天1时",
    shipRemainingMinutes: 5820,
    printDeadline: "24日 12:00",
    downstreamBuffer: "预留制袋 1天4时",
  },
  {
    marker: 3,
    code: "印3-03",
    customer: "周燕",
    product: "喜字袋",
    spec: "35×41×12 · 红袋 · 金墨双面 · 1,200",
    shipAt: "26日 23:00",
    shipRemaining: "5天9时",
    shipRemainingMinutes: 7740,
    printDeadline: "25日 18:00",
    downstreamBuffer: "预留制袋 1天5时",
  },
  {
    marker: 4,
    code: "印4-01",
    customer: "马俊",
    product: "同行来料蓝印",
    spec: "35×27×10 · 浅蓝料 · 蓝墨单面 · 1,800",
    shipAt: "23日 10:00",
    shipRemaining: "1天19时",
    shipRemainingMinutes: 2580,
    printDeadline: "明天 18:00",
    downstreamBuffer: "外加工 · 无制袋工序",
  },
  {
    marker: 4,
    code: "印4-02",
    customer: "赵倩",
    product: "黑马三批",
    spec: "40×32×10 · 黑袋 · 白墨单面 · 1,600",
    shipAt: "25日 21:00",
    shipRemaining: "4天7时",
    shipRemainingMinutes: 6180,
    printDeadline: "24日 15:00",
    downstreamBuffer: "预留制袋 1天6时",
  },
];

const unclaimedSilkPool = [
  {
    customer: urgentProductionOrder.customer,
    product: urgentProductionOrder.product,
    priority: urgentProductionOrder.priority,
    spec: urgentProductionOrder.silkSpec,
    shipRemaining: "1天6时",
    printDeadline: "今天 20:00",
  },
  {
    customer: "黄秀兰",
    product: "福字追加单",
    spec: "35×41×12 · 红袋 · 金墨双面 · 1,200",
    shipRemaining: "1天18时",
    printDeadline: "明天 10:00",
  },
  {
    customer: "陈敏",
    product: "童装活动袋",
    spec: "40×32×10 · 粉袋 · 白墨单面 · 1,200",
    shipRemaining: "2天9时",
    printDeadline: "23日 14:00",
  },
  {
    customer: "吴洁",
    product: "年中促销袋",
    spec: "50×40×12 · 白袋 · 红墨双面 · 1,000",
    shipRemaining: "3天2时",
    printDeadline: "24日 11:00",
  },
];

const screens = [
  {
    id: "overview",
    group: "normal",
    number: "01",
    title: "今日总览",
    note: "九台制袋机与丝印任务池同屏",
    purpose: "远距第一眼判断全部车间当前状态、剩余量和后续两单。",
    verify: "九台机器的当前任务都显示本机今日绝对顺序；每条后续订单按序号、客户、可选品名、规格、颜色组合、数量、业务类型、特殊要求完整排成一行，无品名不占位，文字标签统一置于末端；最多两单队列直接延续编号且不重复解释排序；丝印区只回答是否已印、什么时候印、谁来印。",
    transition: "办公室发布排产后自动刷新。",
  },
  {
    id: "workshop-1",
    group: "normal",
    number: "02",
    title: "1号车间",
    note: "制袋 1–3 号机",
    purpose: "放大查看 1号车间三台机器的当前任务、订单袋型效果与后续三单。",
    verify: "当前单显示本机今日绝对顺序；后续三单统一按客户、可选品名、规格、颜色组合、数量和末端标签单行展示；袋型与小时级试算、完成与剩余量保持一屏。",
    transition: "从总览按固定轮播顺序进入。",
  },
  {
    id: "workshop-2",
    group: "normal",
    number: "03",
    title: "2号车间",
    note: "制袋 4–6 号机",
    purpose: "放大查看 2号车间的订单袋型效果，并让异常机器在队列内保留上下文。",
    verify: "异常仍与机器和订单绑定；后续三单沿用总览的统一单行订单语法，业务类型和有色文字特殊要求保持在末端。",
    transition: "异常时可被系统临时提升为重点屏。",
  },
  {
    id: "workshop-3",
    group: "normal",
    number: "04",
    title: "3号车间",
    note: "制袋 7–9 号机",
    purpose: "同时展示生产中、跨日继续和待机三种正常机器状态。",
    verify: "跨日任务置顶并显示袋型与小时级试算；后续三单沿用统一单行订单语法，待机不伪造下一单。",
    transition: "跨日时先进入跨日重点屏，再回到车间。",
  },
  {
    id: "silk-pool",
    group: "normal",
    number: "05",
    title: "丝印任务池",
    note: "四个工人竖区 + 独立未认领任务池",
    purpose: "像制袋车间一样逐列查看每名丝印工正在做的任务、定稿袋型和自己的后续顺序，并把无人接单的任务独立放在最右侧。",
    verify: "四个竖区互不混队；每区上方的当前任务直接从订单身份开始，右侧显示已审核定稿袋型，不重复显示“正在做”或当前编号行；下面直接接该工人的后续顺序，最右侧只显示尚未认领的任务。",
    transition: "认领后任务从未认领池移入对应工人竖区；开工、重排和完成后由服务器刷新。",
  },
  {
    id: "queue-change",
    group: "change",
    number: "06",
    title: "插单 / 顺序变更",
    note: "变更任务短时高亮",
    purpose: "办公室发布新顺序后，公开说明哪一单移动以及影响范围。",
    verify: "颜色之外保留“插单”和“顺序变更”文字。",
    transition: "提示保留一轮，随后回到最新稳定队列。",
  },
  {
    id: "exception",
    group: "change",
    number: "07",
    title: "异常暂停",
    note: "机器、公开异常与交期影响",
    purpose: "突出需要所有人知晓的生产暂停，但不暴露维修或办公室私密备注。",
    verify: "只显示公开异常类型、剩余与粗略交期影响。",
    transition: "恢复后进入恢复生产状态。",
  },
  {
    id: "recovered",
    group: "change",
    number: "08",
    title: "恢复生产",
    note: "恢复提示后继续当前任务",
    purpose: "确认机器已恢复并继续原任务，不让异常提示长期占屏。",
    verify: "恢复状态、当前任务与剩余量同时可见。",
    transition: "短时提示后回到车间稳定视图。",
  },
  {
    id: "handoff",
    group: "change",
    number: "09",
    title: "完工切换",
    note: "上一单完成，下一单成为当前",
    purpose: "明确完成结果和新的当前任务，避免只看到数字突然归零。",
    verify: "完成与下一单用文字区分，不依赖位置动画。",
    transition: "切换完成后回到最新总览。",
  },
  {
    id: "carry-over",
    group: "fallback",
    number: "10",
    title: "跨日继续",
    note: "昨日未完任务置顶",
    purpose: "新班次开始时先交代昨日完成、剩余和对后续任务的影响。",
    verify: "跨日任务先于新任务，不被新日期清空；完成后顺序沿用统一单行订单语法和本机绝对编号。",
    transition: "完成后按最新已发布顺序切换。",
  },
  {
    id: "loading",
    group: "fallback",
    number: "11",
    title: "首次载入",
    note: "稳定骨架，不闪烁旧数据",
    purpose: "电视启动时清楚说明正在读取已发布排产。",
    verify: "载入态无虚假任务和无意义动画。",
    transition: "读取成功进入总览；失败进入数据中断。",
  },
  {
    id: "offline",
    group: "fallback",
    number: "12",
    title: "数据中断",
    note: "保留最后数据，标记更新时间",
    purpose: "网络或服务中断时不把旧数据冒充实时状态。",
    verify: "最后更新时间和“停止更新”文字远距可见。",
    transition: "连接恢复后自动读取并进入最新总览。",
  },
  {
    id: "idle",
    group: "fallback",
    number: "13",
    title: "无已发布任务",
    note: "全部待机，不显示操作按钮",
    purpose: "已发布排产为空时给出稳定、诚实的公共状态。",
    verify: "不把草稿排产提前显示，也不在电视上要求工作人员操作。",
    transition: "办公室发布排产后自动进入总览。",
  },
  {
    id: "semantic-language",
    group: "system",
    number: "14",
    title: "全系统标签语言",
    note: "业务类型、特殊要求、状态与归属分层",
    purpose: "评审可下放到大屏、桌面和手机的统一语义标签语言，避免同一种颜色在不同页面表达不同意思。",
    verify: "业务类型、特殊要求、运行状态和人员归属各自回答一个问题；红色只表示阻塞或异常，颜色之外始终保留文字。",
    transition: "本规范确认后，先收口共享组件与语义变量，再按业务页面逐批迁移。",
  },
];

const groups = [
  {
    id: "normal",
    title: "稳定值守",
    description: "日常轮播覆盖总览、三个制袋车间和丝印任务池。",
  },
  {
    id: "change",
    title: "变化与恢复",
    description: "顺序、异常和完工发生时，先解释变化，再回到稳定队列。",
  },
  {
    id: "fallback",
    title: "跨日与兜底",
    description: "从开机载入到断网、跨日和无任务，所有边界都有明确状态。",
  },
  {
    id: "system",
    title: "统一语言",
    description: "把已经验证清楚的任务标签整理成可复用的全系统语义规范。",
  },
];

const app = document.querySelector("#app");
let activeScreenId = "overview";

const getParams = () => new URLSearchParams(window.location.search);
const getScreen = (id) => screens.find((screen) => screen.id === id) || screens[0];
const clampProgress = (done, planned) => (planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0);
const remaining = (machine) => Math.max(0, machine.planned - machine.done);
const formatNumber = (value) => new Intl.NumberFormat("zh-CN").format(value);
const etaLabel = (machine) => (machine.etaBasis ? `${machine.eta} · ${machine.etaBasis}` : machine.eta);

function statusClass(state) {
  if (state === "paused") return "danger";
  if (state === "carry") return "warning";
  if (state === "idle") return "muted";
  return "success";
}

function semanticStateValue(state) {
  if (state === "paused") return "blocked";
  if (state === "carry") return "carry";
  if (state === "idle") return "idle";
  return "running";
}

function queueKindClass(kind) {
  if (kind === "现货通货") return "stock";
  if (kind === "印刷通货") return "printed";
  if (kind === "外加工") return "outsourced";
  return "custom";
}

function machineOrderKind(machine) {
  if (machine.type === "外加工") return "外加工";
  if (machine.type === "定制印刷") return "定制单";
  return "现货通货";
}

function queueSpecialClass(label) {
  if (label === "加长提") return "extended";
  if (label === "按扣") return "snap";
  if (label === "来料" || label === "来料加工") return "material";
  if (label === "加急") return "urgent";
  if (label === "双色") return "dual-print";
  if (label === "多色") return "multi-print";
  return "other";
}

function queueSpecialValue(label) {
  if (label === "加长提") return "extended-handle";
  if (label === "按扣") return "snap";
  if (label === "来料" || label === "来料加工") return "supplied-material";
  if (label === "加急") return "urgent";
  if (label === "双色") return "dual-color";
  if (label === "多色") return "multi-color";
  if (label === "双面印") return "double-sided";
  return "unknown";
}

function orderKindMarkup(kind) {
  const value = queueKindClass(kind);
  return `<span class="queue-kind queue-kind--${value}" data-kind="business" data-size="compact" data-value="${value}">${kind}</span>`;
}

function queueKindMarkup(task) {
  return orderKindMarkup(task[4]);
}

function specialTagsMarkup(labels = []) {
  return labels
    .map((label) => `<span class="queue-special queue-special--${queueSpecialClass(label)}" data-kind="requirement" data-size="compact" data-value="${queueSpecialValue(label)}">${label}</span>`)
    .join("");
}

function queueSpecialsMarkup(task) {
  return specialTagsMarkup(task[5] || []);
}

function machineSpecialsMarkup(machine, excludedLabels = []) {
  return specialTagsMarkup((machine.specials || []).filter((label) => !excludedLabels.includes(label)));
}

function machineHandleSpecialsMarkup(machine) {
  return specialTagsMarkup((machine.specials || []).filter((label) => label === "加长提"));
}

function printComplexityMarkup(visual) {
  const colorCount = visual.printColors?.length || 0;
  if (colorCount === 2) return specialTagsMarkup(["双色"]);
  if (colorCount >= 3) return specialTagsMarkup(["多色"]);
  return "";
}

function queueProduct(task) {
  return task[1].split(" · ")[0];
}

function queueDetails(task) {
  return task[1].split(" · ").slice(1).join(" · ");
}

function queueOverviewProduct(task) {
  return task[6]?.product ?? queueProduct(task);
}

function queueOverviewProductMarkup(task) {
  const product = queueOverviewProduct(task);
  return product ? `<span class="production-order-line__product">${product}</span>` : "";
}

function queueColor(task) {
  return task[6]?.color || "待确认";
}

function productionOrderLineMarkup(task, density = "compact") {
  return `
    <div class="production-order-line production-order-line--${density}">
      <strong class="production-order-line__customer">${task[0]}</strong>
      ${queueOverviewProductMarkup(task)}
      <span class="production-order-line__spec">${queueDetails(task)}</span>
      <span class="production-order-line__color">${queueColor(task)}</span>
      <span class="production-order-line__quantity">${formatNumber(task[3])}个</span>
      <span class="production-order-line__tags">
        ${queueKindMarkup(task)}
        ${queueSpecialsMarkup(task)}
      </span>
    </div>`;
}

function productionQueueRowMarkup(task, sequence, options = {}) {
  const density = options.density || "standard";
  const eta = options.showEta === false ? "" : `<span class="queue-row__eta">${task[2]}</span>`;
  return `
    <div class="queue-row">
      <span class="queue-row__index">${String(sequence).padStart(2, "0")}</span>
      ${productionOrderLineMarkup(task, density)}
      ${eta}
    </div>`;
}

function machineSetSpeedMarkup(machine) {
  const hasSetSpeed = Number.isFinite(machine.setSpeed);
  const displayValue = hasSetSpeed ? `${formatNumber(machine.setSpeed)}个/分` : "待读取";
  const missingClass = hasSetSpeed ? "" : " machine-set-speed--missing";
  return `
    <span class="machine-set-speed${missingClass}" aria-label="设定速度：${hasSetSpeed ? `${formatNumber(machine.setSpeed)} 个每分钟` : "待读取"}">
      <span>设定</span>
      <strong>${displayValue}</strong>
    </span>`;
}

function machineStateClusterMarkup(machine, stateLabel, stateTone) {
  return `
    <div class="machine-state-cluster">
      ${machineSetSpeedMarkup(machine)}
      <span class="status-text status-text--${stateTone}" data-kind="state" data-size="standard" data-value="${semanticStateValue(machine.state)}">${stateLabel}</span>
    </div>`;
}

function machineCard(machine, options = {}) {
  const changed = options.changed === machine.id;
  const cardState = changed ? "changed" : machine.state;
  const stateLabel = changed ? "插单 · 顺序变更" : machine.stateLabel;
  const stateTone = changed ? "warning" : statusClass(machine.state);
  const queuePreview = machine.queue.slice(0, 2);

  if (machine.state === "idle") {
    return `
      <article class="machine-card machine-card--idle">
        <div class="machine-card__top">
          <span class="machine-card__machine">${machine.short}</span>
          ${machineStateClusterMarkup(machine, stateLabel, "muted")}
        </div>
        <div class="machine-card__customer">${machine.customer}</div>
        <div class="machine-card__spec">${machine.reason}</div>
        <div class="machine-card__bottom">
          <span>下一任务</span><span>${machine.next}</span>
        </div>
      </article>`;
  }

  return `
    <article class="machine-card machine-card--${cardState}">
      <div class="machine-card__top">
        <div class="machine-card__position">
          <span class="machine-card__machine">${machine.short}</span>
          <span class="machine-card__sequence">今日第 ${machine.currentSequence} 单</span>
        </div>
        ${machineStateClusterMarkup(machine, stateLabel, stateTone)}
      </div>
      <div class="machine-card__identity">
        <strong>${machine.customer}</strong>
        <span>· ${machine.product}</span>
        ${orderKindMarkup(machineOrderKind(machine))}
        ${machineSpecialsMarkup(machine)}
      </div>
      <div class="machine-card__spec">
        <span>${machine.spec}</span>
      </div>
      <div class="progress-line">
        <div class="progress-track" aria-label="已完成 ${formatNumber(machine.done)}，计划 ${formatNumber(machine.planned)}">
          <div class="progress-track__fill" style="--progress: ${clampProgress(machine.done, machine.planned)}%"></div>
        </div>
        <span class="progress-line__numbers">${formatNumber(machine.done)} / ${formatNumber(machine.planned)}</span>
      </div>
      <div class="machine-card__bottom">
        <span>剩 ${formatNumber(remaining(machine))}</span>
        <span>${etaLabel(machine)}</span>
      </div>
      <div class="machine-card__queue" aria-label="后续已发布订单">
        ${queuePreview
          .map(
            (task, index) => `
              <div class="machine-card__queue-row">
                <span class="machine-card__queue-index">${String(machine.currentSequence + index + 1).padStart(2, "0")}</span>
                ${productionOrderLineMarkup(task, "compact")}
              </div>`,
          )
          .join("")}
      </div>
    </article>`;
}

function renderWorkshopPanel(workshopNumber, options = {}) {
  const workshopMachines = machines.filter((machine) => machine.workshop === `${workshopNumber}号车间`);
  return `
    <section class="workshop-panel">
      <div class="panel-head">
        <h2>${workshopNumber}号车间</h2>
        <span>制袋 ${workshopMachines[0].short.replace(" 号机", "")}–${workshopMachines[2].short}</span>
      </div>
      <div class="machine-stack">
        ${workshopMachines.map((machine) => machineCard(machine, options)).join("")}
      </div>
    </section>`;
}

function silkCodeLabel(code) {
  const parts = /^印(\d+)-(\d{2})$/.exec(code);
  return parts ? `印刷机 ${Number(parts[1])} 号机，第 ${parts[2]} 号单` : code;
}

function silkMarkerMarkup(marker, code) {
  return `<span class="silk-marker silk-marker--${marker}" aria-label="${silkCodeLabel(code)}"><span class="silk-marker__dot" aria-hidden="true"></span><span aria-hidden="true">${code}</span></span>`;
}

function silkPoolTaskMarkup(task, mode = "summary") {
  const fullMode = mode === "full";
  return `
    <div class="pool-task pool-task--${mode}">
      ${silkMarkerMarkup(task.marker, task.code)}
      <div class="pool-task__copy">
        <strong>${task.customer} · ${task.product}</strong>
        <p>${task.spec}</p>
        ${fullMode ? `<span class="pool-task__deadline">丝印最晚 ${task.printDeadline} · ${task.downstreamBuffer}</span>` : ""}
      </div>
      <div class="pool-task__countdown">
        <strong>距发货 ${task.shipRemaining}</strong>
        <span>${fullMode ? `发货 ${task.shipAt}` : `丝印最晚 ${task.printDeadline}`}</span>
      </div>
    </div>`;
}

function sortedSilkPool() {
  return [...silkPool].sort((taskA, taskB) => taskA.shipRemainingMinutes - taskB.shipRemainingMinutes || taskA.code.localeCompare(taskB.code, "zh-CN"));
}

function silkOfficeRowMarkup({ marker, code, task, status, time }) {
  const statusTone = status === "正在印" ? "printing" : status === "已印" ? "done" : "pending";
  return `
    <div class="silk-office-row silk-office-row--${statusTone}" aria-label="${silkCodeLabel(code)}，${task}，${status}，${time}">
      ${silkMarkerMarkup(marker, code)}
      <strong class="silk-office-row__task">${task}</strong>
      <div class="silk-office-row__state">
        <strong>${status}</strong>
        <span>${time}</span>
      </div>
    </div>`;
}

function renderSilkSummary() {
  const orderedTasks = sortedSilkPool();
  const currentCodes = new Set(silkStations.map((station) => station.code));
  const waitingTasks = orderedTasks.filter((task) => !currentCodes.has(task.code));
  const visibleNextTasks = waitingTasks.slice(0, 4);
  return `
    <section class="silk-panel">
      <div class="panel-head">
        <h2>丝印进度</h2>
        <span>已印 6 · 正在印 3 · 待印 ${orderedTasks.length}</span>
      </div>
      <div class="silk-panel__body silk-panel__body--office">
        <div class="silk-office-columns" aria-hidden="true">
          <span>谁来印</span><span>任务</span><span>状态 / 时间</span>
        </div>
        <section class="silk-office-section" aria-label="当前丝印任务">
          <div class="silk-office-section__title">
            <strong>当前</strong><span>3 项正在印 · 1 项待印</span>
          </div>
          ${silkStations
            .map((station) =>
              silkOfficeRowMarkup({
                marker: station.marker,
                code: station.code,
                task: station.task,
                status: station.officeStatus,
                time: station.officeTime,
              }),
            )
            .join("")}
        </section>
        <section class="silk-office-section silk-office-section--next" aria-label="接下来待印任务">
          <div class="silk-office-section__title">
            <strong>接下来</strong><span>按发货紧迫度</span>
          </div>
          ${visibleNextTasks
            .map((task) =>
              silkOfficeRowMarkup({
                marker: task.marker,
                code: task.code,
                task: `${task.customer} · ${task.product}`,
                status: "待印",
                time: `最晚${task.printDeadline}`,
              }),
            )
            .join("")}
          <div class="silk-office-more">另有 ${waitingTasks.length - visibleNextTasks.length} 项待印 · 丝印专页查看明细</div>
        </section>
      </div>
    </section>`;
}

function urgentOrderAlertMarkup() {
  return `
    <div class="tv-header__urgent" aria-label="加急订单，${urgentProductionOrder.customer}，${urgentProductionOrder.product}">
      ${specialTagsMarkup([urgentProductionOrder.priority])}
      <strong>${urgentProductionOrder.customer} · ${urgentProductionOrder.product}</strong>
    </div>`;
}

function tvHeader(scope, updateText = "最近更新 14:32", showUrgent = true) {
  return `
    <header class="tv-header${showUrgent ? " tv-header--urgent" : ""}">
      <div class="tv-header__title-line">
        <h1>生产看板</h1>
        <span class="tv-header__scope">${scope}</span>
      </div>
      ${showUrgent ? urgentOrderAlertMarkup() : ""}
      <div class="tv-header__meta">
        <span>7月21日 · 白班</span>
        <span class="number">${updateText}</span>
        <span class="tv-header__preview">方案预览 · 演示数据</span>
      </div>
    </header>`;
}

function tvFooter(message = "只读展示 · 排产与进度以服务器已发布数据为准") {
  return `
    <footer class="tv-footer">
      <div class="tv-footer__legend" aria-label="状态图例">
        <span class="legend-item legend-item--success">生产中</span>
        <span class="legend-item legend-item--warning">变更 / 跨日</span>
        <span class="legend-item legend-item--danger">异常暂停</span>
      </div>
      <span>${message}</span>
    </footer>`;
}

function tvShell({ scope, banner = null, content, footerMessage, updateText, showUrgent = true }) {
  return `
    <section class="tv-stage" data-banner="${banner ? "shown" : "none"}" aria-label="生产电视大屏：${scope}">
      ${tvHeader(scope, updateText, showUrgent)}
      ${banner ? `<div class="tv-banner tv-banner--${banner.tone}"><span>${banner.title}</span><span>${banner.detail}</span></div>` : ""}
      <main class="tv-content${content.includes("loading-caption") ? " tv-content--relative" : ""}">${content}</main>
      ${tvFooter(footerMessage)}
    </section>`;
}

function renderOverview(changeMode = false) {
  const banner = changeMode
    ? {
        tone: "warning",
        title: "排产已更新 · 插单 / 顺序变更",
        detail: "黑马二批已移至 2号机当前任务 · 发布于 14:32",
      }
    : null;
  const content = `
    <div class="tv-overview">
      ${renderWorkshopPanel(1, { changed: changeMode ? "BAG-02" : "" })}
      ${renderWorkshopPanel(2)}
      ${renderWorkshopPanel(3)}
      ${renderSilkSummary()}
    </div>`;
  return tvShell({ scope: changeMode ? "今日总览 · 顺序已更新" : "今日总览", banner, content });
}

const bagTemplateConfigs = {
  "30×38×10": { key: "vertical-30x37", handleOrigin: "28.95%", regularScale: 0.767, extendedScale: 1.15 },
  "30×37×10": { key: "vertical-30x37", handleOrigin: "28.95%", regularScale: 0.767, extendedScale: 1.15 },
  "40×30×10": { key: "horizontal-40x30", handleOrigin: "38.92%", regularScale: 0.684, extendedScale: 1.025 },
  "40×32×10": { key: "horizontal-40x32", handleOrigin: "33.33%", regularScale: 0.853, extendedScale: 1.28 },
  "45×37×10": { key: "horizontal-45x37", handleOrigin: "37.16%", regularScale: 0.608, extendedScale: 0.912 },
  "50×40×12": { key: "horizontal-50x40", handleOrigin: "36.20%", regularScale: 0.652, extendedScale: 0.979 },
};

const bagTemplateColorFilters = {
  "#ffffff": "none",
  "#202323": "brightness(0) saturate(100%) invert(9%) sepia(4%) saturate(1209%) hue-rotate(131deg) brightness(93%) contrast(88%)",
  "#e52124": "brightness(0) saturate(100%) invert(20%) sepia(100%) saturate(2731%) hue-rotate(346deg) brightness(91%) contrast(99%)",
  "#f2ba22": "brightness(0) saturate(100%) invert(81%) sepia(75%) saturate(3820%) hue-rotate(340deg) brightness(98%) contrast(93%)",
  "#e7a3b6": "brightness(0) saturate(100%) invert(69%) sepia(53%) saturate(252%) hue-rotate(295deg) brightness(96%) contrast(88%)",
  "#d9c7a7": "brightness(0) saturate(100%) invert(89%) sepia(18%) saturate(399%) hue-rotate(356deg) brightness(89%) contrast(89%)",
  "#e9e1cf": "brightness(0) saturate(100%) invert(98%) sepia(4%) saturate(1110%) hue-rotate(333deg) brightness(97%) contrast(89%)",
  "#b49c70": "brightness(0) saturate(100%) invert(68%) sepia(4%) saturate(3543%) hue-rotate(0deg) brightness(95%) contrast(80%)",
  "#3f6384": "brightness(0) saturate(100%) invert(39%) sepia(5%) saturate(3978%) hue-rotate(168deg) brightness(87%) contrast(88%)",
};

function bagTemplateFilter(hex) {
  return bagTemplateColorFilters[String(hex || "").toLowerCase()] || "none";
}

function bagPreviewMarkup(machine, options = {}) {
  const visual = machine.visual;
  if (!visual) return "";

  const hasPrint = visual.printLabel !== "无印刷";
  const printColors = visual.printColors?.length ? visual.printColors : [visual.printHex];
  const size = machine.spec.split(" · ")[0];
  const template = bagTemplateConfigs[size] || bagTemplateConfigs["40×30×10"];
  const handleScale = visual.handleType.includes("长") ? template.extendedScale : template.regularScale;
  const templatePath = `./assets/bag-templates/${template.key}`;
  const artMarkup = hasPrint
    ? `<div class="bag-preview__artwork" style="--print-ink-primary: ${printColors[0]}; --print-ink-secondary: ${printColors[1] || printColors[0]}; --print-ink-accent: ${printColors[2] || "transparent"}"><strong>${visual.artworkLine1}</strong><span>${visual.artworkLine2}</span>${printColors.length >= 3 ? '<i class="bag-preview__artwork-accent" aria-hidden="true"></i>' : ""}</div>`
    : "";
  const modifier = options.compact ? " bag-preview--silk" : "";

  return `
    <figure class="bag-preview${modifier}" aria-label="订单效果示意：${visual.bagLabel}袋，${visual.handleLabel}${visual.handleType}，${visual.printLabel}">
      <div class="bag-preview__canvas" role="img" aria-hidden="true" style="--body-filter: ${bagTemplateFilter(visual.bagHex)}; --handle-filter: ${bagTemplateFilter(visual.handleHex)}; --handle-scale: ${handleScale}; --handle-origin: ${template.handleOrigin}">
        <img class="bag-preview__layer bag-preview__body-color" src="${templatePath}-body.png" alt="" />
        <img class="bag-preview__layer bag-preview__body-texture" src="${templatePath}-body.png" alt="" />
        <img class="bag-preview__layer bag-preview__handle-color" src="${templatePath}-handles.png" alt="" />
        <img class="bag-preview__layer bag-preview__handle-texture" src="${templatePath}-handles.png" alt="" />
        ${artMarkup}
      </div>
    </figure>`;
}

function currentTaskMarkup(machine) {
  const visual = machine.visual;
  const hasExtendedHandle = (machine.specials || []).includes("加长提");
  return `
    <div class="current-task">
      <div class="current-task__label">
        <span>当前任务 · 今日第 ${machine.currentSequence} 单 · ${machine.reason}</span>
      </div>
      <div class="current-task__identity">
        <div class="current-task__copy">
          <div class="current-task__heading">
            <h3>${machine.customer} · ${machine.product}</h3>
            ${orderKindMarkup(machineOrderKind(machine))}
            ${machineSpecialsMarkup(machine, ["加长提"])}
          </div>
          <dl class="task-facts" aria-label="订单生产明细">
            <div class="task-fact"><dt>规格</dt><dd>${machine.spec.split(" · ")[0]}</dd></div>
            <div class="task-fact"><dt>袋身</dt><dd>${visual.bagLabel}</dd></div>
            <div class="task-fact task-fact--handle"><dt>提手</dt><dd><span class="task-fact__value">${visual.handleLabel}${hasExtendedHandle ? "" : ` · ${visual.handleType}`}</span>${machineHandleSpecialsMarkup(machine)}</dd></div>
            <div class="task-fact"><dt>印刷</dt><dd>${visual.printLabel}</dd></div>
          </dl>
        </div>
        ${bagPreviewMarkup(machine)}
      </div>
      <div class="progress-large">
        <div class="progress-large__summary">
          <div class="progress-large__quantity">
            <span>已完成</span>
            <strong>${formatNumber(machine.done)}</strong>
            <span class="progress-large__plan">计划 ${formatNumber(machine.planned)}</span>
          </div>
          <div class="progress-large__meta">
            <strong>剩余 ${formatNumber(remaining(machine))}</strong>
            <span>${etaLabel(machine)}</span>
          </div>
        </div>
        <div class="progress-track" aria-label="已完成 ${formatNumber(machine.done)}，计划 ${formatNumber(machine.planned)}">
          <div class="progress-track__fill" style="--progress: ${clampProgress(machine.done, machine.planned)}%"></div>
        </div>
      </div>
    </div>`;
}

function queueMarkup(machine) {
  if (!machine.queue.length) {
    return `<div class="queue-list"><div class="queue-list__title">下一任务</div><div class="queue-row queue-row--empty"><span class="queue-row__index">—</span><div class="queue-row__empty"><strong>暂无已发布任务</strong><span>办公室发布后自动显示</span></div><span class="queue-row__eta">—</span></div></div>`;
  }
  return `
    <div class="queue-list">
      <div class="queue-list__title">下一任务</div>
      ${machine.queue
        .map((task, index) => productionQueueRowMarkup(task, machine.currentSequence + index + 1))
        .join("")}
    </div>`;
}

function renderWorkshopDetail(workshopNumber) {
  const workshopMachines = machines.filter((machine) => machine.workshop === `${workshopNumber}号车间`);
  const first = workshopMachines[0].short.replace(" 号机", "");
  const last = workshopMachines[2].short.replace(" 号机", "");
  const content = `
    <div class="workshop-detail">
      ${workshopMachines
        .map(
          (machine) => `
            <section class="machine-detail">
              <div class="machine-detail__head">
                <h2>制袋 ${machine.short}</h2>
                ${machineStateClusterMarkup(machine, machine.stateLabel, statusClass(machine.state))}
              </div>
              ${machine.state === "idle" ? `<div class="current-task"><div class="current-task__label"><span>当前任务</span></div><h3>暂无已发布任务</h3><p class="current-task__product">办公室发布后自动显示</p></div>` : currentTaskMarkup(machine)}
              ${queueMarkup(machine)}
            </section>`,
        )
        .join("")}
    </div>`;
  return tvShell({ scope: `${workshopNumber}号车间 · 制袋 ${first}–${last} 号机`, content });
}

function silkTaskIdentityMarkup(task) {
  const hasProduct = Boolean(task.product);
  const hasPriority = Boolean(task.priority);
  const modifier = hasPriority ? (hasProduct ? " silk-task-identity--tagged" : " silk-task-identity--tag-only") : "";
  return `
    <div class="silk-task-identity${modifier}">
      <strong class="silk-task-identity__customer">${task.customer}</strong>
      ${
        hasProduct
          ? `<span class="silk-task-identity__separator" aria-hidden="true">·</span><span class="silk-task-identity__product">${task.product}</span>`
          : ""
      }
      ${hasPriority ? specialTagsMarkup([task.priority]) : ""}
    </div>`;
}

function silkLaneTaskMarkup(task) {
  return `
    <article class="silk-lane-task" aria-label="${silkCodeLabel(task.code)}，${task.customer}，${task.product}${task.priority ? `，${task.priority}` : ""}，距发货 ${task.shipRemaining}">
      <div class="silk-lane-task__top">
        ${silkMarkerMarkup(task.marker, task.code)}
        <span class="silk-task-countdown">距发货 ${task.shipRemaining}</span>
      </div>
      ${silkTaskIdentityMarkup(task)}
      <p>${task.spec}</p>
    </article>`;
}

function unclaimedSilkTaskMarkup(task) {
  return `
    <article class="silk-unclaimed-task" aria-label="待认领，${task.customer}，${task.product}${task.priority ? `，${task.priority}` : ""}，距发货 ${task.shipRemaining}">
      <div class="silk-unclaimed-task__top">
        <span class="silk-unclaimed-task__status">待认领</span>
        <span class="silk-task-countdown">距发货 ${task.shipRemaining}</span>
      </div>
      ${silkTaskIdentityMarkup(task)}
      <p>${task.spec}</p>
    </article>`;
}

function silkProofMarkup(station) {
  if (!station.visual) {
    return `<div class="silk-lane-proof-pending" aria-label="定稿图待确认"><strong>待定稿</strong></div>`;
  }
  return bagPreviewMarkup(station, { compact: true });
}

function renderSilkDetail() {
  const content = `
    <div class="silk-lane-board">
      ${silkStations
        .map((station) => {
          const personalTasks = silkPool.filter((task) => task.marker === station.marker).sort((taskA, taskB) => taskA.code.localeCompare(taskB.code, "zh-CN"));
          return `
            <section class="silk-worker-lane silk-worker-lane--${station.marker}">
              <div class="silk-worker-lane__head">
                <h2>${station.name}</h2>
                <span class="status-text status-text--${station.planned ? "success" : "muted"}">${station.state}</span>
              </div>
              <div class="silk-lane-current${station.planned ? "" : " silk-lane-current--idle"}">
                ${
                  station.planned
                    ? `<div class="silk-lane-current__body">
                         <div class="silk-lane-current__identity">
                           <strong class="silk-lane-current__customer">${station.customer}</strong>
                           ${station.task ? `<span class="silk-lane-current__product">${station.task}</span>` : ""}
                         </div>
                         ${silkProofMarkup(station)}
                       </div>
                       <dl class="silk-lane-current__facts" aria-label="当前丝印订单明细">
                         <div><dt>规格</dt><dd>${station.spec.split(" · ")[0]}</dd></div>
                         <div${station.visual.materialSource ? ' class="silk-lane-current__fact--material"' : ""}><dt>袋身</dt><dd><span class="silk-lane-current__fact-value">${station.visual.bagLabel}</span>${station.visual.materialSource ? specialTagsMarkup([station.visual.materialSource]) : ""}</dd></div>
                         <div class="silk-lane-current__fact--print"><dt>印刷</dt><dd><span class="silk-lane-current__fact-value">${station.visual.printLabel}</span>${printComplexityMarkup(station.visual)}</dd></div>
                       </dl>
                       <div class="silk-lane-current__progress">
                         <div class="progress-track" aria-label="已完成 ${formatNumber(station.done)}，计划 ${formatNumber(station.planned)}">
                           <div class="progress-track__fill" style="--progress: ${clampProgress(station.done, station.planned)}%"></div>
                         </div>
                         <div><span>已完成 ${formatNumber(station.done)}</span><span>计划 ${formatNumber(station.planned)}</span></div>
                       </div>
                       <span class="silk-lane-current__time">${station.officeTime}</span>`
                    : `<div class="silk-lane-current__empty"><strong>暂无正在做的任务</strong><span>下一单已在自己的任务中</span></div>`
                }
              </div>
              <div class="silk-lane-queue">
                ${personalTasks.map((task) => silkLaneTaskMarkup(task)).join("")}
              </div>
            </section>`;
        })
        .join("")}
      <aside class="silk-unclaimed-pool">
        <div class="silk-unclaimed-pool__head">
          <div><h2>未认领任务池</h2><span>尚未有人接单</span></div>
          <strong>${unclaimedSilkPool.length} 项</strong>
        </div>
        <div class="silk-unclaimed-pool__body">
          ${unclaimedSilkPool.map((task) => unclaimedSilkTaskMarkup(task)).join("")}
        </div>
      </aside>
    </div>`;
  return tvShell({ scope: "丝印车间 · 今日任务池", content });
}

function renderException() {
  const machine = machines.find((item) => item.id === "BAG-06");
  const content = `
    <div class="focus-layout">
      <section class="focus-panel focus-panel--danger">
        <span class="focus-panel__status">2号车间 · 制袋 6 号机 · 异常暂停</span>
        <h2>设备暂停，当前任务保留</h2>
        <p class="focus-panel__product">${machine.customer} · ${machine.product}</p>
        <div class="focus-facts">
          <div class="focus-fact"><span>产品规格</span><strong>${machine.spec}</strong></div>
          <div class="focus-fact"><span>计划 / 已完成</span><strong>${formatNumber(machine.planned)} / ${formatNumber(machine.done)}</strong></div>
          <div class="focus-fact"><span>剩余</span><strong>${formatNumber(remaining(machine))}</strong></div>
          <div class="focus-fact"><span>交期影响</span><strong>预计延至今天 23:00 · 异常重算</strong></div>
        </div>
        <div class="focus-message">
          <strong>公开状态：等待设备恢复</strong>
          <p>维修过程、责任判断和办公室内部备注不在公共电视展示。</p>
        </div>
      </section>
      <aside class="side-panel">
        <div class="panel-head"><h2>同车间其他机器</h2><span>继续生产</span></div>
        <div class="side-panel__body">
          <div class="side-record"><span>制袋 4 号机 · 生产中</span><strong>刘晓燕 · 外卖活动袋</strong></div>
          <div class="side-record"><span>制袋 5 号机 · 生产中</span><strong>陈敏 · 服装长提</strong></div>
          <div class="side-record"><span>下一状态</span><strong>设备恢复后继续原任务</strong></div>
        </div>
      </aside>
    </div>`;
  return tvShell({
    scope: "异常重点",
    banner: { tone: "danger", title: "制袋 6 号机 · 异常暂停", detail: "公开状态已更新 · 14:34" },
    content,
  });
}

function renderRecovered() {
  const machine = { ...machines.find((item) => item.id === "BAG-06"), state: "running", stateLabel: "已恢复生产", done: 896 };
  const content = `
    <div class="focus-layout">
      <section class="focus-panel focus-panel--success">
        <span class="focus-panel__status">2号车间 · 制袋 6 号机 · 已恢复生产</span>
        <h2>继续原任务</h2>
        <p class="focus-panel__product">${machine.customer} · ${machine.product}</p>
        <div class="focus-facts">
          <div class="focus-fact"><span>产品规格</span><strong>${machine.spec}</strong></div>
          <div class="focus-fact"><span>计划 / 已完成</span><strong>${formatNumber(machine.planned)} / ${formatNumber(machine.done)}</strong></div>
          <div class="focus-fact"><span>剩余</span><strong>${formatNumber(remaining(machine))}</strong></div>
          <div class="focus-fact"><span>预计完成</span><strong>${etaLabel(machine)}</strong></div>
        </div>
        <div class="progress-large">
          <div class="progress-track"><div class="progress-track__fill" style="--progress: ${clampProgress(machine.done, machine.planned)}%"></div></div>
        </div>
      </section>
      <aside class="side-panel">
        <div class="panel-head"><h2>后续任务</h2><span>已发布顺序</span></div>
        <div class="side-panel__body">
          <div class="side-record"><span>当前</span><strong>${machine.customer} · ${machine.product}</strong></div>
          <div class="side-record"><span>下一单</span><strong>周燕 · 喜字袋</strong></div>
          <div class="side-record"><span>状态说明</span><strong>恢复提示一轮后回到车间屏</strong></div>
        </div>
      </aside>
    </div>`;
  return tvShell({
    scope: "恢复重点",
    banner: { tone: "success", title: "制袋 6 号机已恢复生产", detail: "继续原任务 · 14:46" },
    content,
  });
}

function renderHandoff() {
  const content = `
    <div class="handoff-compare">
      <section class="handoff-card handoff-card--complete">
        <span class="handoff-card__label">刚刚完工 · 制袋 1 号机</span>
        <h2>王芳 · 美的空调</h2>
        <p>计划 1,000 · 已完成 1,000 · 状态：本单完成</p>
      </section>
      <div class="handoff-arrow" aria-hidden="true">切换</div>
      <section class="handoff-card handoff-card--next handoff-card--urgent">
        <span class="handoff-card__label">新的当前任务 · 加急排产</span>
        <h2>${urgentProductionOrder.customer} · ${urgentProductionOrder.product}</h2>
        <div class="handoff-card__tags">${orderKindMarkup(urgentProductionOrder.type)}${specialTagsMarkup([urgentProductionOrder.priority])}</div>
        <p>${urgentProductionOrder.size} · ${urgentProductionOrder.color} · 计划 ${formatNumber(urgentProductionOrder.planned)} · ${urgentProductionOrder.eta} · 试算</p>
      </section>
    </div>`;
  return tvShell({
    scope: "完工切换",
    banner: { tone: "success", title: "制袋 1 号机 · 本单已完成", detail: `${urgentProductionOrder.priority}单已成为当前任务` },
    content,
  });
}

function renderCarryOver() {
  const machine = machines.find((item) => item.id === "BAG-08");
  const content = `
    <div class="carry-over-layout">
      <section class="carry-summary">
        <span>跨日继续 · 3号车间 · 制袋 8 号机</span>
        <h2>${machine.customer}</h2>
        <p>${machine.product} · ${machine.spec}</p>
        <div class="carry-metrics">
          <div class="carry-metric"><span>计划</span><strong>${formatNumber(machine.planned)}</strong></div>
          <div class="carry-metric"><span>昨日完成</span><strong>${formatNumber(machine.done)}</strong></div>
          <div class="carry-metric"><span>今日剩余</span><strong>${formatNumber(remaining(machine))}</strong></div>
        </div>
      </section>
      <section class="carry-queue">
        <div class="panel-head"><h2>完成后顺序</h2><span>已发布排产</span></div>
        <div class="carry-queue__body">
          ${machine.queue
            .map((task, index) => productionQueueRowMarkup(task, machine.currentSequence + index + 1))
            .join("")}
        </div>
      </section>
    </div>`;
  return tvShell({
    scope: "跨日继续",
    banner: { tone: "warning", title: "昨日未完成任务已置顶", detail: "完成后再进入今日已发布顺序" },
    content,
  });
}

function renderLoading() {
  const content = `
    <div class="loading-layout" aria-busy="true" aria-label="正在读取已发布排产">
      ${Array.from({ length: 4 }, () => `<section class="skeleton-panel"><div class="skeleton-line skeleton-line--short"></div><div class="skeleton-line skeleton-line--medium"></div><div class="skeleton-block"></div><div class="skeleton-block"></div></section>`).join("")}
    </div>
    <div class="loading-caption">正在读取已发布排产…</div>`;
  return tvShell({ scope: "正在载入", content, footerMessage: "只读展示 · 尚未显示任何未确认任务", showUrgent: false });
}

function renderOffline() {
  const content = `
    <div class="offline-layout">
      <div class="tv-overview" aria-hidden="true">
        ${renderWorkshopPanel(1)}${renderWorkshopPanel(2)}${renderWorkshopPanel(3)}${renderSilkSummary()}
      </div>
      <section class="offline-notice">
        <h2>数据已停止更新</h2>
        <p>当前保留 14:32 的最后一次成功数据。连接恢复后会自动读取最新已发布排产。</p>
      </section>
    </div>`;
  return tvShell({
    scope: "数据中断",
    banner: { tone: "danger", title: "连接中断 · 当前不是实时状态", detail: "最后成功更新 14:32" },
    content,
    updateText: "停止更新 14:32",
    footerMessage: "只读展示 · 当前内容为最后一次成功数据",
  });
}

function renderIdle() {
  const content = `
    <div class="idle-layout">
      <section class="idle-message">
        <span>当前状态 · 无已发布排产</span>
        <h2>等待办公室发布下一批任务</h2>
        <p>草稿排产不会提前显示。发布成功后，电视将自动进入今日总览。</p>
      </section>
      <section class="idle-machines">
        <div class="panel-head"><h2>设备状态</h2><span>全部待机</span></div>
        <div class="idle-machines__body">
          ${machines.map((machine) => `<div class="idle-machine">制袋 ${machine.short}<br />待机</div>`).join("")}
        </div>
      </section>
    </div>`;
  return tvShell({ scope: "无已发布任务", content, footerMessage: "只读展示 · 不显示草稿排产", showUrgent: false });
}

const semanticTagContract = Object.freeze({
  "business-custom": ["business", "custom"],
  "business-stock": ["business", "stock"],
  "business-printed": ["business", "printed"],
  "business-outsourced": ["business", "outsourced"],
  "requirement-attention": ["requirement", "extended-handle"],
  "requirement-feature": ["requirement", "snap"],
  "requirement-material": ["requirement", "supplied-material"],
  "requirement-print": ["requirement", "double-sided"],
  "state-running": ["state", "running"],
  "state-pending": ["state", "pending"],
  "state-blocked": ["state", "blocked"],
  "state-done": ["state", "done"],
  "owner-1": ["owner", "lane-1"],
  "owner-2": ["owner", "lane-2"],
  "owner-3": ["owner", "lane-3"],
  "owner-4": ["owner", "lane-4"],
});

function semanticTag(label, className, size = "default") {
  const [kind, value] = semanticTagContract[className] || ["state", "unknown"];
  const semanticSize = size === "large" ? "prominent" : size === "compact" ? "compact" : "standard";
  return `<span class="semantic-tag semantic-tag--${className} semantic-tag--${size}" data-kind="${kind}" data-size="${semanticSize}" data-value="${value}">${label}</span>`;
}

function renderSemanticLanguage() {
  const content = `
    <div class="semantic-board">
      <section class="semantic-catalog" aria-label="四类语义标签">
        <header class="semantic-catalog__intro">
          <div>
            <span>统一规则</span>
            <h2>先回答“这是什么”，再标“要注意什么”</h2>
          </div>
          <p>同一业务含义始终使用同一文字、色彩和顺序，不因大屏、桌面或手机而改变。</p>
        </header>

        <article class="semantic-spec-row">
          <div class="semantic-spec-row__identity">
            <span class="semantic-spec-row__number">01</span>
            <div><h3>业务类型</h3><p>回答：这是什么单</p></div>
          </div>
          <div class="semantic-spec-row__samples">
            ${semanticTag("定制单", "business-custom")}
            ${semanticTag("现货通货", "business-stock")}
            ${semanticTag("印刷通货", "business-printed")}
            ${semanticTag("外加工", "business-outsourced")}
          </div>
          <p class="semantic-spec-row__rule">固定放在客户/品名之后；不可用“生产中”等状态色代替。</p>
        </article>

        <article class="semantic-spec-row">
          <div class="semantic-spec-row__identity">
            <span class="semantic-spec-row__number">02</span>
            <div><h3>特殊要求</h3><p>回答：生产要特别做什么</p></div>
          </div>
          <div class="semantic-spec-row__samples">
            ${semanticTag("加长提", "requirement-attention")}
            ${semanticTag("按扣", "requirement-feature")}
            ${semanticTag("来料加工", "requirement-material")}
            ${semanticTag("双面印", "requirement-print")}
          </div>
          <p class="semantic-spec-row__rule">只标会改变生产动作的要求；产品特征不使用异常红。</p>
        </article>

        <article class="semantic-spec-row">
          <div class="semantic-spec-row__identity">
            <span class="semantic-spec-row__number">03</span>
            <div><h3>运行状态</h3><p>回答：现在做到哪一步</p></div>
          </div>
          <div class="semantic-spec-row__samples">
            ${semanticTag("生产中", "state-running")}
            ${semanticTag("待复核", "state-pending")}
            ${semanticTag("异常暂停", "state-blocked")}
            ${semanticTag("已完成", "state-done")}
          </div>
          <p class="semantic-spec-row__rule">蓝=正常，绿=进行，橙=跨日，黄=待处理，红=阻塞，灰绿=结束。</p>
        </article>

        <article class="semantic-spec-row">
          <div class="semantic-spec-row__identity">
            <span class="semantic-spec-row__number">04</span>
            <div><h3>人员 / 机台归属</h3><p>回答：谁来做</p></div>
          </div>
          <div class="semantic-spec-row__samples">
            ${semanticTag("印1-01", "owner-1")}
            ${semanticTag("印2-02", "owner-2")}
            ${semanticTag("印3-01", "owner-3")}
            ${semanticTag("印4-01", "owner-4")}
          </div>
          <p class="semantic-spec-row__rule">颜色只帮助扫视，编号必须始终可见；归属色绝不代表状态。</p>
        </article>
      </section>

      <aside class="semantic-guidance" aria-label="组合与密度规范">
        <section class="semantic-composition">
          <span class="semantic-guidance__eyebrow">标准组合</span>
          <h2>一行最多保留三种关键信息</h2>
          <div class="semantic-composition__customer">王芳</div>
          <div class="semantic-composition__product">美的空调 · 30×38×10 · 1,000 个</div>
          <div class="semantic-composition__tags">
            ${semanticTag("定制单", "business-custom")}
            ${semanticTag("按扣", "requirement-feature")}
            ${semanticTag("生产中", "state-running")}
          </div>
          <p>顺序固定：业务类型 → 特殊要求 → 当前状态。人员编号另起一处，不挤进业务标签组。</p>
        </section>

        <section class="semantic-density">
          <span class="semantic-guidance__eyebrow">三种密度</span>
          <div class="semantic-density__row">
            <div><strong>紧凑</strong><span>表格 / 电视队列</span></div>
            ${semanticTag("定制单", "business-custom", "compact")}
          </div>
          <div class="semantic-density__row">
            <div><strong>标准</strong><span>桌面详情 / 大屏主任务</span></div>
            ${semanticTag("定制单", "business-custom")}
          </div>
          <div class="semantic-density__row">
            <div><strong>醒目</strong><span>手机决策关键事实</span></div>
            ${semanticTag("定制单", "business-custom", "large")}
          </div>
        </section>

        <section class="semantic-guardrails">
          <span class="semantic-guidance__eyebrow">使用边界</span>
          <ul>
            <li><strong>文字优先</strong><span>任何状态都不能只靠颜色表达。</span></li>
            <li><strong>红色克制</strong><span>仅用于会阻断下一步的异常。</span></li>
            <li><strong>未知中性</strong><span>信息未确认时显示“待确认”，不猜类型。</span></li>
            <li><strong>卡片克制</strong><span>业务对象用卡片，属性只用小标签。</span></li>
          </ul>
        </section>
      </aside>
    </div>`;
  return tvShell({
    scope: "全系统语义标签规范",
    content,
    footerMessage: "评审规范 · 确认后由共享组件与语义变量统一下放",
  });
}

function renderTvScreen(id) {
  switch (id) {
    case "workshop-1":
      return renderWorkshopDetail(1);
    case "workshop-2":
      return renderWorkshopDetail(2);
    case "workshop-3":
      return renderWorkshopDetail(3);
    case "silk-pool":
      return renderSilkDetail();
    case "queue-change":
      return renderOverview(true);
    case "exception":
      return renderException();
    case "recovered":
      return renderRecovered();
    case "handoff":
      return renderHandoff();
    case "carry-over":
      return renderCarryOver();
    case "loading":
      return renderLoading();
    case "offline":
      return renderOffline();
    case "idle":
      return renderIdle();
    case "semantic-language":
      return renderSemanticLanguage();
    default:
      return renderOverview(false);
  }
}

function renderStageViewport(id, label) {
  return `<div class="stage-viewport" tabindex="0" aria-label="${label}">${renderTvScreen(id)}</div>`;
}

function renderAtlasCard(screen) {
  return `
    <article class="atlas-card">
      <div class="atlas-card__head">
        <div>
          <span class="atlas-card__number">画面 ${screen.number}</span>
          <h3 class="atlas-card__title">${screen.title}</h3>
        </div>
        <p class="atlas-card__note">${screen.note}</p>
      </div>
      ${renderStageViewport(screen.id, `${screen.title}电视画面预览`)}
      <a class="atlas-card__open" href="?mode=prototype&amp;screen=${screen.id}" aria-label="打开${screen.title}交互预览">打开</a>
    </article>`;
}

function renderAtlas() {
  app.innerHTML = `
    <div class="atlas">
      <header class="atlas__header">
        <div>
          <h1 class="atlas__title">生产电视大屏全流程图册</h1>
          <div class="atlas__meta">
            <span class="atlas__tag">13 个完整状态 + 1 张统一规范</span>
            <span class="atlas__tag">16:9 远距显示</span>
            <span class="atlas__tag">公共只读</span>
          </div>
        </div>
        <p class="atlas__intro">像医院叫号系统一样，把每台机器的当前任务、订单袋型效果、下一任务、进度、小时级试算和变化原因放到同一套稳定画面里。</p>
      </header>

      <nav class="atlas-nav" aria-label="图册分区">
        <a class="atlas-nav__link" href="#flow" aria-current="page">流程地图</a>
        <a class="atlas-nav__link" href="#normal">稳定值守</a>
        <a class="atlas-nav__link" href="#change">变化恢复</a>
        <a class="atlas-nav__link" href="#fallback">边界状态</a>
        <a class="atlas-nav__link" href="#system">统一语言</a>
      </nav>

      <main class="atlas__content">
        <section class="flow-map" id="flow" aria-label="电视大屏状态流程">
          <div class="flow-map__step"><span class="flow-map__index">01</span><strong>读取已发布排产</strong><span>载入成功进入总览，草稿不显示。</span></div>
          <div class="flow-map__step"><span class="flow-map__index">02</span><strong>稳定轮播值守</strong><span>总览、三个制袋车间、丝印任务池。</span></div>
          <div class="flow-map__step"><span class="flow-map__index">03</span><strong>解释生产变化</strong><span>插单、异常、恢复和完工切换。</span></div>
          <div class="flow-map__step"><span class="flow-map__index">04</span><strong>处理边界状态</strong><span>跨日、断网与无已发布任务。</span></div>
        </section>

        ${groups
          .map(
            (group) => `
              <section class="atlas-section" id="${group.id}">
                <div class="atlas-section__head">
                  <h2 class="atlas-section__title">${group.title}</h2>
                  <p class="atlas-section__desc">${group.description}</p>
                </div>
                <div class="atlas-grid">
                  ${screens.filter((screen) => screen.group === group.id).map(renderAtlasCard).join("")}
                </div>
              </section>`,
          )
          .join("")}
      </main>

      <footer class="atlas__footer">
        <div>
          <strong>电视只负责让状态被看见。</strong>
          <p>排产、进度、异常处理和确认仍由服务器与对应角色页面完成。首轮生产发布继续保持原材料单域，本图册是后续生产看板评审原型。</p>
        </div>
        <span class="atlas__footer-mark">Map / Diagram · Factory Cobalt × Moss</span>
      </footer>
    </div>`;
  fitStages();
}

function prototypeNotes(screen) {
  return `
    <aside class="prototype-notes" aria-live="polite">
      <div>
        <span class="prototype-notes__eyebrow">画面 ${screen.number} / ${String(screens.length).padStart(2, "0")}</span>
        <h1>${screen.title}</h1>
        <p>${screen.purpose}</p>
      </div>
      <dl>
        <dt>本屏验证</dt><dd>${screen.verify}</dd>
        <dt>状态去向</dt><dd>${screen.transition}</dd>
        <dt>公开边界</dt><dd>无价格、收款、内部备注或操作确认。</dd>
      </dl>
    </aside>`;
}

function screenOptions() {
  return screens.map((screen) => `<option value="${screen.id}"${screen.id === activeScreenId ? " selected" : ""}>${screen.number} · ${screen.title}</option>`).join("");
}

function renderPrototype() {
  const screen = getScreen(activeScreenId);
  app.innerHTML = `
    <div class="prototype">
      <header class="prototype-toolbar" aria-label="原型评审控制">
        <div class="prototype-toolbar__group">
          <button type="button" data-action="board">返回图册</button>
          <button type="button" data-action="previous">上一屏</button>
        </div>
        <div class="prototype-toolbar__group prototype-toolbar__group--select">
          <label class="sr-only" for="screen-select">选择电视画面</label>
          <select id="screen-select" data-action="select">${screenOptions()}</select>
        </div>
        <div class="prototype-toolbar__group">
          <button type="button" data-action="next">下一屏</button>
          <button class="prototype-toolbar__primary" type="button" data-action="fullscreen">全屏预览</button>
        </div>
      </header>
      <main class="prototype-layout">
        <div class="prototype-stage" id="prototype-stage">
          ${renderStageViewport(screen.id, `${screen.title}电视画面`)}
        </div>
        ${prototypeNotes(screen)}
      </main>
    </div>`;
  bindPrototypeControls();
  fitStages();
}

function updatePrototype(id, push = true) {
  const screen = getScreen(id);
  activeScreenId = screen.id;
  const stage = document.querySelector("#prototype-stage");
  if (!stage) return;
  stage.classList.add("is-changing");
  window.setTimeout(() => {
    stage.innerHTML = renderStageViewport(screen.id, `${screen.title}电视画面`);
    const notes = document.querySelector(".prototype-notes");
    if (notes) notes.outerHTML = prototypeNotes(screen);
    const select = document.querySelector("#screen-select");
    if (select) select.value = screen.id;
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", "prototype");
      url.searchParams.set("screen", screen.id);
      window.history.replaceState({}, "", url);
    }
    fitStages();
    stage.classList.remove("is-changing");
  }, 120);
}

function stepScreen(direction) {
  const index = screens.findIndex((screen) => screen.id === activeScreenId);
  const nextIndex = (index + direction + screens.length) % screens.length;
  updatePrototype(screens[nextIndex].id);
}

async function enterFullscreen(button) {
  const viewport = document.querySelector(".prototype-stage .stage-viewport");
  if (!viewport || !viewport.requestFullscreen) {
    button.dataset.state = "error";
    button.textContent = "浏览器不支持全屏";
    return;
  }
  button.setAttribute("aria-busy", "true");
  try {
    await viewport.requestFullscreen();
    button.dataset.state = "success";
    button.textContent = "已进入全屏";
  } catch {
    button.dataset.state = "error";
    button.textContent = "全屏失败";
  } finally {
    button.setAttribute("aria-busy", "false");
  }
}

function bindPrototypeControls() {
  document.querySelector('[data-action="board"]')?.addEventListener("click", () => {
    window.location.href = window.location.pathname;
  });
  document.querySelector('[data-action="previous"]')?.addEventListener("click", () => stepScreen(-1));
  document.querySelector('[data-action="next"]')?.addEventListener("click", () => stepScreen(1));
  document.querySelector('[data-action="select"]')?.addEventListener("change", (event) => updatePrototype(event.target.value));
  document.querySelector('[data-action="fullscreen"]')?.addEventListener("click", (event) => enterFullscreen(event.currentTarget));
}

function fitStages() {
  document.querySelectorAll(".stage-viewport").forEach((viewport) => {
    const scale = viewport.clientWidth / 1600;
    viewport.style.setProperty("--stage-scale", String(scale));
  });
}

function renderTvOnly(id) {
  app.innerHTML = `<main class="tv-only">${renderStageViewport(id, `${getScreen(id).title}电视画面`)}</main>`;
  fitStages();
}

function boot() {
  const params = getParams();
  const mode = params.get("mode") || "board";
  activeScreenId = getScreen(params.get("screen") || "overview").id;
  if (mode === "prototype") renderPrototype();
  else if (mode === "tv") renderTvOnly(activeScreenId);
  else renderAtlas();
}

window.addEventListener("resize", fitStages);
window.addEventListener("popstate", boot);
window.addEventListener("keydown", (event) => {
  if (!document.querySelector(".prototype")) return;
  const tag = event.target?.tagName;
  if (tag === "SELECT" || tag === "BUTTON") return;
  if (event.key === "ArrowRight") stepScreen(1);
  if (event.key === "ArrowLeft") stepScreen(-1);
  if (event.key.toLowerCase() === "b") {
    window.location.href = window.location.pathname;
  }
});

document.addEventListener("fullscreenchange", () => {
  const button = document.querySelector('[data-action="fullscreen"]');
  if (!button) return;
  if (!document.fullscreenElement) {
    button.dataset.state = "";
    button.textContent = "全屏预览";
  }
});

boot();
