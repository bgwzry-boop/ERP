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
