# Design QA — 原材料手机端

**Source visual truth**

- `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-20/01-approved-reference.png`
- Normalized comparison: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-23/00-approved-normalized-600x1300.png`

**Rendered implementation**

- URL: `http://127.0.0.1:4174/`
- Full review: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-23/13-production-600x1300-final.jpg`
- Flow start: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-23/14-production-flow-start-390x844.jpg`
- Viewport: review `600 × 1300` CSS px; flow start `390 × 844` CSS px; device scale factor `1`.
- Pixel normalization: approved source `853 × 1848` was downsampled to `600 × 1300`; implementation capture is `600 × 1300`. Both comparison inputs therefore use the same pixel dimensions and density.
- State: 宁晋县腾胜无纺布有限公司送货单，9 卷、853.8kg；第 1–6、8–9 卷已核对，第 7 卷规格缺失，进度 `8/9`，主提交按钮按生产安全规则禁用。

**Findings**

- No actionable P0, P1, or P2 visual difference remains.
- Hallmark handoff check: all applicable 58 slop-test gates answer `no`; the modern-minimal genre allowance is used only for existing zero-chroma print tokens, not the mobile field palette.
- [P3] The implementation's compact evidence thumbnails show a slightly broader horizontal source slice than the normalized mock. The actual delivery-note image, full-size viewer, line sequence, recognized values, and explicit exception remain available, so this does not block identification or review. Keep monitoring real OCR `sourceBounds`; prefer exact row bounds when the provider returns them.
- The disabled `确认送货单（8/9）` state intentionally differs from the mock's green enabled-looking button. Production requires every line to be explicitly valid, so the fail-closed state is accepted product behavior rather than design drift.

**Required fidelity surfaces**

- Typography: Chinese system-font stack, bold heading hierarchy, numeric emphasis, line height, wrapping and compact status text match the approved calm dense style; no truncation hides color, specification, weight, roll count, status, or action.
- Spacing and layout: continuous white page, 16px horizontal rhythm, restrained roll containers, source image above the ledger, compact rows, collapsed secondary information, and fixed summary/action preserve the source hierarchy. No bottom navigation or unrelated office workbench is present.
- Colors and tokens: forest/moss actions, light-green surfaces, amber exception treatment, neutral borders, and disabled-state contrast are implemented through shared OKLCH tokens. Written status remains visible; color is not the only signal.
- Image quality and assets: the real delivery-note attachment is used for the full preview and line evidence; `ocrAngle=27000` is normalized and rendered horizontally. No placeholder or handcrafted image substitutes the source note.
- Copy and content: action-led copy explains the four steps, `N 张不同卷标`, the selected printer/device gate, unordered attachment, and isolated mismatch behavior. Secondary document/OCR fields remain collapsed.
- Icons and accessibility: the four-step icons are camera, check-circle, printer, and one tag. At 360/390/412 widths there is no horizontal overflow; back and primary actions measure 44px, the preview control is 94px high, semantic labels and alt text are present, and the fixed footer remains reachable.

**Full-view comparison evidence**

- The normalized source and implementation were opened together at `600 × 1300`. Composition, section order, page density, heading hierarchy, exception row, collapsed document information, sticky summary, and primary action align.
- The implementation preserves the approved continuous ledger and keeps all nine rolls visible in the review state without a one-roll pager.

**Focused region comparison evidence**

- Separate crops were not needed: at original `600 × 1300` resolution the source preview, every row value, the seventh-row amber exception, collapsed `单据信息`, summary, and footer action are readable in both full frames. Browser DOM checks additionally verified the exception copy and disabled `8/9` action.

**Comparison history**

1. Earlier implementation rendered the OCR source vertically and could accept nonnumeric `条` as a specification. The source is now canvas-rotated from authoritative `ocrAngle`, and frontend/server share `hasReviewableRawMaterialSpec`; the final evidence shows the horizontal note and `规格没看清` blocker.
2. Earlier fixed-height previews could clip the lower ledger/action and narrow action grids could overflow. The review now uses a fixed reachable footer with reserved content padding and responsive grids; 360/390/412 browser checks report scroll widths equal to viewport widths.
3. Earlier office mobile mixed general ERP tasks with raw-material work. The production entry now exposes only `录原材料`, and the flow start capture shows the single four-step field utility with unfinished work first.

