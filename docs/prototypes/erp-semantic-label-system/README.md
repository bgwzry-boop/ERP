# ERP 全系统语义标签语言

这是从生产电视大屏第 14 屏提炼出的跨端规范。负责人已于 2026-07-29 确认按此方案接入；第一批生产迁移已覆盖共享组件、PC 订单池、车间手机任务与电视大屏语义适配，其他工作台继续按模块渐进替换。

## 文件

- `index.html`：可点击规范页与三个设备场景。
- `semantic-tags.css`：可复制的 OKLCH token、标签组件和语义映射。
- `semantic-tags.js`：权威目录、未知值回退和组件示例生成。
- `app.js` / `styles.css`：规范页交互与展示样式，不属于生产组件。

生产实现：

- `src/shared/labels.js`：四类目录、稳定值映射和结构化特殊要求读取。
- `src/shared/ui/operational.jsx`：`SemanticTag` 组件与旧 `StatusPill` 兼容层。
- `src/styles/semantic-tags.css`：三档密度与全部语义外观。
- `src/styles/tokens.css`：标签使用的 OKLCH 语义 token。

## 语义分类

| 类别 | 回答的问题 | 典型值 | 规则 |
| --- | --- | --- | --- |
| `business` | 这是什么单 | 定制单、现货通货、印刷通货、外加工 | 固定优先，不能用状态替代 |
| `requirement` | 生产要特别做什么 | 加长提、按扣、来料加工、双面印、加急、双色、多色 | 只标改变工作动作的事实 |
| `state` | 现在做到哪一步 | 正常、生产中、待复核、异常暂停、已完成、已作废 | 红色只表示阻塞异常 |
| `owner` | 谁来做 | 印1-01、印2-02、制3-01、外协-01 | 颜色只辅助扫视，编号必须显示 |

未知的 `kind / value` 必须回落到中性文字 `待确认`，不得猜测 tone。

## 组件契约

生产页面统一使用：

```jsx
<SemanticTag kind="business" value="custom" size="compact" />
<SemanticTag kind="requirement" value="snap" size="standard" />
<SemanticTag kind="state" value="running" size="prominent" />
<SemanticTag kind="owner" value="lane-1" label="制1-03" size="compact" />
```

组件属性：

| 属性 | 取值 | 说明 |
| --- | --- | --- |
| `kind` | `business / requirement / state / owner` | 决定标签回答的问题 |
| `value` | 权威目录中的稳定枚举 | 决定固定文字和语义 token |
| `label` | 可选字符串 | 仅覆盖已知语义的服务器权威同义文字或人员/机台编号；未知值仍显示“待确认” |
| `size` | `compact / standard / prominent` | 只改变密度，不改变语义 |
| `className` | 可选 | 只允许布局扩展，不允许业务页覆盖颜色 |

不要向生产组件公开任意 `tone`。业务页面传 `tone="red"` 会让同一颜色在不同模块表达不同意思，也是当前 `StatusPill` 难以系统化的根源。

## 三种密度

- `compact`：20px 高；PC 表格、电视后续队列。
- `standard`：26px 高；PC 详情、电视主要信息、手机次要事实。
- `prominent`：34px 高；手机决策关键事实、电视远距焦点。

移动端继续遵守至少 44px 的操作目标；标签本身不是按钮，不应为了触控目标被误做成可点击控件。

## 组合规则

同一业务行最多展示三个优先标签，顺序固定：

1. 业务类型
2. 特殊要求
3. 当前状态

人员/机台归属单独显示，不挤入业务标签组。若特殊要求超过一个，优先保留会改变当前工序或交期的标签；其余进入详情，不使用模糊的彩色 `+2` 替代重要文字。

## 迁移进度

1. **已完成：** 负责人确认、语义 token、权威目录和 `SemanticTag`。
2. **已完成：** `StatusPill` 转为兼容层，新代码停止传任意颜色。
3. **已完成：** PC 订单池、车间手机任务和电视原型写入统一语义键。
4. **下一步：** 按业务域迁移库存、交付、待办、对账、原材料和管理状态页。
5. **最终收口：** 删除页面级状态色和基于文案猜测颜色的旧逻辑。

## 验收标准

- 同一业务值在 PC、手机和电视上文字、色彩、顺序一致。
- 颜色不成为唯一信号；每个标签均保留明确中文。
- 红色只用于会阻断下一步的异常。
- 未知值显示 `待确认`，不自动归类。
- 所有前景/背景组合达到 WCAG AA 正文对比度。
- 320px 手机宽度不截断状态文字；PC 表格密度稳定；720p / 1080p 电视可远距识别。
- `prefers-reduced-motion` 下无依赖位移的状态表达。
