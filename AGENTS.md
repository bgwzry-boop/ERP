# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Prototype-specific design decisions:

- P0 ERP pages use a narrow left navigation rail plus a top page title / action bar.
- The visual density should be high-density SaaS ERP / operational-table style, closer to Jushuitan-like workbenches than large-card dashboards. Avoid oversized cards and large whitespace.
- P0 navigation should expose the six usable office pages first and keep later modules as gray placeholders.
- Order entry uses a large pasted-text input above editable parsed table rows. Common fields edit inline; complex print details open in a side panel.
- Inventory status colors are consistent: available green, reserved / occupied yellow, out-of-stock red, pending-handling gray.
- Statement / payment pages are customer-first: customer list on the left and the selected customer's statement-period orders and payment status on the right.
- Shared state colors are consistent across modules: normal blue / green, pending yellow, exception red, completed muted green, voided gray.

Keep project-management context current:

- Update `PROJECT_STATUS.md` when the project state changes materially.
- Update `ROADMAP.md` when new product priorities are accepted.
- Update `DECISIONS.md` when a durable product or technical decision is made.
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