**Primary interactions tested**

- Office mobile entry → `进入原材料录入`.
- Resume unfinished note → all-roll review.
- Explicit per-roll confirmation and missing-spec block.
- Fixed footer status/action.
- Unordered attachment with per-roll `确认已贴` and `标签/实物不符`; mismatch isolation does not block correct rolls.
- Dynamic printer gate: phone print stays disabled without an accepted selected device and points to the office-PC fallback.
- Clean final browser tab: zero console warnings/errors.

**Residual field-test gaps**

- Real Android camera permission/file sizes, approved Bluetooth thermal-transfer printer callback, waterproof label/media test, four supplier holdout samples, and D49–D53 evidence remain external deployment gates.

**Implementation checklist**

- Keep the office-phone scope raw-material-only.
- Preserve the shared four-step constants and shared role-navigation component for other phone roles.
- Do not relax explicit line review, printer acceptance, retry/audit, or mismatch-isolation gates during deployment wiring.
- Complete the real-device and physical-label acceptance before go-live approval.

## 手机流程图谱密度补充（2026-07-26）

**Source visual truth**

- Before capture: `/Users/xu/Documents/ERP/screenshots/mobile-role-flow-atlas-density-2026-07-26/01-office-before.png`
- Durable brief: preserve the approved office A/B raw-material hierarchy while making routine states fit one 390px phone frame whenever their real content permits; nine-roll ledgers and exception editors remain scrollable.

**Rendered implementation**

- Final board: `/Users/xu/Documents/ERP/screenshots/mobile-role-flow-atlas-density-2026-07-26/05-office-final-board.png`
- Focused print view: `/Users/xu/Documents/ERP/screenshots/mobile-role-flow-atlas-density-2026-07-26/03-office-print-single-screen.png`
- URL: `http://127.0.0.1:5173/docs/prototypes/mobile-role-flow-atlas/?mode=board`
- Viewport captures: source and final board `612 × 919` pixels at device scale factor `1`; each board phone is `390 × 792` CSS px. Focused prototype viewport is `1280 × 720` pixels and contains a `390 × 800` CSS px phone surface.
- State: office A/B raw-material normal flow, with capture and OCR review visible in the full comparison and the print settings state checked separately.

**Findings**

- The initial density was a P2 mismatch with the revised brief: routine result pages overflowed by `133–304px`, and auto-stretched grid tracks created decorative blank space inside otherwise compact cards.
- After the compact office-only rhythm, no actionable P0/P1/P2 finding remains. Capture, upload failure, print preview, print success, print failure, retry result, partial receiving, and complete receiving fit without content overflow. OCR review, expanded exception review, and per-roll attachment still scroll intentionally.
- Typography remains the same native CJK stack and hierarchy; no required value or written state is truncated. Spacing is reduced in chrome, headers, facts, and static rows while 16px horizontal gutters and 44px interactive controls remain. Forest/moss, semantic colors, radii, shadows, delivery-note imagery, icons, and business copy retain the approved language. The print receipt rule is now one action-led line: `设备回执成功后才算打印完成`.

**Full-view and focused comparison evidence**

- The source and final board captures were opened together at identical `612 × 919` dimensions. The post-fix view preserves the approved composition and content order while removing stretched card interiors and reducing the role/title/progress stack.
- The focused print view verifies label preview, three label ranges, dynamic printer facts, receipt rule, and both bottom actions remain readable. Runtime measurement reports `568px` available and `568px` used, with zero overflow.

**Comparison history and checks**

1. First pass reduced office-only chrome and content spacing; routine result overflow fell to zero, but print preview retained `18px` overflow.
2. Facts and label preview were compacted without reducing interactive targets; concise receipt copy and a tighter print-only rhythm removed the final overflow.
3. Browser checks exercised capture save → enabled submit → all-roll review navigation. Atlas validation passes for 10 roles, 27 independent tracks, and 119 states; browser console errors are empty.

