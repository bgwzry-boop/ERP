**Design QA**

- source visual truth path: `/Users/xu/.codex/generated_images/019efd8b-39d7-7993-9460-eb82d7943b9e/ig_07cf3cc9336ef685016a3cd7f4ba04819592e39096fb72290c.png`
- implementation screenshot path: `/Users/xu/Documents/ERP/screenshots/prototype-1440x1024.png`
- responsive screenshot path: `/Users/xu/Documents/ERP/screenshots/prototype-1280x900.png`
- viewport: `1440 x 1024`, plus `1280 x 900` narrow desktop check
- state: default production board, selected `S2 丝印机` / `SO250517-005`
- full-view comparison evidence: `/Users/xu/Documents/ERP/screenshots/comparison-1440x1024.png`
- focused region comparison evidence: full-view comparison is sufficient for this pass because the target is a high-density dashboard; focused checks were made visually on the sidebar, KPI row, machine lanes, job chips, and right detail panel from the 1440 screenshot.

**Findings**

- No actionable P0/P1/P2 findings remain.
- [P3] The implementation intentionally adds a left `合批建议` panel that is not present in the selected source option. This matches the user's requested hybrid of option 2 plus option 1's batching recommendations.
- [P3] Job-chip typography is slightly denser than the source so all 4 silk-screen and 9 bag-making machines fit in the 1024px viewport. The tradeoff is acceptable for this prototype because the core requirement is small-order short-queue visibility.

**Required Fidelity Surfaces**

- Fonts and typography: Uses system Chinese UI fonts with compact 10-16px hierarchy. Text truncates in dense chips instead of overlapping.
- Spacing and layout rhythm: Matches the target's dark left sidebar, top sync bar, KPI row, grouped workshop sections, lane rows, and right-side detail panel. Lane height was tightened so all 13 machines are visible.
- Colors and visual tokens: Preserves the target's neutral ERP palette with blue primary actions, green running/ready states, amber setup warnings, red bottleneck/conflict states, and gray idle states.
- Image quality and asset fidelity: No raster product imagery is required by the target. Icons use `@ant-design/icons`; no custom inline SVG or CSS-drawn substitute assets were used.
- Copy and content: Chinese ERP copy matches the planned factory context: online self-run shop API, offline pickup, silk-screen/bag-making queues, roll-material leftovers, batching, and completion registration.

**Patches Made Since Previous QA Pass**

- Reduced machine-lane and job-chip vertical height so `B9 制袋机` appears within the 1440 x 1024 first viewport.
- Moved the narrow-desktop breakpoint from `1260px` to `1360px` so the right detail panel hides before it gets clipped at 1280px.
- Rebuilt production assets after the layout changes.

**Implementation Checklist**

- Build passes with `npm run build`.
- Local Vite server is running at `http://127.0.0.1:5174/`.
- Desktop screenshot captured at `1440 x 1024`.
- Narrow desktop screenshot captured at `1280 x 900`.
- Interaction states implemented for date filters, workshop tabs, risk filter, batch selection, queue selection, reorder, insert order, merge batch, transfer machine, and completion modal.

final result: passed
