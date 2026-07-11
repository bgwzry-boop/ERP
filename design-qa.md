# Design QA

source visual truth path: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-11/09-selected-hybrid-redesign.png`

implementation screenshot paths:

- `/Users/xu/Documents/ERP/screenshots/ui-implementation-2026-07-12/entry-1024x768.png`
- `/Users/xu/Documents/ERP/screenshots/ui-implementation-2026-07-12/production-1024x768.png`
- `/Users/xu/Documents/ERP/screenshots/ui-implementation-2026-07-12/print-device-1024x768.png`
- `/Users/xu/Documents/ERP/screenshots/ui-implementation-2026-07-12/entry-390x844.png`
- `/Users/xu/Documents/ERP/screenshots/ui-implementation-2026-07-12/packing-390x844.png`

viewport: desktop `1024x768`; responsive overflow check `390x844`.

state: local demo data, office account, order-entry recognized-draft state, packing/label production-task tab with one selected task.

## C4.3 operational workbench evidence

- Before: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/01-order-pool-before.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/02-inventory-before.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/03-fulfillment-before.png`.
- Desktop after: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/04-order-pool-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/05-inventory-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/06-fulfillment-after.png`.
- Mobile after: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/07-order-pool-mobile-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/08-inventory-mobile-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c43/09-fulfillment-mobile-after.png`.

At `1024x768`, all three main regions now report `scrollWidth === clientWidth === 884` with a `580px / 270px` list-detail split; the old `640px / 330px` minimum no longer clips the detail pane. At `390x844`, all three pages report body and main `scrollWidth === clientWidth === 390` and a single `374px` content column. Order, inventory, and fulfillment tables use merged business-summary columns; inventory exposes overview / ledger / correction views, order exposes order / fulfillment / finance views, and fulfillment exposes task / document-evidence / timeline views. Fulfillment priority controls perform real sorting, filter-empty states retain their filters and clear stale details, and a fresh browser session produced no application warning or error.

## C4.4 todo and statement workbench evidence

- Before: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/01-todo-before.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/02-statement-before.png`.
- Desktop after: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/03-todo-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/04-statement-after.png`.
- Mobile after: `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/05-todo-mobile-after.png`, `/Users/xu/Documents/ERP/screenshots/ui-audit-2026-07-12-c44/06-statement-mobile-after.png`.

At `1024x768`, both pages fit the `884px` main region without horizontal overflow. Todo uses a `580px / 270px` split and separates processing, notification/printing, and history into semantic tabs. Statement uses a `250px / 600px` customer/detail split, keeps the customer plus all five financial trust amounts visible above the tabs, and reduces the detail table from nine technical columns to six business columns. At `390x844`, both pages report body and main `scrollWidth === clientWidth === 390` with a `374px` single-column work area. Tab visibility, empty notification state, payment-proof placement, export-history isolation, and persistent action controls were exercised; the browser produced no application warning or error.

## Full-view comparison evidence

The source composite and both final desktop implementation captures were opened together at original resolution. The shell width, 140px navigation rail, top action bar, page-title hierarchy, order-entry three-step strip, source-recognition panel, dense table/validation split, bottom summary actions, packing task-list/detail split, three workbench tabs, machine-count evidence block, qualified-output block, and task-history placement align with the selected hybrid direction.

## Focused region comparison evidence

- Order entry table/footer: six editable rows remain visible with the validation sidebar and both `保存草稿` and blue `保存并确认` in the first viewport. The implementation uses current fixture fields and values rather than copying the mock's illustrative values.
- Packing machine-count/output region: machine action counts are shown before qualified output and are explicitly labeled as production evidence only. The blue `提交合格数量` action is visible without scrolling.
- Packing history region: the task-history table follows qualified output; lower-priority finished-goods photo details remain available below the fold.
- No raster artwork, logos, illustrations, or decorative assets were required by the selected operational UI. Existing Ant Design icons remain consistent; no custom SVG, CSS illustration, emoji, or placeholder imagery was introduced.

## Required fidelity surfaces

- Fonts and typography: the implementation retains the existing Inter / PingFang SC / Microsoft YaHei stack and matches the compact 10-14px operational hierarchy. Labels, task IDs, totals, and primary actions remain readable without broken wrapping at the target viewport.
- Spacing and layout rhythm: the selected narrow rail, compact panels, 8px section rhythm, table density, validation sidebar, task cards, and fixed-height workbench are present. Panels now scroll internally rather than extending the app below the viewport.
- Colors and visual tokens: existing ERP blue, green, yellow, red, neutral surfaces, borders, and focus tokens map to the source semantic states. Primary confirmation and qualified-output actions are blue; availability is green, review is yellow, and shortage is red.
- Image quality and asset fidelity: the target contains no photographic or illustrative imagery. No image assets are missing and no code-drawn image substitutes were introduced.
- Copy and content: visible language uses factory-facing Chinese labels. `机器计数 / 动作次数（仅作生产凭证）` and its explanatory copy prevent qualified-output, inventory, fulfillment, and billing misinterpretation.
- Accessibility and behavior: navigation and workbench tabs are semantic buttons/tabs with stable keys and panel relationships; inputs retain labels and focus treatment; contrast remains consistent with existing tokens. `保存并确认` and `提交合格数量` were confirmed visible and enabled in the tested state. Production priority controls perform real sorting and expose pressed state. Production, packing, and print/device tabs all switch successfully; the print/device tab remains independent and contains no production evidence, qualified-output action, or task timeline.
- Viewport resilience: desktop target has no clipped persistent controls. At `390x844`, both priority pages report `scrollWidth === clientWidth === 390`; the packing two-column layout collapses to one column and the workbench tabs use full width.

## Comparison history

1. Initial implementation: order entry extended below the viewport, the topbar wrapped, and packing mixed queue, production, packing, and print/device content in one view. Result: blocked with P1 layout and hierarchy findings.
2. First fix: added the three-step entry flow, validation sidebar, compact task cards/tabs, 1024px shell tuning, and machine-count evidence block. Remaining P1: entry footer was below the viewport and packing's qualified-output primary action was not visible.
3. Second fix: constrained the desktop shell to `100vh`, enabled internal panel scrolling, restored the blue entry confirmation action, moved machine evidence before qualified output, added a visible blue qualified-output submission, and placed task history before lower-priority details. Post-fix screenshots show no actionable P0/P1/P2 mismatch.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- P3: the implementation's live fixture counts and task quantities differ from the illustrative source mock by design.
- P3: order-entry rows are slightly denser than the source, favoring complete first-viewport visibility for operational use.
- P3: the source shortage warning is not shown for the currently selected implementation task because its fixture has a valid inventory match; the red shortage state remains present on affected task cards.

## Implementation checklist

- [x] Order-entry progress, recognition source, editable table, validation sidebar, totals, and primary actions.
- [x] Packing production/packing/print-device tabs and priority task cards.
- [x] Machine-count evidence separation and visible qualified-output submission.
- [x] Fixed-height desktop workbench and mobile overflow protection.
- [x] Focused page checks, production build, browser interaction checks, and console review.

final result: passed