## `录原材料` 起始页分区层级补充（2026-07-26）

**Source visual truth and implementation**

- Annotated source capture: `/Users/xu/Documents/ERP/screenshots/mobile-role-flow-atlas-office-capture-2026-07-26/01-before-card-hierarchy.png`
- Final implementation capture: `/Users/xu/Documents/ERP/screenshots/mobile-role-flow-atlas-office-capture-2026-07-26/02-after-section-hierarchy.png`
- URL: `http://127.0.0.1:5173/docs/prototypes/mobile-role-flow-atlas/?mode=board`
- Both captures are `612 × 919` pixels at device scale factor `1`; the compared board phone is `390 × 792` CSS px in the same state and viewport.
- State: Office A/B `录原材料` start page with one unfinished receipt, an empty required capture slot, and two recent completions.

**Findings and fidelity surfaces**

- The annotated source had a P2 hierarchy issue: unfinished work, new capture, and recent history appeared as three similar rounded cards, so card chrome rather than business priority dominated scanning.
- The final page has no actionable P0/P1/P2 finding. It now establishes three semantic regions—`继续未完成 / 录入送货单 / 最近完成`—before rendering their contents. The unfinished receipt is the strongest object card, capture is the largest action panel with one full-width 44px camera action, and recent completions use quiet divided rows.
- Typography preserves the native CJK family and original title/step hierarchy; the new region labels use compact optical contrast without truncation. Spacing keeps the 16px page gutter, the full page uses `481px` of `568px` available content height, and the bottom actions remain visible. Forest/moss tokens, neutral dividers, existing icon assets, and semantic status colours are unchanged. No new image asset was needed. Copy is shorter and action-led while preserving supplier, roll count, weight, stage, time, and input options.

**Comparison and interaction evidence**

- The source and implementation were opened together at the same pixel dimensions. The final view replaces three equal containers with distinct section-to-content ratios while preserving the surrounding role header, page title, four-step progress, bottom action bar, and adjacent OCR frame.
- A separate crop was unnecessary because every start-page label, value, card boundary, and 44px action is legible in the full comparison. Browser semantics expose each section as a named region.
- Interactive prototype check: `打开相机` resolves uniquely, saves the evidence state, and enables `使用这张送货单`; browser console errors are empty. The atlas contract check still passes for 10 roles, 27 tracks, and 119 states.

**Comparison history**

1. Earlier density work removed scrolling but retained three equal-weight card shells; the user's annotation correctly identified that the page still lacked a focal hierarchy.
2. The page was restructured around explicit regions, then each region received its own object/action/history language. Post-fix comparison shows the priority order without changing unrelated screens or flow behavior.

final result: passed

## 正式版 `录原材料` 九卷流程迁移（2026-07-28）

**Source visual truth**

- Latest approved atlas state: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-28/06-prototype-review-390x844.png`
- Earlier exact review reference: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-20/01-approved-reference.png`

**Rendered implementation**

- Formal review: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-28/09-formal-review-496x919-top.png`
- Formal start page: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-28/10-home-390x844.png`
- Formal print page: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-28/11-print-390x844.png`
- Formal attachment page: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-28/12-attach-390x844.png`
- URL: `http://127.0.0.1:5173/`
- Comparison viewport: source and formal review are both `496 × 919` CSS/pixels at device scale factor `1`; no density scaling was required. Supporting flow captures are `390 × 844`.
- State: 腾胜无纺布送货单，9 卷、853.8kg，逐卷复核进度 `0/9`；第 7 卷保留厂家原文 `条` 并显示待补宽幅状态。

**Findings**

- No actionable P0, P1, or P2 visual difference remains.
- The formal task overlay intentionally omits the atlas-only office role/menu row. This follows the earlier exact production reference and gives the real delivery note plus one additional roll row above the fold; it is accepted product chrome behavior rather than fidelity drift.
- [P3] The fallback demo evidence crops are broader than provider-supplied row bounds. The full-size source, row order, recognized values, and exception state stay visible; production attachments continue to use authoritative OCR bounds when present.

