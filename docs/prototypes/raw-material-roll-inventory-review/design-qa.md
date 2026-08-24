# Design QA — finished-goods inventory allocation

## Target

- Approved source: `/var/folders/4m/6x1m7vhd3735nrdld71mcrf80000gn/T/codex-clipboard-a16788d2-3548-4626-9ca0-9a3ef36358cb.png`
- Implementation capture: `/private/tmp/inventory-allocation-implementation-1488.jpg`
- Route: `http://127.0.0.1:4174/#inventory-query`
- Viewport: `1488 × 919`
- State: `无纺布袋库存 / 全部类型 / first inventory row selected`

## Comparison

- Full-view comparison was reviewed with the approved source and implementation capture in one visual input.
- Layout: passed. The implementation keeps the approved desktop list-plus-detail workbench and the fixed scan order `通货类型 / 规格（cm） / 颜色图案 / 库位 / 在库 / 库存结构`.
- Hierarchy: passed. `库位` and total `在库` are independently scannable; the allocation cell contains one bar plus one compact summary line.
- Typography: passed. Total stock remains a strong standalone number, and `可用 N（P%）` is the strongest allocation fact without turning it into a hero metric.
- Spacing/density: passed. Inventory facts no longer occupy separate wide columns; rows preserve the existing dense PC workbench rhythm.
- Colour/tokens: passed. Available uses forest green, occupied soft gray-green, locked restrained slate blue-gray, and pending/review cues remain exceptional.
- Copy: passed. The row and selected detail use the exact terms `在库 / 可用 / 占用 / 锁定`, and `库位` remains explicit.
- Assets: passed. The approved BAGWIN mark and existing shell assets remain unchanged.

## Interaction checks

- `印刷通货` tab filtered the list to three records plus the header.
- Searching `喜字` filtered to one record plus the header.
- Reset restored the full list.
- Selecting another inventory row updated the right-side detail heading and facts.

## Automated checks

- `npm run build`: passed.
- `npm run test:navigation`: 5/5 passed.
- `npm run test:sites`: 4/4 passed.
- No application error was observed during the route and interaction checks. A browser-plugin telemetry timeout was unrelated to the ERP page.

## Final result

`passed`

## Detail-panel simplification — 2026-08-09

- Route and viewport: `#inventory-query`, `1488 × 919`.
- Removed implementation provenance, the duplicated category/type/specification/colour fact grid, and the review-only `职责边界` callout.
- Header now states `通货类型 + 仓库盘点口径 + 规格 + 颜色` once.
- Body now keeps only `实际库位 / 提手 / 可选现货图案 / 库存结构`.
- The two traceability actions remain available in the fixed footer.
- Browser DOM and screenshot review confirmed the compact hierarchy with no clipped text or horizontal overflow.
- `npm run build`, navigation tests, Sites worker tests, and the Impeccable detector all passed.

Final result: `passed`.

## Outbound delivery and supplier month-end shell unification — 2026-08-24

### Visual truth and captures

- Current-shell sources:
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/raw-material-roll-inventory-review/qa/raw-material-pc-roll-ledger-2026-08-07-1280x720.png`
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/raw-material-roll-inventory-review/qa/raw-material-pc-receiving-boundary-2026-08-07-1280x720.png`
- Business-content sources:
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/erp-semantic-tag-migration-preview/qa/legacy-borrowing-fulfillment-1280x720.png`
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/erp-semantic-tag-migration-preview/qa/legacy-borrowing-supplier-settlement-1280x720.png`
- Implementation captures:
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/raw-material-roll-inventory-review/qa/ui-unification-outbound-1280x720.png`
  - `/Users/xu/.codex/worktrees/a0f7/ERP/docs/prototypes/raw-material-roll-inventory-review/qa/ui-unification-supplier-settlement-1280x720.png`
- Routes: `#outbound-delivery` and `#supplier-month-end` on the verified `4174` complete review app.
- Viewport and normalization: `1280 × 720` CSS px, browser `devicePixelRatio = 2`; source and implementation files are both normalized to `1280 × 720` pixels, so comparisons use a one-image-pixel to one-CSS-pixel frame.
- States: populated first-row-selected outbound workbench; formal supplier-month-end empty state because the demo API returned no supplier statement review records.

