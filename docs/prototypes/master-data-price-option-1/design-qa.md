# Design QA · 通用价格表第 1 方向

## Baseline

- Visual source: `/Users/xu/.codex/generated_images/019fa110-1c17-7110-ab78-9c727ffe5a93/exec-93532de6-7a35-4081-8779-2c13b08dc126.png`
- Implementation: `http://127.0.0.1:4173/`
- Compared state: initial load, first `无纺布袋 / 30×37×10` record selected, history disclosure collapsed.
- Reference normalization: the 1487px-wide source was resized to 1280px and cropped to the first 720px.
- Implementation viewport: 1280×720 CSS pixels.

## Evidence

- Full implementation: `screenshots/desktop-1280x720-final.jpg`
- Full side-by-side comparison: `screenshots/comparison-1280-final.jpg`
- Focused editor comparison: `screenshots/comparison-editor-focus.jpg`
- Review-locked state: `screenshots/review-locked-state.jpg`
- Responsive contact sheet: `screenshots/responsive-320-375-414.jpg`

## Comparison result

No unresolved P0, P1, or P2 visual deviations remain.

Intentional deviations from the selected visual:

- The permanent `版本与生效` table column and default effective-time field were removed after the user clarified that this metadata should stay hidden. The same server-authoritative facts remain under the collapsed `价格历史与生效信息` disclosure.
- The editor uses a visible sticky action footer so cancel and submit remain reachable at 1280×720.
- At 1280px the side rail, category index, and editor are proportionally tightened; the wider 1440px layout returns to the selected reference's 124px rail, 204px category index, and 408px editor.

## Iteration history

1. First desktop comparison found that the editor action footer could fall below the viewport. The workbench and editor were changed to bounded flex/grid regions with internal scrolling.
2. The grouped ledger header initially painted only the first table cell at desktop width. The category header was restored to a full-width table cell.
3. Mobile category highlighting could lag after a category jump. The observer now follows the header nearest the ledger top and briefly yields to an explicit category click.
4. Final contrast pairs were checked; the lowest ordinary small-text pair is muted text on raised paper at 4.53:1. Accent, review, error, and dark-rail pairs all exceed their required thresholds.
5. Finish review found that a submitted draft could be edited again and that the global and ledger searches shared one state. The pending-review form is now locked behind an explicit `撤回修改` action, submission checks the base version and duplicate `品类 + 标准尺寸`, and the two searches use independent state.

## Interaction verification

- Category jump and scroll-following active state.
- 250ms debounced search, result count, highlight, clear action, and empty state.
- Row selection and editor synchronization.
- Dirty-edit guard that prevents silent selection loss.
- Collapsed/expanded price history.
- Required change reason and validation.
- Submit loading state and creation of a `待复核` draft while the effective price stays unchanged.
- Pending-review lock, explicit withdrawal, and return-to-edit behavior.
- Duplicate canonical specification conflict (`× / x / *`) within one category.
- Independent global and price-ledger searches.
- Tool menu open/close and secondary actions.
- Keyboard focus rings.
- Browser console checked with no runtime errors.

## Responsive verification

The rendered page was checked at 320, 375, 414, 768, 1024, and 1280px:

- no horizontal overflow;
- no wrapped clickable labels;
- no touch target below 44px on phone layouts;
- side rail and desktop top bar collapse below 1024px;
- grouped table converts to readable labeled records below 768px;
- editor remains reachable in document flow.

Final result: **passed**.
