# Raw-material return review design QA

final result: passed

## Evidence

- Source visual truth: `assets/reference-mobile-review-browser.png` (user-selected approved `核对送货单` screen).
- Normalized source content: `assets/reference-mobile-review-content.png`.
- Implementation: `implementation-mobile-review.jpg` from `http://127.0.0.1:4179/docs/prototypes/raw-material-return-review/`.
- Combined comparison input: `design-qa-comparison.jpg`.
- State compared: office mobile review, document and all physical-item rows visible, `0/N` confirmed, primary action disabled.
- Source pixels: 956×2048 including browser chrome; app-owned content was cropped to 956×1904 and downsampled from @2x to 478×952.
- Implementation pixels and CSS viewport: 478×952 at 1× capture density.

## Full-view comparison

The final comparison preserves the approved screen anatomy and density: office role bar, back/title heading, progress strip, document-first card, continuous physical-item ledger, per-item horizontal source crop, one-line facts, amber pending state, and fixed two-action footer. The implementation imports the same atlas tokens and component CSS instead of recreating a parallel visual system.

Intentional business differences are not visual drift:

- `核对退货单` replaces `核对送货单`.
- Return flow ends at `完成`; it does not show `打印 / 贴标` because return confirmation must not create inbound labels or inventory.
- Five signed return items replace the nine inbound rolls.
- The final action is `确认退货`, not `进入打印`.

## Focused evidence

A separate magnified crop was not required because `design-qa-comparison.jpg` keeps both 478px app captures at 1:1 width; the header typography, source-image crop, each 24px source-row strip, item facts, status chips, and footer controls are legible in the combined input. The first four physical items intentionally repeat the first supplier source line, while item five uses the second supplier source line.

## Required fidelity surfaces

- Fonts and typography: passed. The implementation uses the same system Chinese font stack, sizes, weights, line heights, and truncation behavior as the approved atlas.
- Spacing and layout rhythm: passed. Page gutters, heading height, progress spacing, card radii, ledger row density, row-source height, and sticky footer match the existing components.
- Colors and tokens: passed. Forest/moss accents, canvas, paper, rule, warning, success, and disabled-button colors come from the same token files.
- Image quality and assets: passed. The real return-note photo is persisted as an upright source asset; source-row crops are derived from the real first and second return lines and contain no placeholder or fabricated content.
- Copy and content: passed. Return-specific wording preserves missing specification/meter facts, signed weights, and the no-print/no-inventory boundary.

## Interaction verification

- Confirming all five items updates `0/5` through `5/5`, enables the primary action, and opens `退货单已确认`.
- `放大查看` opens the real upright source document.
- `查看单据信息` opens the return-rule explanation.
- Browser console errors: 0.

## Comparison history

1. Earlier independent review shell had a P1 mismatch: it used a different frame, three-step styling, large explanatory cards, and large rounded roll cards. Fixed by replacing that shell with the approved mobile-role atlas structure and shared tokens/styles.
2. First aligned pass had a P2 row-evidence mismatch: each horizontal crop compressed several table rows and was hard to compare. Fixed by generating dedicated real-source crops for the first and second supplier rows and reusing them according to the physical-item mapping.
3. Final pass: no actionable P0/P1/P2 findings remain.
