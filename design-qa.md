# Design QA — 09 稿订单录入

source visual truth path: `/Users/xu/Documents/ERP/screenshots/ui-refactor-audit-2026-07-12/09-gpt-order-entry-final-candidate.png`

implementation screenshot path: `/Users/xu/Documents/ERP/screenshots/ui-refactor-audit-2026-07-12/17-order-entry-single-customer-multi-lines.png`

viewport: `1440×900`

state: local demo data; office account; one `张三服饰` draft; six parsed rows; four delivery batches; row 3 selected; `更多` menu closed.

## Full-view comparison evidence

The current normalized comparison is `/Users/xu/Documents/ERP/screenshots/ui-refactor-audit-2026-07-12/18-order-entry-single-customer-qa-comparison.png`. The source and implementation were compared at the same `1440×900` content ratio and the same row-3 review state. The implemented screen preserves the selected workbench composition while applying the user's later approved business correction: the editable draft belongs to one customer, customer ownership appears once above the table, and different fulfillment/time combinations are summarized as delivery batches.

## Focused region comparison evidence

The current full-resolution implementation capture confirms that all eleven line-level columns are visible without repeated customer or `是否印刷` columns; the draft-level customer selector shows `张三服饰`; the context strip shows `6 条明细 · 4 个交付批次`; row 3 is highlighted; counts are `缺字段 1 / 库存异常 5 / 识别待复核 5`; the selected detail exposes the custom-print fields; and the footer keeps `7,300`, `¥2,728`, and `保存并确认` visible.

No photographic, illustrative, decorative, or custom brand image assets appear in the selected workbench. Existing Ant Design interface icons are used; no placeholder image, custom SVG, CSS illustration, emoji, or text-glyph substitute was introduced.

## Required fidelity surfaces

- Fonts and typography: the implementation keeps the project's Inter / PingFang SC / Microsoft YaHei stack and the source's compact operational hierarchy. Table and sidebar labels remain legible at `11–13px`; totals and the primary action retain stronger optical weight. Text does not clip or wrap across controls at the tested viewport.
- Spacing and layout rhythm: the main/detail split, 8–12px operational rhythm, compact controls, row height, validation density, and fixed footer match the selected direction. All eleven line-level columns, the draft-level customer selector, and persistent actions are visible in the first viewport.
- Colors and visual tokens: blue selection/primary action, green availability, yellow review, red shortage/error, pale selected-row blue, neutral white panels, and low-contrast borders map directly to the source semantics. Every colored state also has a text label.
- Image quality and asset fidelity: no raster content was required beyond the source/reference captures. Interface icons render sharply from the existing icon library.
- Copy and content: the implementation uses the approved Chinese factory terminology and the corrected default fixture: one `张三服饰` customer, six lines, four delivery batches, `7,300`, `¥2,728`, row-3 custom print, `黄印黑 / 黄袋红提`, shortage and review labels. `订单类型` is the sole visible type/print decision column.
- Interaction and accessibility: clicking `库存缺货 60 第2行` selected row 2; clicking the row-3 artwork issue restored row 3; the `更多` menu exposed `作废草稿`; changing row 1 `订单类型` to `定制印刷` updated the control; `保存并确认` was present and enabled. Form fields have explicit labels, focus states remain visible, and browser console errors were `0`.

## Comparison history

1. Initial coded pass: structure and behavior matched the target, but the estimated-amount column was partly outside the first viewport, the bottom of selected-row editing required extra scrolling, and the generic page description/context-refresh block created visible vertical drift. Result: blocked by three P2 fidelity issues.
2. Fix pass: compressed the twelve table tracks to fit the approved first viewport, tightened selected-detail spacing so notes remain visible, and made the shared page header omit empty description/actions for order entry while preserving them on other pages. Post-fix evidence: `13-order-entry-09-implementation-final.png`, `14-order-entry-09-qa-comparison.png`, and `15-order-entry-09-qa-detail-comparison.png`. No actionable P0/P1/P2 mismatch remains.
3. Approved business-correction pass: replaced the default multi-customer example with one customer/six lines/four delivery batches, moved customer ownership to draft level, and removed the repeated customer column. At `1440×900`, table and main-region `scrollWidth` equal `clientWidth`; the current post-correction evidence is `17-order-entry-single-customer-multi-lines.png` and `18-order-entry-single-customer-qa-comparison.png`.

## Findings

No actionable P0, P1, or P2 findings remain.

The implementation intentionally retains the live project's current shell. It also moves the mock's repeated row customer field to one draft-level customer selector. That second deviation is an explicit user-approved business correction: manual entry normally handles one customer with multiple lines/orders, while future concurrent groups create independent queue drafts.

## Follow-up polish

- P3: source and implementation use slightly different shell copy and topbar metadata because the working ERP shell remains authoritative outside the order-entry workbench.
- P3: live controls use the project's native select-arrow rendering, which is marginally more visible than the mock's quieter row affordances.

## Implementation checklist

- [x] Three-step order-entry strip and source recognition.
- [x] Six editable rows with one visible `订单类型` column.
- [x] Clickable validation list and selected-row print detail.
- [x] Persistent totals, split/menu actions, and primary confirmation.
- [x] Order-page/controller/action checks, shared UI checks, production build, browser interaction checks, and console review.

final result: passed
