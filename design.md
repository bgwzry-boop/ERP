# Design — 设计中心小工厂 ERP

这是办公室端与现场角色端共同遵守的界面系统。页面优化应扩展本文件，不得为单页重新发明主题。业务流程、角色边界和高风险确认以 `AGENTS.md` 为准；批准截图仍是对应页面的视觉来源。

## Genre

`modern-minimal` 产品工作台。设计服务于高频录单、查询、交接和异常处理，不使用营销页结构或装饰性动效。

## Macrostructure family

- 办公室页面：`Workbench`。一级业务域 + 二级工作台；页内采用状态队列、紧凑筛选、主列表和固定选中详情。
- 订单录入：`Workbench / Review`。三步进度、原文识别、可编辑明细、异常复核、持续确认栏。
- 现场角色页面：`Guided Task`。当前任务、短步骤、唯一主操作、支持事实；不得压缩办公室左右分栏。
- 内容页与营销页：V1 不适用。

## Theme

限制型冷蓝策略，强调色只用于主操作、当前选择、焦点和小面积状态提示。

- `--erp-canvas`: `oklch(97.1% 0.007 252)`
- `--erp-surface`: `oklch(99.6% 0.002 252)`
- `--erp-surface-subtle`: `oklch(98.1% 0.005 252)`
- `--erp-text`: `oklch(26% 0.035 258)`
- `--erp-text-muted`: `oklch(46% 0.032 255)`
- `--erp-border`: `oklch(88.5% 0.014 252)`
- `--erp-accent`: `oklch(59% 0.205 255)`
- `--erp-accent-ink`: `oklch(99% 0.003 252)`
- `--erp-focus`: `oklch(59% 0.205 255)`

页面不得直接写入十六进制或 `rgb()` 颜色。信息、成功、待处理、异常、禁用、手机任务头部和纸质打印分别使用 `--erp-info-* / --erp-success-* / --erp-warning-* / --erp-danger-* / --erp-disabled-* / --erp-mobile-hero-* / --erp-print-*` 语义 token；功能页只引用，不自行调色。

绿色、黄色、红色只表达服务器权威的成功、待处理和异常；任何状态同时保留中文文字，不依赖颜色。

## Typography

- UI：`Geist`, `PingFang SC`, `Noto Sans SC`, `Microsoft YaHei`, system fallbacks。
- 产品界面采用单一字体家族；数据使用 `tabular-nums`。
- 页面标题 22px；区块标题 14px；表格正文 12–13px；桌面辅助文字不得低于 11px；移动正文不得低于 14px。
- 不使用斜体标题、全大写章节眉题或流式巨型标题。

## Spacing

4pt 基准：4 / 8 / 12 / 16 / 20 / 24 / 32。列表行、筛选条和详情事实优先共享命名 token，禁止新增零散间距。

## Motion

- 状态反馈 120ms，菜单与小面板 180ms；统一 `cubic-bezier(0.16, 1, 0.3, 1)`。
- 只动画 `transform`、`opacity` 和必要的颜色变化；焦点环立即出现。
- 页面不做编排入场；`prefers-reduced-motion` 下空间位移全部取消。

## Microinteractions stance

- 成功结果可见时静默完成；失败和不可见的异步结果才提示。
- 键盘焦点优先于悬停；表格下拉箭头只在行悬停、选中或焦点时出现。
- 高风险写操作继续使用现有最终确认边界；低风险可逆操作不新增确认弹窗。

## CTA voice

- 主操作：实心蓝色、34–40px 高、4–6px 圆角、动词明确。
- 次操作：白色或透明底 + 中性边框。
- 危险操作：文字和完整边框表达危险，不使用彩色侧边条。

## Per-page allowances

- 办公室页面允许高密度表格、固定状态标签和独立滚动详情。
- 订单录入允许真实的三步进度；其他页面不得复制装饰性步骤条。
- 角色移动页允许 44px 以上触控目标与底部任务导航。
- 所有页面禁止装饰插画、玻璃拟态、渐变文字、卡片套卡片和无意义悬浮阴影。

## What pages MUST share

- 五个一级域：`今日工作 / 订单 / 库存交付 / 对账 / 更多工作台`。
- 同一套页面标题、状态快捷筛选、筛选条、数据行、状态标签、详情标签和按钮语法。
- 蓝色强调、状态色含义、4pt 间距、焦点环、数据数字格式。
- 宽桌面显示一级域和二级工作台；窄桌面使用 64px 一级域图标栏与页内二级条。

## What pages MAY differ on

- 列表与详情的列宽比例。
- 页内第三层结构：步骤、状态标签、详情标签或渐进披露。
- 角色移动页的任务步骤和底部导航，但不得复用办公室菜单。

## Exports

项目的可执行 token 位于 `src/styles/tokens.css`。以下为跨工具映射基线。

### tokens.css

```css
:root {
  --erp-canvas: oklch(97.1% 0.007 252);
  --erp-surface: oklch(99.6% 0.002 252);
  --erp-text: oklch(26% 0.035 258);
  --erp-accent: oklch(59% 0.205 255);
  --erp-accent-ink: oklch(99% 0.003 252);
  --erp-focus: var(--erp-accent);
  --erp-info: var(--erp-accent-strong);
  --erp-success: oklch(47% 0.12 155);
  --erp-warning: oklch(49% 0.115 77);
  --erp-danger: oklch(50% 0.17 28);
  --erp-mobile-hero-start: oklch(38% 0.1 255);
  --erp-mobile-hero-end: oklch(55% 0.12 245);
  --erp-print-ink: oklch(0% 0 0);
  --erp-print-paper: oklch(100% 0 0);
  --erp-space-1: 4px;
  --erp-space-2: 8px;
  --erp-space-3: 12px;
  --erp-space-4: 16px;
  --erp-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-background: oklch(97.1% 0.007 252);
  --color-foreground: oklch(26% 0.035 258);
  --color-primary: oklch(59% 0.205 255);
  --font-sans: Geist, "PingFang SC", "Noto Sans SC", sans-serif;
  --spacing-workbench: 0.75rem;
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "canvas": { "$value": "oklch(97.1% 0.007 252)", "$type": "color" },
    "ink": { "$value": "oklch(26% 0.035 258)", "$type": "color" },
    "accent": { "$value": "oklch(59% 0.205 255)", "$type": "color" }
  },
  "space": {
    "workbench": { "$value": "12px", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97.1% 0.007 252;
  --foreground: 26% 0.035 258;
  --primary: 59% 0.205 255;
  --primary-foreground: 99% 0.003 252;
  --muted: 95.2% 0.008 252;
  --muted-foreground: 46% 0.032 255;
  --border: 88.5% 0.014 252;
  --ring: 59% 0.205 255;
  --radius: 6px;
}
```