**Required fidelity surfaces**

- Typography: native CJK UI family, compact 12–18px operational hierarchy, tabular weights, non-wrapping specification/weight facts, and clear title/summary contrast match the approved dense ledger language.
- Spacing and layout rhythm: source evidence remains above one continuous ledger; restrained row containers, 16px gutters, compact 44px summaries, and fixed dual-action footer keep six normal rows plus the start of the exception visible at `496 × 919`.
- Colors and tokens: forest/moss actions, neutral canvas, pale borders, red physical-colour swatches, and amber blocking state all use shared semantic tokens with written labels.
- Image quality and assets: the real delivery-note image is reused for both the main preview and line evidence. No CSS-drawn document, QR placeholder, emoji, or fabricated asset replaces it.
- Copy and content: the formal screen now uses the approved nine-roll data, canonical `克重*宽度*米数` grammar, one independent physical-roll weight, concise `待确认 / 已确认 / 待补宽幅` states, and direct `核对 / 补全 / 修改` actions. Source-line count and total remain outside the roll facts.
- Interaction and accessibility: every row opens an inline editor; the seventh row is directly prefilled as `78克*5宽*1500米`; all nine rows must be explicitly confirmed before submit. Back, source preview, per-roll actions, footer actions, printer change, one-click attachment, and mismatch controls retain 44px-plus targets.

**Full-view comparison evidence**

- The latest atlas reference and formal review were opened together at identical `496 × 919` dimensions. Section order, delivery-note crop, nine-roll total, first six row identities, fixed footer, palette, radii, and type hierarchy align. The formal implementation is slightly denser without losing a required fact or action.

**Focused region comparison evidence**

- A separate crop was not needed because the original-size comparison keeps the document header, source image, every visible row fact/status/action, and both footer actions legible. The seventh-row expanded-editor state was also exercised directly in the browser and its prefilled correction verified.

**Comparison history**

1. The deployed/formal starting state used the older two-roll `212.4kg` sample, stacked instructional copy, inconsistent specification strings, and a disconnected visual hierarchy. This was a P1 content/state mismatch with the approved atlas.
2. The formal fixture and review component now share the same nine physical rolls and `853.8kg` total, normalize display order without changing OCR evidence, and preserve the seventh-roll correction as a prefilled pending value.
3. The first migrated home/print/attach pass still had equal-weight containers, repeated printer readiness language, aggregate label groups, and no batch attachment affordance. The final pass uses section-first home anatomy, one professional Code 39 label, the full confirmed roll ledger, one written printer connection state, an in-place print-completion modal, and `一键确认 N 卷已贴` alongside recoverable per-roll mismatch controls.

**Primary interactions tested**

- Start page → primary unfinished nine-roll receipt → all-roll review.
- Each of nine roll rows → inline editor → `这卷正确`; seventh-row correction prefilled; final submit becomes enabled only at `9/9`.
- Successful review → nine-label print page with full per-roll ledger and canonical specifications.
- Secondary unfinished-task disclosure → existing attach task → per-roll confirmation, mismatch action, and one-click batch attachment control.
- Page width checked at `390px` and `496px`; fixed footer and horizontal layout remain reachable with no visible clipping.

**Residual field-test gaps**

- The local environment has no physically accepted Bluetooth printer, so the printer gate correctly remains disabled. The success-modal code path is covered structurally, but final print callback, actual barcode scan, media durability, and batch physical-attestation behavior still require onsite hardware acceptance.

**Implementation checklist**

- Keep the nine-roll fixture and formal review ledger aligned with the approved atlas.
- Preserve fail-closed per-roll review and dynamic printer acceptance.
- Keep print success as a modal on the print page and do not re-enable duplicate printing after success.
- Keep batch attachment server-authoritative and exclude completed or isolated rolls.

final result: passed

## `录原材料` 首页专用结构重设计（2026-07-26）

**Source visual truth**