### Findings

- No actionable P0/P1/P2 differences remain.
- Fonts and typography: passed. Both pages inherit the current complete-review font stack, weights and compact table hierarchy; the selected outbound product wraps within the fixed detail heading without clipping.
- Spacing and layout rhythm: passed. Both pages use the current full-height dense list plus `352px` fixed detail rail, `8px` workbench gap, existing panel radius/border/shadow and the same filter/header/table rhythm as the approved shell.
- Colors and tokens: passed. Selection, status, current-quantity emphasis, empty state and semantic notices reuse existing `4174` tokens; no old prototype palette or new gradient was introduced.
- Image and asset fidelity: passed. The current approved BAGWIN sidebar asset and Ant Design icon set remain unchanged; these workbenches require no additional raster assets.
- Copy and content: passed. Outbound retains `订货数量 / 已发数量 / 本次发货 / 剩余未发` and the read-only receivable context. Supplier month-end retains `对账确认 → 生成应付 → 付款登记 → 付款确认` while clearly stating that the review surface does not perform finance writes.
- Focused comparison was not needed for the outbound page because the complete `1280 × 720` capture keeps all four quantity facts and three receivable facts legible. The supplier stage component could not be visually captured in a populated state without creating demo business data; its labels, step order and route ownership are covered by the targeted source test. This is a residual data-fixture test gap, not a visible mismatch in the formal empty state.

### Interaction and runtime evidence

- Left navigation opened both routes and retained the current shell.
- Outbound search filtered nine rows to the single `红叶电商` record; reset restored nine rows and one selected row.
- The selected outbound detail updated to the filtered record.
- Supplier month-end displayed the formal empty state and kept its primary detail action disabled.
- Browser console error check returned no application errors.
- `node --test docs/prototypes/raw-material-roll-inventory-review/tests/formal-desktop-workspace.test.mjs`: 15/15 passed.
- `npm run review:check`: passed with app identity, navigation and API health verified.
- Impeccable detector: passed with no findings.

### Comparison history

- Pass 1: the current-shell source, old business-content source and rendered implementation were reviewed together at the same `1280 × 720` frame. No P0/P1/P2 issue was found, so no visual-fix iteration was required.

Final result: `passed`.

## Production-task specification/colour split — 2026-08-09

- Route and viewport: `#production-tasks`, `1488 × 919`.
- Replaced the combined `规格颜色` fact with independent `规格` and `颜色` facts.
- Verified the longest demo colour combination, `黄印黑 / 黄袋红提`, remains complete in its own fact cell.
- Order identity, quantity, machine, state, and primary action remain unchanged.
- Browser DOM and screenshot review, build, navigation tests, Sites worker tests, and the Impeccable detector passed.

Final result: `passed`.

## Production-task technical-source removal — 2026-08-09

- Route and viewport: `#production-tasks`, `1488 × 919`.
- Removed `ProductionPackingPage / initialOrderLines` from the business-fact grid.
- Removed the implementation-provenance strip and `查看数据来源` action from this daily production detail.
- Preserved the separate customer/product hierarchy, order detail number, specification/colour, quantity, machine, state, and primary task action.
- Browser DOM and screenshot review confirmed that only office-facing business facts remain and that the detail pane has no clipped content.
- Build, navigation tests, Sites worker tests, and the Impeccable detector passed.

Final result: `passed`.

## Production-task identity separation — 2026-08-09

- Route and viewport: `#production-tasks`, `1488 × 919`.
- Replaced the combined `客户 / 货品` column with independent `客户` and `品名` columns.
- Preserved the dense list rhythm with a production-specific six-column grid; customer and product values remain individually searchable and scannable.
- The selected-record header now uses customer as quiet context and product as the primary title; the fact grid retains separate `客户` and `货品` entries.
- Browser DOM and screenshot review confirmed the six headers, six cells per row, and the separated detail hierarchy without horizontal overflow.
- `npm run build`, navigation tests, Sites worker tests, and the Impeccable layout detector all passed.

Final result: `passed`.
