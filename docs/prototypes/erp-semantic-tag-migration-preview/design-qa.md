# Design QA — PC 左侧栏恢复

## Comparison target

- local implementation: `http://127.0.0.1:4173/`
- approved desktop workbench source: `/Users/xu/Documents/ERP/screenshots/semantic-tags-erp-application-2026-07-29/01-current-erp-order-pool.png`
- approved sidebar rules: `docs/prototypes/erp-semantic-tag-migration-preview/AGENTS.md`
- final browser evidence: `qa/sidebar-restored-current-content-1280x720.png`
- viewport: `1280 × 720 CSS px`, device scale factor `1`
- state: `订单池` visible; `订单管理 → 订单池` remains current while `基础资料 → 产品管理` is expanded only to verify the full product hierarchy.

## Findings

- No remaining P0 / P1 / P2 issue.
- The rejected five-domain rail has been removed from the independent review prototype.
- The prior deep blue-black/orange rail is restored with the exact approved module labels and nesting: `工作台`; `订单管理`; `采购管理`; `库存管理`; `生产管理`; `财务管理`; `基础资料 → 产品管理`; and `系统管理`.
- `订单池` is again the default visible workbench and the only orange current-page item. Expanding `基础资料 → 产品管理` does not create a false active item or change the right workspace.
- The full product hierarchy is present: `产品资料 / 产品列表 / 产品单价 / 材质管理 / 款式图案 / 规格管理`.
- The previously completed PC content pages and their components remain implemented. This correction changes only the left-navigation structure and default review entry.
- Production pages and the approved phone prototype were not edited.

## Required fidelity surfaces

- Typography: the incumbent system Chinese font stack and compact workbench scale are unchanged.
- Spacing and layout rhythm: the `164px` rail, dense order rows, filter band, list/detail split, and fixed detail actions are unchanged.
- Colors and tokens: dark blue-black rail, orange brand accent, and orange current-page state remain the visual anchors. Shared `SemanticTag` continues to use repository tokens.
- Copy and hierarchy: the left navigation uses the approved labels rather than the later five-domain rewrite.
- Content: the order-pool body, selected-order facts, tags, status/machine fields, risk column, and right detail remain untouched by this sidebar correction.

## Browser verification

- Initial load renders `订单池`; `.sidebar [aria-current="page"]` resolves to `订单池`.
- The current-page background computes to `rgb(255, 90, 10)`.
- `订单管理` is expanded by default and contains `订单录入 / 订单池`.
- Expanding `基础资料` and `产品管理` exposes all six product links, including `产品单价`, while the current page remains `订单池`.
- The order-pool body and selected detail remain visible throughout the hierarchy check.
- No horizontal overflow and no Vite error overlay appeared.

## Automated verification

- `npm run build`: passed.
- `npm run test:sites`: 4/4 passed.
- Impeccable layout detector: no findings.
- `git diff --check` on the touched prototype and decision files: passed.

## Implementation checklist

- [x] Restore the approved sidebar labels and hierarchy.
- [x] Restore `订单池` as the default PC review workbench.
- [x] Preserve the orange current-page behavior.
- [x] Preserve the `基础资料 → 产品管理 → 产品单价` hierarchy.
- [x] Keep the expanded PC content implementation intact.
- [x] Leave production pages and phone UI untouched.

final result: passed