- Mini-program home reference: `/Users/xu/Documents/下单小程序/outputs/home-v3.png`
- Supporting design board: `/Users/xu/Documents/下单小程序/outputs/miniapp-design-board-v16.png`
- Approved raw-material language: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-review-2026-07-20/01-approved-reference.png`

**Rendered implementation**

- Final phone capture: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-home-2026-07-26/office-capture-home.jpg`
- Board context capture: `/Users/xu/Documents/ERP/screenshots/raw-material-mobile-home-2026-07-26/board-office-capture.jpg`
- URL: `http://127.0.0.1:5173/docs/prototypes/mobile-role-flow-atlas/?mode=board#board-office-raw-material`
- Viewport and density: source `390 × 845` pixels; implementation phone `390 × 792` CSS/pixels; device scale factor `1`. Width is normalized 1:1. Height remains the atlas phone contract rather than being stretched to imitate the mini-program frame.
- State: Office A/B `录原材料` start page with one unfinished receipt, two available document sources, and two recent completions.

**Findings**

- No actionable P0, P1, or P2 visual difference remains. The implementation adopts the reference hierarchy without copying obsolete order-repeat content or inventing raw-material imagery.
- The lower quiet space is accepted content-driven space: there are only two real recent records, no bottom navigation, and no truthful additional object to fill it. Adding another card or helper copy would reduce scan clarity.

**Required fidelity surfaces**

- Fonts and typography: the native CJK UI stack, strong 22px page title, 16px section titles, 18px resumable-object title, 15px action labels, and 11–12px supporting metadata reproduce the reference's clear size/weight steps without wrapping an affordance.
- Spacing and layout rhythm: the reading order is one primary unfinished object, one shared two-entry source sheet, then a divider-based history list. The 16px gutter, 8px heading-to-content gaps, 20px section gaps, restrained radii, and absence of shadow or nested cards match the mini-program's compact continuous page.
- Colors and visual tokens: forest/moss accent, pale green icon surfaces, warm canvas, quiet rules, and explicit written state use existing shared tokens. Time is neutral metadata rather than a green success badge; red remains reserved for the upload-failure state.
- Image quality and asset fidelity: no image is required on this operational start page. The reference's product photograph is not copied because the unfinished raw-material note has no authoritative equivalent; no placeholder, generated illustration, emoji, or handcrafted image is substituted.
- Copy and content: synonym eyebrows, the normal-path `必需` badge, routine capture instruction, and idle disabled footer are removed. `继续贴标`, `拍送货单`, `相册 / PDF`, and `使用这张送货单` name concrete actions.
- Affordances, responsiveness, and accessibility: the resume card and both source choices are 44px-plus touch targets with visible focus states and single-line action labels. The board phone reports equal client/scroll widths and heights in the idle state; the saved state also has no content overflow.

**Full-view comparison evidence**

- The `390px`-wide mini-program source and the `390px`-wide implementation capture were opened together in one comparison input. Both lead with one dominant business object, follow with a shared dual-entry action sheet, and finish with a quieter list. The ERP-specific role bar and four-step progress remain because they carry current-flow state.

**Focused region comparison evidence**

- A separate crop was unnecessary: at original width, card proportions, type hierarchy, action labels, icon tiles, dividers, metadata, and all three section boundaries are legible in both full frames.

**Comparison history**

1. The earlier implementation had a P2 hierarchy mismatch: three generic container patterns, a side-stripe resume card, a large full-width camera button, green time pills, and an idle disabled footer made every region compete.
2. The dedicated renderer now produces one strong resumable object, one shared source sheet, and quiet history rows. Post-fix evidence shows the full default page in one frame with no card overflow or idle footer.

**Primary interactions tested**

- `拍送货单` changes the source sheet to `送货单已保存`, then exposes one enabled fixed action, `使用这张送货单`.
- `使用这张送货单` opens `核对送货单`.
- `相册 / PDF` imports the document and opens `核对送货单`.
- `继续贴标` opens the unfinished note's attach-label page.
- Browser console contains no errors.

final result: passed
