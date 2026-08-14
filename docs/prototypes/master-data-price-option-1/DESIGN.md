# 通用价格表 · 第 1 视觉方向

## Scope

This is a separate review prototype for the office desktop `基础资料 / 通用价格表` surface. It does not replace or modify the currently reviewed master-data prototype.

## Audience and job

- Audience: the two equal-permission office A/B generalists.
- Primary job: scan the factory-wide general bag prices, select one price record, edit it directly, and submit the change for review.
- Tone: calm, utilitarian, exact, and visibly derived from `/Users/xu/Documents/下单小程序`.

## Visual authority

The selected ImageGen option is the source of truth:

`/Users/xu/.codex/generated_images/019fa110-1c17-7110-ab78-9c727ffe5a93/exec-93532de6-7a35-4081-8779-2c13b08dc126.png`

Use the mini-program's continuous-page language rather than enlarging mobile cards:

- very pale moss canvas and continuous near-white working sheets;
- forest green only for navigation, current selection, and the primary action;
- fine dividers and whitespace instead of nested containers;
- native Chinese sans hierarchy and tabular price numerals;
- cards only for a real selected price record, review state, or tool menu.

## Anatomy

At wide desktop the surface has four stable layers:

1. a 124px forest navigation rail;
2. a compact 72px global top bar;
3. a left category index aligned with the price ledger;
4. one continuous grouped ledger beside a fixed single-record editor.

The default ledger exposes only:

`规格（宽×高×侧） / 通用价 / 附加价或规则`

Version and effective-time metadata are not permanent columns. They live in a collapsed `价格历史与生效信息` disclosure in the editor. The row surfaces only actionable states: `待复核 / 待生效 / 已失效`.

## Interaction

- Clicking a category scrolls to its ledger group; scrolling updates the category highlight.
- Search filters category, specification, price, and rule after a short debounce.
- Clicking a row loads one record into the editor.
- Dirty edits are protected by an inline continue-or-discard guard rather than a modal.
- A successful submission creates a visible `待复核` draft while the current effective price remains unchanged.
- The edit footer remains reachable and keeps one primary action: `保存并提交复核`.
- Motion is limited to button press, selection feedback, disclosure state, and functional loading.

## Responsive

- At 1024–1279px the editor moves below the ledger.
- Below 1024px the global rail/top bar collapse into a compact page header.
- Below 768px the ledger becomes readable record rows and the editor follows in document flow.
- Every interactive label remains one line and every touch target is at least 44px.
