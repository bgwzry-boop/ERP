# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Prototype-specific decisions:

- The selected visual source is `/Users/xu/.codex/generated_images/019fa110-1c17-7110-ab78-9c727ffe5a93/exec-93532de6-7a35-4081-8779-2c13b08dc126.png`.
- Preserve the first direction's desktop anatomy: forest navigation rail, compact top bar, left category index, continuous grouped price ledger, and fixed single-record editor.
- The default ledger shows only `规格（宽×高×侧） / 通用价 / 附加价或规则`. Version and effective-time metadata stay hidden in the collapsed `价格历史与生效信息` disclosure. Only actionable states such as `待复核 / 待生效 / 已失效` appear beside a row.
- This is an additive review prototype. Never modify or replace `/docs/prototypes/master-data-single-edit-first/` from this project.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
