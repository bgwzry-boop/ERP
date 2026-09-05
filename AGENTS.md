# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

All ERP environments have one controlled deployment line independent of Codex conversations. A task may edit only its own branch/worktree; it must never deploy from the shared dirty working tree or treat an in-app preview as a release. Review Sites, staging, and Tencent production deployments must each use a clean, fully pushed, immutable 40-character Git commit and a verified `erp-controlled-release-lock-v1` for the exact target. The same lock identity must be embedded in the frontend and API, and deployment is complete only after the target reports the same commit, target, version, and lock digest. Only an explicit integration/release task may assemble changes from several conversations and promote them; ordinary modification tasks do not deploy, repoint production, or create a second “current version”.

Staging has one canonical Git baseline: the remote branch `codex/staging-current` must point at the exact immutable commit currently reported by both the staging frontend and `/api/health`. A staging release is incomplete until that non-force-updated branch matches the deployed commit. New modification work fetches and starts from this baseline; a conversation-specific deployment branch is evidence/history, never a second current version. Local `4174` always declares and visibly marks itself as `本地修改稿 · 未部署`, including its base commit and dirty state, and must never be described or shown as the deployed server version. After a successful release, the owner-facing browser is opened on the staging URL with the verified release commit as a cache-busting query; do not leave `4174` open as if it were the released result.

Local port `4174` is permanently reserved for the complete desktop review app at `docs/prototypes/raw-material-roll-inventory-review`, whose application identity is `bagwin-complete-review-4174`. The root ERP workbench uses `5173` and must refuse to start on `4174`; the complete review app must refuse any other port. Start the accepted review through the root `npm run review:dev`, and verify it with `npm run review:check` before showing it. A URL or HTTP 200 alone is not identity evidence: delivery must verify the app-id marker, complete business navigation, desktop shell and API health. If the process behind a local origin changes, use a fresh cache-busting URL or reload; both development apps also poll their served HTML identity and reload themselves when that identity changes, so a still-running old document cannot silently masquerade as the new server.

The `4174` review entry must also isolate viewport families. If an already-mounted phone flow crosses into desktop width (or a desktop flow crosses into phone width), the document must reload through the canonical complete-review entry instead of allowing the root mobile application to expand into its legacy desktop shell. The phone raw-material flow remains available at phone width, but its historical desktop navigation is never an accepted `4174` desktop review surface and must not appear merely because an in-app pane or browser window was resized.

Bare local navigation to the root `5173` workbench is never an accepted review entry and must redirect to the verified `4174` complete review app. The internal root workbench is reachable only through the explicit developer marker `?internalWorkbench=1`; never show that internal URL to the owner as an ERP preview. Browser delivery uses a fresh `4174` URL only after `npm run review:check` passes.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

Before asking the user to restate a business rule, search `AGENTS.md`, `DECISIONS.md`, current product/status documents, implemented server contracts, and relevant tests. Reuse an existing authoritative answer when it is already recorded. Ask only when the answer is genuinely absent, contradictory, or a newly proposed change would alter the established rule; when asking, name the conflict or missing decision instead of repeating a broad discovery question.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## 业务规则读取路由

修改前必须读取对应业务域文件；跨域修改读取所有相关文件。不确定归属时先用 `rg` 在 `docs/rules`、`DECISIONS.md`、现行产品文档、服务合同和测试中查找，不要求用户重复已决定事项。这些文件属于本项目现行 AGENTS 指令的组成部分。

- [原材料与厂家票据](docs/rules/raw-materials.md)：72 条。
- [人员、考勤与工资](docs/rules/people-payroll.md)：47 条。
- [订单、成品、价格与小程序](docs/rules/orders-pricing-miniapp.md)：76 条。
- [生产、机台、打包与交付](docs/rules/production-fulfillment.md)：35 条。
- [对账、收款与财务](docs/rules/finance.md)：4 条。
- [视觉、导航与交互](docs/rules/ui-navigation.md)：16 条。
- [发布、权限与服务安全](docs/rules/release-security.md)：13 条。

## 当前桌面与历史边界

- 唯一认可的完整桌面入口为 4174，导航八组：`工作台 / 订单管理 / 原料管理 / 生产交付 / 库存管理 / 财务管理 / 基础资料 / 系统管理`；可见项目由后端签名账号权限决定。五域导航及独立日常价格表属于历史方案。
- 保持已接受的深海军蓝侧栏、橙色导航选中态、蓝色业务主操作。窄桌面仍是完整桌面，可上下排列列表与详情、在表格内部滚动；不得裁掉详情或切到旧桌面壳。手机宽度仍加载已接受的正式手机流。
- 本轮审核整改采用共享服务器业务规则：桌面多页同单、审计原图、逐卷复核、版本冲突保护和明确错误恢复。复核不是额外第二次审核，也不能伪造打印或贴标完成。
- 2026-09-05 整理前的完整指令见 [历史快照](docs/history/audit-2026-09-05/AGENTS-before-reorganization.md)，已明确替代的方案见 [历史决策](docs/history/audit-2026-09-05/superseded-decisions.md)。历史文件不自动加载为当前要求；业务原文分域保留，未删除审计依据。

Keep project-management context current:

- Update `PROJECT_STATUS.md` when the project state changes materially.
- Update `ROADMAP.md` when new product priorities are accepted.
- Update `DECISIONS.md` when a durable product or technical decision is made.
- After each code update, summarize for the user what was changed, which problems were fixed, which problems remain unfixed, what verification was run, and the recommended next step.
- Use `docs/product/requirements.zh-CN.md` as the primary Chinese product source of truth.
- Keep `docs/product/requirements.md` aligned as the implementation-facing English brief when requirements change materially.
- Use `docs/conversation/` only for historical context and traceability.

Requirements refinement cadence:

- Do not ask one-by-one questions for low-level implementation details.
- Batch small implementation details into reasonable default rules and document them.
- When small open questions remain, present several at once in a concise "question + recommendation + reason" format so the user can approve, reject, or supplement them in batches.
- Ask the user only for decisions that materially affect business process, permissions, pricing, inventory, reconciliation, customer communication, responsibility tracking, or operator workload.
- When proposing grouped defaults, keep examples concrete and business-specific.
- After documenting accepted requirement answers, automatically continue with the next grouped question set unless the user explicitly asks to pause or stop.

Codex handoff documents:

- Read `00_项目入口.md`, `01_当前状态与下一步.md`, and `02_问题或报错日志.md` before broader project searches.
- Update `01_当前状态与下一步.md` when project state changes.
- Update `02_问题或报错日志.md` when an error, verification issue, or repeated risk appears.
