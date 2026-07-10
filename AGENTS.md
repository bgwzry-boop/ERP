# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Prototype-specific design decisions:

- P0 ERP pages use a narrow left navigation rail plus a top page title / action bar.
- The visual density should be high-density SaaS ERP / operational-table style, closer to Jushuitan-like workbenches than large-card dashboards. Avoid oversized cards and large whitespace.
- P0 navigation should expose the six usable office pages first and keep later modules as gray placeholders.
- Order entry uses a large pasted-text input above editable parsed table rows. Common fields edit inline; complex print details open in a side panel.
- Order entry recognition should parse custom-print shorthand into structured bag color, print color, handle color, print side, and notes when possible; examples include `白印黑`, `白袋黑提`, and `黄袋红提`.
- In order-entry tables, custom printed orders should not appear as plain `空白袋` in the visible style/type column. Show the visible type as `定制印刷` while keeping the base bag / inventory style such as `空白袋` available in detail data for stock and production matching.
- In outbound / fulfillment lists and labels, custom product specs should use factory shorthand. Show product name + size + compact color spec + print side + quantity + notes; compact color spec uses bag color plus print color such as `白印黑`, and bag color plus handle color such as `白袋黑提`. If both apply, show both, e.g. `白印黑 / 白袋黑提`.
- Bag-making machine counter values, including the Ounuo machine's built-in daily report, are machine action/cycle counts, not finished-goods output. Prototype UI should label them as machine count / cycle count, never as qualified finished quantity, inventory, fulfillment quantity, or chargeable quantity.
- Inventory status colors are consistent: available green, reserved / occupied yellow, out-of-stock red, pending-handling gray.
- Statement / payment pages are customer-first: customer list on the left and the selected customer's statement-period orders and payment status on the right.
- Shared state colors are consistent across modules: normal blue / green, pending yellow, exception red, completed muted green, voided gray.
- Raw-material inbound should follow the real shop-floor sequence: raw-material supplier delivery/sales note photo from the goods-receiving moment, OCR prefill, customer-service / office review, one label per roll or piece, label printing, physical label attachment to the matching roll, then phone scan / signed-note upload before the roll becomes available inventory. This raw-material delivery note is unrelated to finished-goods outbound / customer delivery notes. Numbering has two layers: supplier document number is optional and recorded only when present; ERP inbound ID and roll/piece IDs are mandatory internal identifiers for search, labels, inventory, issuing, and cost traceability.
- Raw-material machine-side issue in V1 creates issue traceability and moves material to machine-side status after label attachment, but it must not create finished-goods output, treat machine counts as qualified quantity, or allocate order cost / margin. V1 now allows full-roll/full-piece issue plus a narrow split-roll partial issue path for weighted rolls: the source roll keeps remaining available weight, the machine-side child roll gets a `RMI-SPLIT-*` trace, and the issue record keeps source/child linkage. V1 also allows full consumption, measured partial machine-side consumption with remaining weight kept at machine side, machine-side leftover return to `余料待复核`, and warehouse/packing review of returned leftovers back to `可用`. These remain traceability / inventory-state actions only. Production-task precise matching, cost allocation, loss calibration, and margin allocation still require later workflows.

Keep project-management context current:

- Update `PROJECT_STATUS.md` when the project state changes materially.
- Update `ROADMAP.md` when new product priorities are accepted.
- Update `DECISIONS.md` when a durable product or technical decision is made.
- After each code update, summarize for the user what was changed, which problems were fixed, which problems remain unfixed, what verification was run, and the recommended next step.
- Use `docs/product/requirements.zh-CN.md` as the primary Chinese product source of truth.
- Keep `docs/product/requirements.md` aligned as the implementation-facing English brief when requirements change materially.
- Use `docs/conversation/` only for historical context and traceability.

Requirements refinement cadence:

- Do not ask one-by-one questions for low-level implementation details.
- Batch small implementation details into reasonable default rules and document them.
- When small open questions remain, present several at once in a concise "question + recommendation + reason" format so the user can approve, reject, or supplement them in batches.
- Ask the user only for decisions that materially affect business process, permissions, pricing, inventory, reconciliation, customer communication, responsibility tracking, or operator workload.
- When proposing grouped defaults, keep examples concrete and business-specific.
- After documenting accepted requirement answers, automatically continue with the next grouped question set unless the user explicitly asks to pause or stop.

Codex handoff documents:

- Read `00_项目入口.md`, `01_当前状态与下一步.md`, and `02_问题或报错日志.md` before broader project searches.
- Update `01_当前状态与下一步.md` when project state changes.
- Update `02_问题或报错日志.md` when an error, verification issue, or repeated risk appears.
