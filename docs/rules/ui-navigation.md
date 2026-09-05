# 当前规则：视觉、导航与交互

从根 AGENTS.md 按业务域进入。本文件保留已记录决策的原文；跨域修改须同时查阅相关规则。当前完整桌面采用八组业务导航，历史五域及分离价格表方案不再是当前入口。

- Fixed-height phone frames in the mobile flow-atlas board must allow internal vertical scrolling whenever a screen's content exceeds the frame. Long decision, evidence, ledger, confirmation, and result pages must never be clipped with no way to reach the hidden content; board frames also remain keyboard-focusable for scroll review.

- The first mobile flow-atlas visual direction was explicitly rejected as ugly and difficult to understand. Do not attribute that failure to workers being unfamiliar with ERP. Future mobile review artifacts must make the interface itself self-explanatory and use the `/Users/xu/Documents/下单小程序` design language directly: forest/moss accents, calm light-green surfaces, continuous white detail sheets, cards only for real business objects, strong Chinese heading hierarchy, and short action-led copy instead of system-manual prose.

- Customer/group shorthand may concatenate bag color and handle color. Confirmed examples include `焦糖米提 = 焦糖色袋 + 米色提手` and `米白咖提 = 米白色袋 + 咖色提手`; same-color wording such as `安哥拉红安哥拉红提手` means both bag and handle use that color. Recognition should use source-scoped aliases and keep the original wording for traceability.

- P0 ERP pages use a narrow left navigation rail plus a top page title / action bar.

- The visual density should be high-density SaaS ERP / operational-table style, closer to Jushuitan-like workbenches than large-card dashboards. Avoid oversized cards and large whitespace.

- P0 navigation should expose the six usable office pages first and keep later modules as gray placeholders.

- Mobile card hierarchy is mandatory across every role. Each phone screen has one dominant business object or decision snapshot; the key comparison numbers use distinct scale, weight, and spacing; the current blocker or difference uses one semantic band; evidence and supporting facts form the second level; IDs, versions, operators, channels, and audit trace are tertiary or progressively disclosed. A generic two-column facts grid must never render every field at the same visual weight, and adding more cards is not a substitute for prioritizing the facts that drive the next action.

- Mobile outbound quantity-variance cards prioritize the facts needed for the business decision: customer name, expected quantity, actual physical quantity, and the difference. Business IDs, paper-slip codes, versions, and other traceability fields remain available but visually secondary and must not lead the card or compete with the quantity comparison.

- Typography and touch density are role-aware rather than globally scaled. Office desktop workbenches keep 13–14px operational content with 12px table headings and critical statuses; 10–11px is reserved for non-critical metadata only. Decision-maker mobile pages for the owner's mother and aunt use 15–16px explanatory/body text, 16px action labels, and 20–28px headings. Other frontline mobile pages expose no visible business text below 12px and no normal touch control below 44px. Chinese headings use normal letter spacing, and UI weights are limited to 400/500/600/700 for stable rendering across PingFang, Noto Sans CJK, and Microsoft YaHei. Any fixed mobile bottom navigation must reserve safe-area-aware content padding and must never cover the current primary action, including at 320px width.

- Desktop information architecture must balance the former all-in-one crowded workbench with the later under-informative guided mockups. Use first-level navigation for stable business domains, second-level navigation for stable workbenches or state queues within the selected domain, and contextual third-level structure inside the page as workflow steps, tabs, accordions, or the selected-record detail area. Do not add a third persistent sidebar or nest three menu columns. The active page should still expose enough list, status, selected-record, validation, and next-action context for office throughput, while progressively disclosing full fields and secondary operations.

- The DingTalk ERP references are an accepted direction for first-screen discoverability and operational information density, but not a mandate to copy a generic all-module app grid. Desktop keeps the dense domain/workbench/list-detail hierarchy. Each phone role defaults to its current task and short workflow, while `全部功能` exposes only that role's executable actions with task counts; it must never reveal or reproduce the complete office desktop menu.

- Mobile forms with a placeholder such as `请选择` must declare the field required and block the primary transition until a concrete value is selected. Decision choices must persist from evidence review through confirmation and result; choosing an alternative must never display the default choice's explanation or downstream steps.

- Confirming an inventory correction is a high-risk write. Before a client invokes the command, it must visibly identify the correction draft, inventory item, system and counted quantities, delta, reason, and that inventory, ledger, todo, and audit projections will change; cancellation must send no write request.

- Inventory status colors are consistent: available green, reserved / occupied yellow, out-of-stock red, pending-handling gray.

- Shared state colors are consistent across modules: normal blue / green, pending yellow, exception red, completed muted green, voided gray.

- In the PC `收货录入` selected detail, the shop-floor display term for internally normalized `提手条` is `把条`. Show the material facts as two independent pairs, exactly `类型 / 把条` and `宽幅 / 5cm`; do not merge them into a generic product/specification sentence or expose `提手条` as the value on this specific receipt-detail surface.
