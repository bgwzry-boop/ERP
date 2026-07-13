# Roadmap Archive Through V8.80

## V8.80 Batch Check Orchestration

- Batch A and Batch B become first-class runner groups with 7 and 18 ordered checks.
- Batch B remains sequential and ends with PostgreSQL live; the refactor does not imply container/server parallelism.
- P1-08 now leaves only selected internal composite scripts and status-document consolidation. D49 stays release-critical.

## V8.79 Top-Level Check Orchestration

- Pretest, full test, and core checks use one manifest-driven sequential runner instead of multi-thousand-character package-script chains.
- Every legacy check remains individually callable and keeps its prior order. The runner adds precise progress/failure reporting, dry-run JSON, nesting validation, and unknown/cyclic-group rejection.
- P1-08 continues with batch A/B and selected internal composites; status-document consolidation remains separate. D49 stays release-critical.

## V8.78 Shared Component Deduplication

- MetricStrip/Metric and Segmented effective rules become component-owned instead of depending on earlier shared declarations plus later overrides.
- Existing tone backgrounds, separators, selected weight, dimensions, and mobile behavior remain byte-for-byte equivalent at computed-style level.
- P1-03 CSS ownership is complete. Waiting for D49 real inputs, the next code-maintenance track is P1-08 test orchestration and current-status document consolidation.

## V8.77 Explicit Shared CSS Layer

- The final root stylesheet is retired. Cross-page controls, workbench layouts, tables, detail panels, forms, status pills, and modals now live in explicit `styles/shared.css`.
- Unused shared compatibility selectors are removed, and structural checks use shared ownership language while forbidding the old root import.
- Remaining CSS work is narrow deduplication between `shared.css` and the later operational `components.css`; D49 real employees and production env remain release-critical.

## V8.76 CSS Order Compatibility Cleanup

- Order-entry action controls and numeric-input details become feature-owned; the production focus hint moves to the role-workbench layer.
- High-fidelity order-entry table styles remain authoritative. Superseded table/edit-row definitions and unused filter-summary/warning/footer/breakpoint rules are deleted.
- `styles.css` drops from 1,012 to 880 lines. Remaining work is shared-component classification; D49 remains release-critical.

## V8.75 CSS Todo Ownership

- Todo list, bulk actions, rows, handled/reminder states, and customer-notification presentation move into `todos.css`; unused Todo header compatibility rules are removed.
- Shared table selection stays in the legacy shared layer while Todo selection becomes feature-owned, with structural regressions preventing accidental coupling.
- `styles.css` drops from 1,139 to 1,012 lines. Remaining CSS work classifies Order and shared-component rules; D49 remains release-critical.

## V8.74 CSS Base And Shell Ownership

- Global reset/font/body rules move into `base.css`; runtime login, navigation, topbar, workspace content, and responsive shell rules move into `shell.css`.
- Five unused legacy selectors are removed instead of migrated. The cascade is structurally locked as `tokens -> base -> legacy -> shell -> components`.
- `styles.css` drops from 1,778 to 1,139 lines. Remaining CSS work classifies shared components and Todo/Order-specific rules; D49 remains release-critical.

## V8.73 CSS Driver Ownership

- Driver route/navigation, native diagnostics, field QA, loading scan/package checks, delivery proof/watermark/location, and responsive rules move into `driver.css`.
- Shared role-workbench styles remain in `role-tools.css`; printer QA continues to reuse driver field-test base controls through the locked `role-tools -> driver -> production-print` order.
- `styles.css` drops from 2,586 to 1,778 lines. Remaining CSS work is shared compatibility classification; D49 real employees and production env remain release-critical.

## V8.72 CSS Raw-Material Ownership

- Roll/label rows, supplier-statement upload/precheck/review presentation, compact actions, and mobile behavior move into `raw-material.css`; shared role-workbench structure remains in `role-tools.css`.
- The legacy stylesheet drops from 2,858 to 2,586 lines. Real supplier Excel, OCR, durable labels, scans, and finance payment acceptance remain field work; the next CSS batch classifies driver and shared compatibility rules while D49 remains release-critical.

## V8.71 CSS Master-Data Ownership And Modal Reachability

- Master-data import/review/execution/employee-account presentation moves into `master-data.css`; shared modal and form primitives remain global.
- The legacy stylesheet drops from 4,008 to 2,858 lines. The import modal now provides reachable field content and sticky actions on mobile; remaining CSS classification targets raw-material, driver, and shared compatibility rules while D49 stays release-critical.

## V8.70 CSS Inventory Correction Ownership

- Inventory-correction detail, audit history, confirmation queue, actions, and draft presentation move into `inventory.css`; ownership checks keep them out of the legacy global layer.
- `styles.css` drops from 4,180 to 4,008 lines. Populated correction rows and evidence remain real-trial acceptance items; the next CSS batch classifies shared compatibility and remaining feature-specific rules without weakening D49 priority.

## V8.69 CSS Inventory Ledger Ownership

- Inventory-ledger filtering, messages, rows, source navigation, and mobile behavior move into `inventory.css`; unused/superseded legacy inventory-filter rules are removed.
- `styles.css` drops from 4,386 to 4,180 lines. Inventory correction detail/queue CSS is the next isolated style boundary; real ledger-row visual acceptance remains part of the business trial, while D49 remains release-critical.

## V8.68 CSS Fulfillment Evidence Ownership

- Office delivery-evidence cards and their mobile layout move into `fulfillment.css`; the unused wrapper is removed without mixing driver-native presentation into the office feature.
- `styles.css` drops from 4,451 to 4,386 lines. Real delivery photos, signed receipts, and driver-device acceptance remain D51/D52 field work; D49 remains release-critical.

## V8.67 CSS Statement Ownership

- Active customer rows, trust-amount summary, actions, and export history move into `statements.css`; unused legacy filter selectors and obsolete fixed workbench layout/panel overrides are removed.
- `styles.css` drops from 4,642 to 4,451 lines. Remaining CSS work must continue distinguishing active feature rules from obsolete pre-operational compatibility rules; D49 remains release-critical.

## V8.66 CSS Attachment Ownership

- Payment-proof rows, upload summaries, attachment content viewing, metadata, and access-audit presentation move into `attachments.css`.
- `styles.css` drops from 4,921 to 4,642 lines. A populated payment-proof viewer remains part of real finance-trial acceptance; the next CSS batch should classify another feature boundary without weakening D49 priority.

## V8.65 CSS Print Document Ownership

- Print/label previews, print line items, barcodes, batch-package confirmation, and print-batch records move into `print-documents.css`.
- `styles.css` drops from 5,202 to 4,921 lines. The next CSS batch should classify remaining shared compatibility and feature-specific rules; D49 remains release-critical.

## V8.64 CSS Production / Print Ownership

- Production/packing queues, print-device QA, driver/CUPS diagnostics, print readiness, print jobs, and mobile overrides move into `production-print.css`.
- `styles.css` drops from 6,108 to 5,202 lines. The next CSS batch must isolate print document/label templates and shared compatibility rules; D49 remains release-critical.

## 2026-07-13 - V1 CSS Ownership Extraction

- V8.63 moves all V1 status base/mobile rules out of the legacy stylesheet into a feature-owned base layer loaded before the existing workbench overrides.
- `styles.css` drops from 8,753 to 6,108 lines. Remaining B6.7 CSS work is production/print and other feature/shared compatibility ownership; D49 remains release-critical.

## 2026-07-13 - V1 Phase Action Builder Extraction

- V8.62 completes V1 page action routing extraction: production-env gate, selected unblock phase, and completion-audit actions move into a dedicated builder factory.
- `V1StatusPage.jsx` drops from 1,505 to 1,068 lines. Remaining B6.7 work is the 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - V1 Field and Role Action Builder Extraction

- V8.61 moves evidence-group, onsite-role-task, and role-category action routing into a dedicated builder factory with structural and direct behavior regressions.
- `V1StatusPage.jsx` drops from 1,950 to 1,505 lines. Remaining B6.7 work is production-gate/phase/completion-audit action routing and the 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - V1 Blocker Action Builder Extraction

- V8.60 moves runtime-readiness and release-candidate blocker action routing into a dedicated builder factory with structural and direct behavior regressions.
- `V1StatusPage.jsx` drops from 2,218 to 1,950 lines. Remaining B6.7 work is phase/evidence-group/role-task action builders and the 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - Print Diagnostics Panel Extraction

- V8.59 completes the production print-workspace split: driver configuration, CUPS queues, local environment preflight, integration-kit guidance, and safety diagnostics move into a dedicated module.
- `ProductionPackingPage.jsx` drops from 1,266 to 941 lines. Remaining B6.7 work is V1 status action builders and the 8,753-line legacy stylesheet; D49 real employees and production environment remain release-critical.

## 2026-07-13 - V1 Print Readiness Panel Extraction

- V8.58 completes the third B6.7 slice: the non-printing V1 readiness gate for configuration, spool, CUPS, device groups, field QA, document coverage, safeguards, and risks moves out of `ProductionPackingPage.jsx`.
- The page drops from 1,461 to 1,266 lines. Remaining B6.7 work is driver/CUPS diagnostics, remaining V1 status action builders, and the 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - Production Print Device Panel Extraction

- V8.57 completes the second B6.7 slice: printer-device QA and print-job queue rendering/interaction move out of `ProductionPackingPage.jsx` into a dedicated panel module.
- The page drops from 1,880 to 1,461 lines. Remaining B6.7 work is print diagnostics/V1 print-gate extraction, remaining V1 status action builders, and the 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - V1 Status Field-Evidence Controller Extraction

- V8.56 completes the first B6.7 slice: field-evidence/signoff state, attachments, filtering, focus, capabilities, staging, and post-stage review move from `V1StatusPage.jsx` into a dedicated controller hook.
- The page entry drops from 2,524 to 2,218 lines with a structural regression. Remaining B6.7 work is the 1,880-line production/packing page and 8,753-line legacy stylesheet; D49 remains release-critical.

## 2026-07-13 - Inventory Intent Route Assembly Extraction

- V8.55 completes B6.6 for the inventory-intent boundary: intent/hold routes, permissions, command-service ownership, and response mapping are isolated from `apiServer.mjs` with a structural regression test.
- The next non-blocking code-governance slice is B6.7: split the large V1 status and production/packing pages, then consolidate legacy CSS in independently verified batches. D49 remains release-critical.

## 2026-07-13 - Safe After-Cutoff Temporary Holds

- V8.54 makes after-19:30 temporary holds fail closed: office staff must provide an explicit future expiry, and rejected requests write no reservation, inventory ledger, or operation log.
- The safe manual-expiry behavior is complete. Automatic next-day 19:30 expiry remains a business-owner decision; recognition-side code work is now primarily expansion from 1 to 20–50 real anonymized samples. D49 remains release-critical.

## 2026-07-12 - Explicit Cross-Draft Shortage Cancellation

- V8.53 requires an explicit same-customer, open-draft line selection for standalone cancellation-review contexts; no historical order is guessed automatically.
- The target line, source intent and audit log commit atomically while the original source draft remains traceable. Unknown/mismatched customers and closed targets fail closed.
- V8.54 closes the safe after-19:30 execution boundary; only the optional automatic-expiry policy decision and expansion to 20–50 real anonymized samples remain. D49 remains release-critical.

## 2026-07-12 - Pre-Confirmation Shortage Cancellation Restore

- V8.52 adds a server-authoritative restore command for shortage-cancelled draft lines before formal confirmation, with revision, identity, reason, intent and audit evidence in one transaction.
- Restoration after confirmation remains forbidden and creates a new original order. Remaining recognition-side work is cross-draft cancellation, the after-19:30 hold decision, and expansion to 20–50 real anonymized samples.
- D49 real employees and secure production-env intake remains the release-critical path.

## 2026-07-12 - Formal Employee And Seed Data Isolation

- V8.51 isolates seed employee data from the default formal-account maintenance view.
- D49 remains release-critical: import and validate eight real role accounts, complete first-password changes and workshop machine binding, then rerun readiness.

## 2026-07-12 - D49 Eight-Role Employee Readiness Workbench

- Exposed the existing server-authoritative eight-role formal-account readiness beside employee account reviews, without account identifiers or password data.
- Added an employee/machine role matrix with aggregate blockers and fail-closed permission/source switching; seed users remain excluded from release coverage.
- Current real coverage is still `0/8`. Next D49 action remains importing the real roster, management review, temporary-password issue, first password change, workshop machine binding, and secure production-env intake.

## 2026-07-12 - Low-Confidence Field Review Gate

- Added persisted field-level review evidence for likely dimension typos and ambiguous bag/handle shorthand, with explicit accept/edit confirmation in the order-entry detail panel.
- Normal and split confirmation now fail closed on pending reviews, preserve server-authoritative prior evidence, and stamp authenticated reviewer/time; PostgreSQL reads restore the evidence after refresh/restart.
- Pre-confirmation cancellation reversal is completed in V8.52 and explicit cross-draft cancellation linking in V8.53. Next code-side slices are corpus expansion or the after-19:30 hold decision. D49 real employee and production-env intake remains release-critical.

## 2026-07-12 - Versioned Conversation Corpus And Independent Draft Queue

- Added the first confirmed anonymized executable corpus case with source traceability, intent/group/row expectations, duplicate linkage, and direct-identifier scanning.
- Added batch recognition into independently persisted order drafts and line-free intent contexts, filtered queue reads, safe exact retries, changed-batch preflight, and an office queue/open flow.
- Low-confidence field confirmation is completed in V8.49; 20–50 real anonymized trial samples still require user/field input. D49 remains release-critical.

## 2026-07-12 - Persistent Split-Confirmation Success Replay

- Completed exact same-key success replay before draft-revision rejection, with changed-payload conflict protection.
- Stored the complete split command response in the atomic order-confirmation result; PostgreSQL replay survives repository/API reconstruction and creates no duplicate downstream records.
- Next code-side conversation slice is the real anonymized corpus and independent multi-draft queue. D49 remains release-critical.

## 2026-07-12 - Reviewed Customer/Fulfillment Split Confirmation

- Replaced the fake row-split action with a backend preview grouped by customer, source order group, fulfillment method, and latest date.
- Added draft-revision and plan-hash validation plus one atomic multi-order confirmation transaction; cancelled shortage lines remain evidence and are excluded.
- Persistent success replay is completed in V8.47, the first corpus/queue slice in V8.48, and low-confidence field review in V8.49; corpus expansion remains while D49 stays release-critical.

## 2026-07-12 - Line-Specific Partial Shortage Cancellation

- Completed concrete draft-line association, unresolved/stale target blocking, server-authoritative exclusion, atomic intent application, and all-cancelled draft closure without a formal order.
- Completed dense order-entry visibility: cancelled evidence remains readable but immutable, status is textual, and cancelled quantity/amount is excluded from confirmation totals and downstream records.
- The first corpus/queue slice is completed in V8.48, pre-confirmation cancellation reversal in V8.52, and explicit cross-draft cancellation linking in V8.53; corpus expansion and after-19:30 hold behavior remain. D49 remains release-critical.

## 2026-07-12 - Durable Inventory Intents And Temporary Holds

- Added atomic local/PostgreSQL intent, reservation, inventory, ledger, and operation-log persistence for authorized temporary holds, extension, release, expiry, and restart recovery.
- Temporary-hold conversion reuses the existing reservation and adds zero inventory delta; multi-zone matching follows the inventory item bound to the hold.
- Line-specific shortage cancellation is complete in V8.45. The remaining conversation work is real-sample regression and multi-draft queue handling. D49 real employees and production env remains the release-critical external task.

## 2026-07-12 - WeChat Order Conversation Recognition V1

- Added message-level traceability and intent isolation for explicit orders, inventory inquiries/replies, temporary holds, follow-up/new-order decisions, shortage cancellation, and duplicate candidates.
- Added real-case shorthand, inherited multi-color quantities, laminated-stock classification, and dimension-review evidence without reserving inventory for inquiries.
- Next code-side business slice is durable temporary holds with 19:30 expiry/release plus an inventory-intent handling queue; D49 remains the release-critical external task.

## 2026-07-12 - Formal Read Models And Refresh Controllers Isolated

- Completed B6.5 round eleven: isolate page refresh plus production/packing detail and action orchestration; `App.jsx` reached 1,495 lines.
- Formal workspaces start empty, API empty collections clear stale state, and non-API read/write results cannot satisfy production page refresh or detail actions.
- Continue D49 as the release-critical task; while external inputs are pending, move to B6.6 API/V1 service extraction or selector-backed C5 CSS cleanup.

## 2026-07-12 - Print Device And Attachment Controllers Isolated

- Completed B6.5 round ten: isolate print-device actions and attachment access/download/statement-sync orchestration from `App.jsx`.
- Formal mode accepts only API-sourced print and attachment content/list results; stale local previews cannot be opened or downloaded as production evidence.
- Continue D49 as the release-critical task; while external inputs are pending, audit global refresh and production-detail composition-root callbacks.

## 2026-07-12 - Order Controller Isolated

- Completed B6.5 round nine: isolate order-entry draft actions, formal save/confirm gates, order-pool mutation entry, and order/fulfillment/statement navigation.
- Formal persistent actions and navigation are server-authoritative; local recognition and split/merge/delete remain unpersisted draft editing only.
- Continue D49 as the release-critical task; while external inputs are pending, audit print-device QA and attachment-view orchestration.

## 2026-07-12 - Inventory Controller Isolated

- Completed B6.5 round eight: isolate inventory correction actions, detail/queue/ledger refresh feedback, and cross-module source navigation.
- Formal mode accepts only API-sourced correction results and refuses to navigate from a local or stale ledger projection.
- Continue D49 as the release-critical task; while external inputs are pending, audit the remaining order-entry and order-pool callbacks.

## 2026-07-12 - Fulfillment Controller Isolated

- Completed B6.5 round seven: isolate fulfillment evidence, todo routing, dispatch/exception, print, and delivery-method gates from `App.jsx`.
- Formal attachment reads and todo refreshes are server-authoritative; missing customer master data no longer crashes evidence-retake routing.
- Continue D49 real employees and production env as the release-critical task; while external inputs are pending, audit the remaining order/inventory composition-root callbacks.

## 2026-07-12 - Public Todo Controller And Customer Pending Persistence Complete

- Completed B6.5 round six: isolate todo actions with formal API-source enforcement and committed-read refresh.
- Added `customer_pending` as an idempotent, locked, audited PostgreSQL action instead of a browser-only projection or default handled action.
- Continue D49 real employees and production env as the release-critical task; while external inputs are pending, B6.5 round seven extracts fulfillment callbacks.

## 2026-07-12 - Master-Data Controller And Writer Ownership Complete

- Completed B6.5 round five: isolate master-data precheck/import/failed-row and employee-account actions with formal API-source enforcement.
- The backend owns official writer selection; request bodies cannot select local or PostgreSQL infrastructure. Import success requires a committed backend transaction result.
- Continue D49 real employees and production env as the release-critical task; while external inputs are pending, B6.5 round six extracts public-todo callbacks.

## 2026-07-12 - Statement Controller Isolated

- Completed B6.5 round four: isolate statement preview, export, communication, write-off, and evidence-view actions with formal-mode API-source enforcement.
- Continue D49 as the release-critical task: real employees, first-password changes, workshop machine bindings, and secure production env intake.
- While D49 inputs are pending, B6.5 round five extracts master-data import and employee-account callbacks; structural work does not advance real evidence, signoff, or release gates.

## 2026-07-12 - Driver Delivery Controller Isolated

- Driver device QA, package loading, evidence uploads, delivery completion, and exception handoff now live outside `App.jsx`; the composition root is 3,149 lines.
- Formal mode passes `serverRequired` to every write and rejects non-API results before changing delivery or todo state. Direct tests include dual backend attachments, watermark metadata, package completeness, exception todo creation, and local-fallback rejection.
- D49 and real driver-device evidence remain the release priority. If external inputs are unavailable, continue B6.5 with the statement page controller. Real truth remains `0/7`, `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - Raw-Material Page Controller Isolated

- Raw-material inbound writes, supplier statement/payable/payment actions, and the demo-only local traceability projection now live outside `App.jsx`; the composition root is 3,518 lines and has met the intermediate `<4,000` target.
- Formal backend mode now fails closed on API/network failure instead of applying the local demo projection. Direct tests preserve split issue, partial consumption, leftover return/review, supplier payment separation, permissions, and server-authoritative success.
- D49 remains the release priority. If external inputs are unavailable, continue B6.5 with the driver page controller; later split the 1,253-line local raw-material projection into traceability and cost/margin domains. Real truth remains `0/7`, `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - App V1 Status Controller Isolated

- Twenty-three V1 status actions and backend-only evidence/signoff attachment operations now live in a dedicated frontend controller; `App.jsx` is 4,990 lines instead of 5,922.
- Direct tests lock API/action/state mapping, authenticated operator input, status refresh sequencing, and fail-closed `ATT-*` evidence registration. Full regression, core E2E, and three responsive viewports pass.
- D49 real employee and production-env intake remains the release priority. If external inputs are unavailable, continue B6.5 with the raw-material page controller and move `App.jsx` below 4,000 lines; real truth remains `0/7`, `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - V1 Completion Audit Projection Isolated

- Seven completion criteria, runtime blocker projection, and field-acceptance projection now live outside the API composition root with shared sensitive-text redaction.
- Completion is fail-closed: source `ready=true` is rejected unless release candidate, production env, runtime, field acceptance, evidence, signoff, and V1/V2 boundary all pass. `apiServer.mjs` is 11,974 lines.
- Next execute D49 real employee and production-env intake. The next code-only boundary is App page-controller reduction; real completion remains `0/7`, `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - V1 Field Coordination Projection Isolated

- Unblock phases, role task classification, role summaries, and V1/V2 boundary projection now live outside the API composition root with shared sensitive-text redaction.
- Direct and browser checks preserve `53` remaining tasks, `34` evidence items, `6` signoffs, one boundary task, and the fail-closed boundary declaration rule; `apiServer.mjs` is 12,628 lines.
- Next execute D49 real employee and production-env intake. The next code-only boundary is completion audit, runtime blockers, and field-acceptance projection; release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - V1 Release-Status Projection Isolated

- Completion summary, release candidate, owner decision, module status/differences, and top blockers now live in a dedicated redacted projection service; `apiServer.mjs` is 12,979 lines.
- Shared sensitive status text redaction protects both production and release artifacts while preserving release counts and safe variable-name guidance.
- Next execute D49 real employee and production-env intake. If external inputs are not yet available, the next code-only boundary is role-task/unblock-plan and V1/V2 boundary projection; release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - V1 Production-Status Projection Isolated

- Production env, persistence evidence, first-stage execution, fix-list, and safe-template projections now live in an independently tested service; `apiServer.mjs` is 13,225 lines.
- Free-text and command projections redact database URLs, service endpoints, bucket values, tokens, sensitive assignments, CLI values, local paths, and target signatures without removing safe variable names or readiness counts.
- B5 structural work may continue later, but the immediate release priority is D49 real employee intake and production safety env, followed by infrastructure, devices, rehearsal, evidence, and signoff. Release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - V1 Field-Evidence Projection Isolated

- Field-evidence progress, missing-item/signoff actions, CSV summaries, draft freshness, guidance, and quality gates now live in a dedicated server projection service with direct fresh/stale/missing and redaction checks.
- `apiServer.mjs` is 14,183 lines; the 1,153-line field-evidence service is a later internal split candidate, while shared V1 text redaction has its own narrow module and release truth remains fail-closed.
- Next continue V1 orchestration extraction only where it reduces production risk, while prioritizing real employees, production env/infrastructure, devices, rehearsal, evidence, and signoff. Release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - Runtime Authentication Commands Isolated

- Formal login, lockout, password upgrade/expiry, password change, session projection, and logout revocation now live in an independently tested command service; the API composition root only maps HTTP results.
- Stateful authentication uses staged identity projections and commits memory only after repository success, preventing process/PostgreSQL divergence when persistence fails.
- Next extract the remaining V1 status orchestration and execute real employee intake, production environment, device, rehearsal, evidence, and signoff work. Release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - Production Whole-Workspace Exposure Closed

- Production no longer exposes the process-wide workspace object. The legacy endpoint returns a structured 403 and production clients must use permission-scoped domain APIs.
- Demo/test compatibility is restricted to an explicit ten-collection projection with recursive nested-secret redaction; users, auth policy, repositories, storage clients, and unrelated collections are excluded.
- Next remove remaining test dependencies on the legacy projection, continue V1 orchestration extraction, and execute real employee, production environment, device, business-rehearsal, evidence, and signoff work. Release truth remains `0/4`, `0/34`, and `0/6`.

## 2026-07-12 - Production Master-Data Restart Snapshot Complete

- The PostgreSQL startup snapshot now restores every master-data collection written by the supported import flow, including prices, specs, styles, machines, pending employees, assignments, and capacity baselines.
- Live PostgreSQL validation performs the 16-table import before creating a fresh read repository and API server; the pending employee review and all linked master data remain available after startup.
- Next audit the remaining persistence/read-model pairs for restart asymmetry, then continue V1 system orchestration extraction. Local-memory master-data import remains demo-only.

## 2026-07-12 - B5 Employee Account Command and Restart Persistence Complete

- Employee-account enable, temporary-password issue, revoke, audit construction, and persistence orchestration now belong to `masterDataEmployeeAccountCommandService.mjs`; runtime identity helpers are shared explicitly.
- Local restart restores enabled employee-account snapshots and account audit logs; PostgreSQL updates runtime users, employee account linkage/status, and audit logs in one transaction. Failed persistence no longer commits partial in-memory state.
- `apiServer.mjs` is 15,710 lines and the project has 192 npm scripts. Next split the remaining V1 system orchestration while real employee, production env, device, evidence, and signoff work proceeds independently.

## 2026-07-12 - B5 Master-Data Import Command Service Complete

- Confirmation-plan creation, import execution, failed-row correction, audit construction, repository orchestration, and rollback projection now belong to `masterDataImportCommandService.mjs`.
- `apiServer.mjs` is 16,141 lines instead of 16,397; direct service and ownership checks are part of `master-data-import-api:check`.
- Next extract employee-account enable/password/revoke commands, then continue the larger V1 system orchestration split. Real production and field release inputs remain the priority.

## 2026-07-12 - B5 App Shell Views Extracted

- Runtime login, topbar, attachment viewing, master-data import, and action-modal rendering are feature-owned under `src/app/`; `App.jsx` is 5,922 lines instead of 7,235.
- Cross-boundary customer and statement calculations are explicit modal props, and mobile modal forms are locked to one column with shrink-safe controls below 720px.
- Next reduce the 16,397-line API composition root in one-domain passes. Real employee, production env, infrastructure, device, evidence, and signoff inputs remain the release priority.

## 2026-07-12 - B5 V1 Normalizer Ownership Complete

- The V1 status client entry is 953 lines instead of 4,676; field evidence, release, runtime, production env, first-stage, templates, and generic utilities have explicit modules.
- HTTP actions remain injectable and all normalizer modules retain the `officeV1GoLiveStatus*` prefix so they stay in the V1 runtime chunk rather than generic application runtime.
- Next audit App/API composition roots; the 1,154-line production-env normalizer remains a focused later split candidate, while real A1/A2 inputs remain the release priority.

## 2026-07-12 - B5 V1 Result Components Split Complete

- Production first-stage readiness/persistence and execution results are separate components; field closeout staging and release results are also separate.
- The two stage coordinators are now 135/195 lines, all four result components are at most 281 lines, and structure checks prevent result markup from returning.
- Next return to App/API composition roots and the 4,676-line V1 client normalizer while real A1/A2 configuration, devices, evidence, and signoff remain the release priority.

## 2026-07-12 - B5 Production Workspace and Lazy Boundary Complete

- V1 status is now a route-level lazy feature boundary; build validation protects chunk uniqueness, entry isolation, dynamic linkage, and the 450,000-byte budget.
- Production setup is split into gate, real-value intake, first-stage execution, fix list, minimum template, and safe draft components; the entry is 2,524 lines and `erp-pages` is about 230 KB.
- Next audit the remaining 638/523-line subcomponents and return to `App.jsx` / API composition-root reduction while real A1/A2 inputs, device checks, evidence, and signoff proceed independently.

## 2026-07-12 - B5 Field Evidence Stage Split Complete

- Field evidence is split into progress, evidence entry, signoff/boundary entry, and closeout stages with direct role-task routing.
- Mobile heights are 4,552 / 1,832 / 1,870 / 3,532px instead of one 8,021px stage, without changing evidence or signoff truth.
- Next extract production configuration without duplicating JSX; the current pages chunk is 431,434 bytes against a 450,000-byte gate.

## 2026-07-12 - B5 V1 Status Structure Pass 3 Complete

- Onsite role tasks, evidence/signoff staging and closeout, and V1/V2 boundary now have three feature-owned workspaces with grouped contracts.
- The V1 status entry is 3,812 lines, down 1,757 lines across three passes; static ownership checks cover all extracted workspace headings.
- Next split the 1,087-line evidence workspace into progress, evidence staging, signoff, and closeout stages, then extract production configuration. Real A1/A2 inputs remain release blockers.

## 2026-07-12 - B5 V1 Status Structure Pass 2 Complete

- Runtime gates, seven read-only precheck results, blocker actions, and the field-acceptance report now have feature-owned workspaces.
- The V1 status entry is 4,938 lines, down 631 lines across two passes, with shared result/metric/blocker rendering and static ownership checks.
- Next extract field tasks, evidence intake, signoff, and V1/V2 boundary; production configuration follows. Real A1/A2 inputs remain release blockers.

## 2026-07-12 - B5 V1 Status Structure Pass 1 Complete

- Owner decision, completion audit, current unblock phase, and module detail now have feature-owned workspace components with explicit contracts.
- `V1StatusPage.jsx` is 229 lines smaller without changing status truth, permissions, or action behavior; structural checks prevent migrated sections from returning to the entry component.
- Next extract runtime and field-acceptance workspaces, then split the larger production-configuration and field-evidence sections. Real A1/A2 inputs remain the primary go-live blockers.

## 2026-07-12 - C4 Operational UI Refinement Complete

- C4.1-C4.7 now cover build-size gates, six core office pages, production/print, raw material/master data, workshop/driver mobile, and the V1 status-management workbench.
- The V1 status page now exposes operational stages without changing backend release truth; the next code refactor should extract its six workspaces from the remaining large component.
- Primary go-live work returns to reviewed real employees, production env/PostgreSQL/object storage, real CUPS/printers, driver phones, field evidence, signoff, and protected release execution. UI completion does not change `0/34`, `0/6`, or `0/4`.

## 2026-07-12 - D47 Formal Password And Role Coverage Gate Complete

- Formal employee passwords now use random-salt scrypt v2; legacy v1 hashes migrate automatically after a successful login.
- Production release checks require usable reviewed formal accounts for all eight V1 human roles, with workshop accounts bound to a default machine.
- Next, import and review the real employee roster, complete first password changes and machine bindings, then execute A1/A2 infrastructure, device, and field-pilot evidence. Automated coverage does not change `0/34` evidence, `0/6` signoff, or `0/4` release gates.

## 2026-07-12 - D46 Formal Runtime Identity Complete

- Formal imported employees now use a distinct runtime session; production no longer accepts runtime users represented by seed tokens.
- Account identity uniqueness, post-enable identity locking, technical-operations role support, PostgreSQL user persistence, and logout revocation are covered by strict-mode and PostgreSQL 16 live tests.
- D47 should upgrade the fast legacy password hash and add a release gate that requires reviewed active formal accounts for every V1 role before real employee import and field pilot.

## 2026-07-12 - D45 Complete, Production Inputs Next

- D45 role-separated custom-print handoff E2E is complete across management, `PRINT-01` workshop, packing, warehouse, print-driver service, and finance identities, including negative permission checks and persisted operator assertions.
- Next, replace demo/test account switching with reviewed formal employee accounts and execute production PostgreSQL, object storage, CUPS/printer, driver-device, and business-pilot inputs.
- Automated dry-run coverage does not change field evidence, signoff, or release-gate counts; A1/A2 infrastructure and devices remain the primary blockers.

## 2026-07-12 - D44 Complete, D45 Next

- D44 custom-print browser E2E is complete, including transactional task creation, finished-goods evidence, qualified reporting, packing, trusted print callback, express/LTL handover, inventory, and statement projection.
- D45 should validate the same chain across role handoffs (office/management, workshop, packing, warehouse, finance) and prepare production-profile integration inputs without treating test account switching or dry-run printing as field acceptance.
- The primary go-live blocker remains A1/A2 real infrastructure and devices; evidence, signoff, and release-gate counts do not change from automated coverage.

## P0 - Repository Baseline

Status: complete.

- Move the prototype into `/Users/xu/Documents/ERP`.
- Exclude generated dependency folders, build artifacts, and old local npm cache settings.
- Add project management docs.
- Copy the old thread's usable conversation context into project docs.
- Verify dependency install and production build in the new repository.

## P0.5 - V1 Production Hardening

Status: Batch A and the local code side of Batch B are complete; real infrastructure recovery is next.

- Batch A: explicit runtime modes, local data partitioning, production fail-closed persistence, formal production login, and shared role permissions.
- Batch B: core PostgreSQL facts, atomic confirmation, startup snapshots, restart recovery, and stale-session concurrency are complete in the local PostgreSQL 16 suite; real production env, migration/backup/restore, object storage, remote recovery, deployment, logging, alerting, and rollback evidence are next.
- R2 code preparation: Node 24, systemd/nginx deployment manifests, graceful shutdown, periodic production health checks, an immutable-commit fresh-directory recovery runner, and a deployment/recovery runbook are complete. The actual controlled Git remote, another-host recovery, live infrastructure, alert test, and rollback evidence remain external blockers.
- Batch C: physical printers / CUPS and driver-phone native capability verification.
- Batch D: desensitized real business pilot across office, warehouse, workshop, driver, finance, and raw materials.
- Batch E: execute rectification plan V7.30 in reviewable rounds: the prior service, transaction, attachment, identity, and UI hardening rounds plus the isolated-data browser chain from order confirmation through inventory, fulfillment, statement, payment, and proof attachment are complete. D43 also closes blank-bag color false positives and fulfillment-to-statement persistence. Next extend browser coverage to custom-print production, qualified-output reporting, packing, trusted printing, and express pickup without treating machine counts as output.
- Batch F: complete field evidence, role signoff, release candidate, and rollback rehearsal.

## P0.8 - Selected Hybrid UI Implementation

Status: local implementation complete; Figma synchronization deferred.

- Use `screenshots/ui-audit-2026-07-11/09-selected-hybrid-redesign.png` as the visual source for order entry and packing/label.
- Keep the two priority workbenches fully usable at 1024x768 with internal panel scrolling and a narrow desktop shell.
- Keep order recognition, validation, inline correction, save, and confirm in one visible workflow.
- Keep production tasks, packing tasks, and print/device operations separated by tabs.
- Keep machine action/cycle counts visually and semantically separate from qualified output, inventory, fulfillment, and chargeable quantity.
- Continue local browser/design QA first; synchronize the final implementation to Figma only after Figma access and payment recover.

## P1 - Production Board Usability

- Convert the six KPI cards into a compact status strip so queues get more first-screen space.
- Make the batching recommendation panel collapsible or mode-specific.
- Reduce job-chip text to the fastest scanning fields: order number, quantity, duration, and risk state.
- Add stronger row-level emphasis for the bottleneck machine, currently `S2`.
- Add an explicit recommendation area for the selected job: transfer, split, insert, or complete.
- Add a narrow-desktop action bar so actions remain available when the right detail panel is hidden.
- Increase key small text toward 11-12px where density allows.

## P2 - Product Depth

- Keep V1 focused on the human-controlled single-factory ERP core, and move automation / optimization / deep analytics into V2 as documented in `docs/development/v1-v2-scope.zh-CN.md`.
- Use the unified V1 persistence profile for production startup, so PostgreSQL / object-storage defaults are configured once, explicit repository overrides still win, and readiness remains blocked for unsupported local-only repositories instead of silently accepting partial persistence.
- Split static sample data out of `src/App.jsx`.
- Add realistic order, machine, material, and leftover-material domain types.
- Add helper material-preparation task pools grouped by configurable workshop/zone and machine time windows, generated only from published bag-making schedules, with rough one-roll estimates first and later captured bag body / handle material formulas, helper default visibility by assigned workshop, temporary support authorization, recommended/reserved roll IDs that do not hard-lock the task before actual scan, single-action machine-side material pickup, machine-side pending handling after schedule changes, and review reminders for long-staying machine-side rolls.
- Add paste-to-parse order entry that can split one pasted customer message into multiple orders or sub-orders, preserve original source messages/files/OCR results, show a side-by-side draft review page, track field confidence, flag suspected duplicates without auto-voiding, record customer modification messages, save manual correction hints, and re-check inventory/prices before formal order creation.
- Model original orders with independent order lines / sub-orders, including line-numbering, split conditions by size / color / handle / print content / fulfillment method, independent line states, and statement rows grouped by original order.
- Define the V1 core data model around customers, original orders, order lines, inventory, inventory ledger, price snapshots, production tasks, workshop reports, packages, delivery records, statements, payments, and after-sales / exceptions, leaving payroll, deep costing, and automation bots as later extensions.
- Define the V1 API / database boundary so source quantities are not overwritten, inventory changes go through ledger entries, key actions write operation logs, files use a unified attachment table, price snapshots are immutable, notes / labels are versioned, todos use a unified table, and the first API phase covers only main-flow page-shell needs.
- Define the V1 ERD implementation rules for readable business numbers, non-unique customer names with duplicate prompts, exact finished-goods inventory keys, attachment linkage, no hard deletion for formal records, business/system timestamps, prechecked Excel imports, and audit-focused operation logs.
- Add lightweight reporting/loss and responsibility-clue flows: qualified finished goods only for inventory/fulfillment, abnormal loss only on meaningful exceptions, optional scrap-bag / waste-batch records for routine bag-making waste sold as scrap, pending handling / pending scrap only for order/inventory/quality/responsibility-relevant problem goods, optional machine-cycle counter telemetry labeled as non-finished-goods process data, and no automatic payroll deduction.
- Define the order-line state machine with original-order rollups, separated business and exception states, parallel todo items, additive post-delivery correction records, explicit auto-transition triggers, state-change logs, and distinct cancel / close reasons.
- Implement the V1 state dictionaries for original-order rollups, order-line main states, additive exception tags, production tasks, packing tasks, packages, fulfillment records, statements, payments, after-sales records, and responsibility records.
- Add Excel import templates plus backend editing for V1 master data: customers, factory standard colors and aliases, standard size / finished-goods style specs, machine capacity baselines, employee accounts, initial finished-goods inventory, suppliers, and lightweight raw-material batch records. The first backend-editing surface should create non-writing maintenance drafts from an independent master-data page, while formal high-risk writes still go through confirmation / execution gates.
- Generate the actual V1 master-data Excel template files in the confirmed first-batch order: customers, colors / aliases, sizes / finished-goods styles, employees, machine capacity, and initial finished-goods inventory; suppliers and raw-material batches follow as the second batch.
- Implement V1 master-data import landing behavior: test-environment import first, incomplete customer defaults, unknown-color and unknown-size pending-confirmation rows, counted versus estimated inventory trust markers, disabled employee accounts by default, manual-estimate machine capacity, valid-row partial import for ordinary data, and confirmation-gated imports for high-risk inventory, price, and permission data. Price-table imports must full-table pre-check version, effective time, reviewer, and changed values before approval.
- Add V1 print/export templates for outbound / self-pickup notes, delivery notes, express / less-than-truckload package labels, and customer statement Excel export, including dot-matrix-printer support for formal notes, print preview, dynamic field hiding, paper note numbers, void-and-reprint history for changed printed documents, and two-sheet statement Excel output.
- Add V1 acceptance test scenarios covering order recognition, in-stock and out-of-stock stock/common-goods handling, custom printed full flow, quantity variance, pickup/delivery note void-and-reprint, express / less-than-truckload labels, and statement/payment variance.
- Add non-blocking customer risk hints during order entry using debt, overdue debt, unresolved after-sales, complaint frequency, and recent packing-change signals.
- Add a size/spec alias table for shorthand, horizontal/vertical wording, and small/medium/large labels.
- Add stock/common-goods inventory checks after order entry and route insufficient stock into production work orders.
- Add automatic routing for stock/common-goods order lines: clear parse + trusted sufficient inventory + complete price goes to waiting for outbound; ambiguous parse, unreviewed inventory, missing price, or strong risk stays pending confirmation.
- Add office/customer-confirmed handling for stock shortages per order line: ship available lines, ask whether the customer waits for unavailable lines, produce/replenish waiting lines, cancel unavailable lines, move all to production, or change accepted quantity.
- Generate editable copyable WeChat / Enterprise WeChat text for unavailable stock lines, including predicted lead time or estimated ship-ready date.
- Start stock-shortage lead-time prediction with conservative rules based on existing replenishment plans, machine capability, earliest schedulable date, production duration, and setup buffers; improve later with accumulated production data.
- Add follow-up reminders for unavailable stock lines marked confirm later, defaulting to 2 hours and escalating near latest delivery / pickup time with a phone-call recommendation.
- Add inventory reservation for stock/common-goods lines entering waiting for outbound, with on-hand / reserved / available quantities and release on cancellation, rejection, quantity change, or outbound completion.
- Add manual hold inventory for pending-confirmation stock orders, with expiry and automatic release, defaulting to same-day 19:30 in V1.
- Add inventory variance handling during outbound when reserved stock is not actually available, with choices for shortage production, customer-accepted short shipment, waiting for replenishment, or inventory adjustment pending office / inventory-permission confirmation.
- Reserve warehouse/location fields for outbound task details, while allowing blank / pending-cleanup / temporary locations in V1 so messy current locations do not block outbound.
- Add customer notes and office notes to outbound task details, later extracting frequent office-note text into preset options / quick phrases.
- Route quantity mismatch and unable-to-outbound reports to office exception handling instead of letting outbound workers directly edit orders, inventory, or close orders.
- Add lightweight advance-preparation states under waiting for outbound: pending preparation and prepared, with temporary preparation area/location and prepared quantity records, while completion still requires complete outbound.
- Add inventory adjustment approval routing with configurable immediate-push thresholds by quantity variance and estimated amount.
- Add inventory warning and replenishment recommendation logic by exact inventory key using manual min/target stock plus 7/15/30 day sales signals; blank min/target values do not auto-warn, available stock excludes reserved, waiting-pickup locked, and pending-handling quantities, and slow-moving items only replenish conservatively.
- Track stock finished goods by size, color, handle type, finished-goods style, and warehouse/location.
- Add V1 finished-goods inventory zone/status workflows: coarse zones plus model/size grouping, warehouse-counted versus workshop-reported / loose stock, waiting-pickup locks, pending-handling / scrap stock, cycle-count correction, permission-confirmed inventory adjustments, threshold-based management review, safety stock by exact inventory key, inventory ledger entries for every stock movement, and machine-side direct outbound with formal order linkage, quick stock-order creation when missing, electronic-first confirmation, later document back-print/linking, output offset, same-day review reminders, and variance correction.
- Add a pending replenishment scheduling pool that can be merged with customer orders by size, color, handle/strap setup, and timing.
- Add customer-locked shortage quantities plus editable opportunistic stock-replenishment suggestions when customers agree to wait for unavailable stock; suggested quantity starts from target-stock shortage plus customer-confirmed waiting quantity and protects customer-locked quantity first.
- Add data-driven finish-the-roll recommendations for non-custom production so replenishment avoids both half-roll waste and long-lived overstock.
- Model the machine capability table from `docs/product/requirements.md`.
- Model order state flows for printed, non-printed stock, non-printed made-to-order, and external processing orders.
- Add route-level screens for order pool, work orders, material ledger, and completion history.
- Build V1 role-specific page shells with fake data before real APIs, while drafting ERD / API contracts in parallel. Start with the desktop office flow: shared todo workbench, order entry / recognition, order pool, inventory lookup, outbound / fulfillment, and statements / payments; then implement management mobile, read-only large TV board, workshop role task pools, warehouse / outbound short-flow home, and driver delivery flow. Validate navigation, task pools, detail pages, and key actions before hardening API, permissions, and persistence.
- Narrow P0 to the six desktop office pages first. Mobile surfaces and the TV board should exist only as fake-data preview / placeholder entries in P0, with real interaction loops following after the office flow works.
- Keep P0 order recognition local and rule-based: large pasted-text input, editable parsed lines, fake inventory / price recheck, and no AI or external API dependency until the workflow proves useful.
- Keep P0 inventory, outbound, printing, statements, and payments simulated: use fake stock and reservation state, document / label previews instead of real printers, and browser statement tables or simple export placeholders before final Excel / print-template integration.
- Seed P0 with 30 synthetic but business-realistic records before real desensitized files are available: 12 customer fixtures, eight order categories, deliberately messy pasted-order strings, real inventory keys, confirmed bag and silk-screen price fixtures, and role/account fixtures for office, management, production, warehouse, driver, silk-screen, bag-making, and packing.
- Use P0 office screens as high-density ERP work surfaces: narrow left navigation, top title/actions, six usable core pages plus gray later-module placeholders, compact tables, side panels for complex details, customer-first statement layout, and unified status colors across order, inventory, outbound, statement, and todo surfaces.
- Implement the P0 office shared-todo workbench as a typed list-detail page: eight initial todo types, rush / today / exception-first sorting, compact grouped rows, right-side summary/action detail panel, no task claiming, actual-handler logging, only low-risk batch snooze / print-preview / viewed / label-print actions, today-handled plus 7-day handled filtering, and red-dot / badge / pinned-list reminders only.
- Implement the P0 order-entry / draft-review page with a large top input area and `recognize`, `clear`, `fill sample` actions; automatic multi-line splitting for multiple sizes / colors / print contents / fulfillment methods; editable parsed rows showing customer, product / print content, size, color, handle, style, print flag, quantity, fulfillment, latest needed time, inventory status, and estimated amount; a side detail panel for print artwork, print side/color, notes, price snapshot, and source evidence; order-type-specific missing-field blocking; confidence styling; and footer actions for save draft, save and confirm, split order, and void draft.
- Implement the P0 order pool as a full-search traceability page separate from shared todos: default latest-30-days incomplete plus today-completed scope, order-line primary rows with original-order grouping/filtering, columns for order/line number, customer, product/print content, size, color, handle, quantity, order type, status, fulfillment, latest needed time, amount, and exception marks, filters for customer/status/type/fulfillment/exception/date/statement/debt variance, right-side drawer details, and only low-risk list actions.
- Implement the P0 inventory lookup page by exact inventory key with default visible available / reserved / waiting-pickup locked stock, collapsed pending-handling / scrap stock, columns for in-stock / reserved / available / waiting-pickup locked / pending-handling / estimated-pending-review, shortage quantity plus replenishment suggestion and copyable customer message, reference-only similar stock hints, source trust summaries, and no direct inventory-total editing.
- Implement the P0 outbound / fulfillment page as a tabbed all / pickup / delivery / express-LTL work view with today's due, incomplete, and exception items by default; compact rows for customer, order tail, method, goods, quantity/packages, latest time, status, and note marks; right-side details for contact/address, line items, inventory source, package/label/document preview, notes, and operation history; actions for prepared, complete, quantity mismatch, unable to outbound, print/label preview, and express/LTL pickup confirmation; quantity mismatches routed through fixed reason capture and office todo creation; and browser-only simulated print / void-reprint states before real printers.
- Implement the P0 statements / payments page with a customer-first work view showing customers needing current-period statements, debt / unpaid variance, or payment confirmation by default; left customer rows for settlement cycle, current receivable, debt/overdue, payment-confirmation marker, and last statement date; right-side sections for customer summary, current-period order lines, totals, adjustments, received amount, variance handling, and operation history; customer-facing order-line summary with internal delivery/evidence drilldown; actions for statement preview, mark sent, record received amount, variance pending confirmation, confirm write-off, and export placeholder; less-than-receivable payments defaulting to variance pending confirmation; and browser table plus simple Excel placeholder before final template styling.
- Build the P0 prototype as a frontend-local React state implementation first: only the six office desktop pages are clickable, later modules are disabled placeholders, fake data covers about 30 orders / 12 customers / inventory / todos / packages / statements, print/export actions are simulated previews or state changes, acceptance uses business scenarios, and the running prototype is browser-checked before handoff.
- Implement the warehouse / outbound mobile task pool with grouped compact two-line task rows, same-day / urgent sorting, detail header and line fields, inventory-source marks, quantity-mismatch reason capture, and lightweight prepared-goods marking.
- Implement workshop mobile task detail pages for silk-screen, bag-making, helper material preparation, packing, and technician mold-change, using role-specific fields and actions, shared exception entry, and cross-day task continuation display.
- Implement the driver mobile delivery task flow with waiting / in-delivery / completed / exception states, compact task rows, manual delivery sequence fallback sorting, delivery detail fields, confirm-loaded handoff, mandatory watermarked completion photo, optional signature photo, fixed exception reasons, and optional duplicate paper-note status.
- Implement the first button-permission matrix across order, scheduling, workshop reporting, outbound, inventory adjustment, printing, payment / statement, after-sales, and responsibility actions, using role defaults plus account-level special permissions.
- Keep V1 to a single factory and single operational/accounting tenant; avoid multi-company, multi-store, multi-ledger, and complex warehouse-organization features until the first flow is stable.
- Prepare a 20-50 order desensitized real sample dataset later to replace / calibrate the P0 synthetic data, covering in-stock stock/common goods, out-of-stock stock/common goods, custom print, printed stock/common goods, external-processing print, express / LTL, delivery, pickup, quantity variance, and statement/payment variance.
- Add production-board and scheduling behavior for concrete bag-making machine queues, draft-versus-published schedules, non-minute-level machine/date/sequence planning, published schedule audit history, priority rules, continuous-production suggestions, large-TV scannable fields, published rush insertion with auto-refresh, machine+size capacity baselines with low-confidence fallbacks, rough estimated-completion calculation and display, manual ETA edit reasons, late-completion todos / management watch, cross-day continue-task display, and technician mold-change work orders only when technician coordination is needed, with task-pool assignment, human-confirmed creation from possible mold-change prompts, start / complete / cannot-on-time actions, pre-start warnings, and technician / production-management reminders.
- Add silk-screen task-pool workflows with same-day main view, tomorrow preview, task marking/claiming without automatic release, required print photos after setup, actual printed quantity reporting, disposable plate/screen treatment without inventory management, print-color-only ink recording in V1, and separate print-only external-processing order states.
- Add silk-screen photo-return and exception workflows, plus lightweight external-processing print statements that use a separate external-processing print price table, bill by actual printed quantity, ignore leftover supplied material, keep only lightweight supplied-material notes/photos, create printing-service fulfillment records, support per-order print-price snapshots, route quality issues to after-sales / complaint handling, and support associated-factory small-plate / manual-print monthly summary export without full accounts payable.
- Support importing the later production summary sheet for machines 1-9, using daily produced model, speed, and output from the start of the year to calibrate machine capacity baselines.
- Add mobile-oriented workshop reporting flows for silk-screen, bag-making, packing, and delivery, including bag-making start production records, missing-start backfill flags, task-type-based auto-routing after bag-making completion, skip-task reasons, bag-making exception continue/pause paths, shared production-management / office exception pool, fixed exception reasons and outcomes, packing tasks only when packing is actually required, no separate packing-start action, package-detail entry, actual packed quantity, weight only when required, packing exceptions routed to the office shared pool, below-order warnings without blocking packing completion, quantity-difference pending handling that blocks formal fulfillment until office/management resolution, separate stock-short supplemental shipment versus custom printed actual-quantity billing / small-plate manual supplemental printing outcomes with task creation, reservation, cancellation, completion states, supplemental cost attribution, small-plate / manual-print cost snapshots, monthly supplemental-cost export without full V1 accounts payable, original-order extra-payment adjustments, fixed responsibility-source clues, repack/change-packing history, and separation of actual delivered quantity from chargeable quantity.
- Add bag-making mobile task visibility and reporting details: published-schedule-only task pages, current machine / current schedule / cross-day continue visibility, temporary substitution through schedule records, accepted finished-goods photos before customer-notification-ready state, returned-photo retake history, current logged-in worker quantity reporting, over/short variance flags without blocking the next task, and required daily qualified quantity entry for cross-day tasks.
- Add pricing and price-override data models based on customer-linked bag/print price tables.
- Implement the captured size-based bag body / handle material cost formula as configurable rules, including rough one-roll replenishment estimates and rough bag gross-profit estimates using a default 1500m-per-roll assumption until actual material data is available.
- Build the accepted bag-cost closed loop from inbound cost snapshots through raw-material labels, material issue scanning, production reporting / leftover registration, cost allocation, and order gross-margin snapshots, preserving estimated margin, batch-cost margin, and allocated margin as separate versions.
- Implement V1 material-gross-margin rules: exclude labor/electricity/rent/depreciation, warn on negative or low estimated material margin without blocking orders, calculate free overdelivery cost from actual produced/packed/delivered quantity, use weighted-average or latest material cost for stock/common-goods inventory, allocate shared-roll material by size formula times qualified quantity, subtract returned leftover value, and mark special-model costs as pending/rough when constants are unconfirmed.
- Persist board changes locally first, then connect to a real API contract.
- Add tests around queue manipulation: reorder, insert rush order, transfer, and complete.

## P3 - Operational Readiness

- Add and clear a blocking V1 system-persistence readiness gate before production go-live: core order, inventory, fulfillment, statement, production, driver, attachment, print, master-data, and file-retention repositories must run on PostgreSQL / object storage, or local persistence must be explicitly accepted with documented backup, concurrency, disk, permission, and disaster-recovery risk.
- Define backend API contracts for shop orders, work orders, machines, materials, and leftover rolls.
- Add role-specific permissions for boss, office staff, production supervisor, workshop operators, packing workers, drivers, warehouse, finance, HR / personnel, management / performance confirmation, attendance exception confirmation, and payroll deduction confirmation.
- Add field-level permission and audit-history rules by role and order stage, including production-critical fields, finance-critical fields, post-fulfillment correction flows, and void-and-reprint linkage.
- Add customer-profile models with separated customer entities and contacts, multiple contacts / addresses, contact roles, fulfillment preferences, settlement defaults, linked bag / print price tables, packing preferences, customer group records with history/manual correction, separated customer/office/finance/packing notes, four-level customer risk state, customer-list filters, and immutable order / fulfillment snapshots.
- Add an office shared workbench for operational todos, with shared-pool handling, actual-handler records, flow-blocking priority order, manual order-entry save-and-confirm, automation-created order-draft review, non-default boss pushes, and snooze / remind-later support.
- Add separate non-blocking review/watch queues and approval queues, so risk reminders do not get mixed with required confirmations, including responsibility tracing that records stages, optional responsible people, reference losses, and manually confirmed deduction amounts without automatic payroll deduction.
- Implement V1 default review/watch and approval thresholds for debt, order-risk blocking, rounding/write-off, discounts/allowances, free overdelivery, price approval timing, inventory adjustment review, serious production exceptions, and ordinary todo reminder cadence.
- Add mobile push rules: approvals push immediately; review/watch items default to list plus daily summary, with only severe cases pushed immediately.
- Add Enterprise WeChat self-built app notification integration for internal approval and severe review/watch pushes, with ERP-account-to-WeCom-user binding and push result logs.
- Route notification recipients by account permissions rather than fixed person names, with per-account notification toggles.
- Add configurable reminder/escalation rules by approval or review/watch item type, including price effective-time reminders, HR-owned attendance exception reminders, and payroll-review / payroll-settlement reminders.
- Add audit logs for scheduling changes and completion registration.
- Add barcode/QR workflows in phases: permission-controlled label printing, outbound / prepared-goods cards and waiting-pickup labels first, including price-hidden per-package goods cards for express / less-than-truckload pickup areas with package sequence, package ID, phone-tail-only display, shipping display name required for custom printed express / less-than-truckload labels, preprint / void / reprint handling when actual packages differ, system-only voiding for unused paper labels without mandatory physical recovery / photo proof, waiting-label-print state before office printing with office shared-pool reminders, workshop-first print queues with workshop / machine / submitter context, workshop queue sorting, lightweight physical label handoff, packing-worker label issue feedback, overtime shipment label fallback / exception handling, batch print with preview / print-batch records, print-result confirmation with partial success / print-exception handling, fixed reprint reasons, one active label per package, one V1 label template, test print, and 20-label batch limit, and no extra packing-worker confirmation for physical label attachment, then unified standard color catalog / color card with manually confirmed source-scoped customer/supplier/factory color aliases and management-permission controls for edits/merges/deactivation, helper material-preparation reservation, photo/OCR-assisted raw-material inbound from supplier raw-material delivery/sales notes with supplier-color-to-standard-color alias mapping and kg-based fabric/handle cost snapshots excluding freight, single-action helper-confirmed machine-side material pickup without mandatory bag-making-worker confirmation, raw-material roll/batch inbound, machine-level material staging, cross-day machine-side leftover carryover, trigger-based leftover/return scanning, estimated material-to-output gross-margin attribution, and later optional task-segmented material usage.
- Add raw-material V1 defaults: supplier delivery-note photo upload, OCR as prefill only, customer-service / office review, one QR/barcode label per roll/piece, label printing before physical attachment, phone scan / signed-note upload after attachment before available inventory, coarse raw-material locations, purchase/cost-permission control over confirmed inbound prices, full-roll/full-piece material issue by default, trigger-based leftover registration, USB/Bluetooth scanner keyboard-input mode plus mobile scan, and lightweight ink/auxiliary-material inventory without automatic deduction or order-level costing.
- Add the raw-material supplier monthly reconciliation loop: upload supplier statement Excel, match it against confirmed raw-material inbound delivery-note lines and roll labels, highlight missing ERP inbound, supplier omissions, duplicated rows, specification / color / weight / unit-price / amount differences, and keep reconciliation confirmation separate from payment confirmation.
- Add customer statement generation, reconciliation states, and evidence links, including default Excel template first, customer-send versus internal-archive versions, total delivered quantity, chargeable quantity, free / non-chargeable quantity, adjustment amounts, supplemental fulfillment shown in delivery/internal details without duplicate revenue, concise customer-facing notes for quantity differences, statement send records, payment entry separated from payment confirmation, on-site payment clues, debt carry-forward controls, simple scrap-sale other-income records, and non-blocking boss/management watch for out-of-range free overdelivery or high-impact allowances.
- Add exact stock matching controls so similar color/size inventory can be shown only as a reference hint, never as automatic availability or substitution; same-standard-color batch color differences are not managed in V1.
- Add lightweight finished-goods warehouse zone/location support for plain stock and printed stock areas, with model/size grouping, recommended outbound locations in task details, optional actual outbound location, complete-outbound quantity defaulting to expected quantity with quantity differences routed through quantity-mismatch handling, mandatory office-side void-and-reprint behavior for changed outbound / delivery / pickup documents scoped mainly to factory self-pickup shortage-at-picking cases, lightweight customer-confirmation records for accepted self-pickup quantity changes with configurable high-risk evidence triggers, three self-pickup shortage outcomes for canceling remainder / taking actual quantity and waiting for remainder / waiting until full quantity is ready, original-price-snapshot handling and non-auto-cancel follow-up reminders for later self-pickup remainder batches, temporary prepared-goods holding for full-quantity pickup waits, shared office todo handling and management review/watch escalation for overdue or high-risk self-pickup follow-ups, express / less-than-truckload waiting-pickup inventory reservation until picked-up confirmation, package-level batch pickup confirmation, unpicked-package follow-up, custom-cancellation pending-scrap handling, statement periods based on actual pickup/delivery date, delivery drivers receiving packed goods plus matching documents, inventory source visibility, and FIFO as a non-forced outbound deduction recommendation; detailed shelf/layer/bin locations can come later.
- Keep V1 customer-group automation manual-only: record customer-group metadata, support copied original text and screenshot upload, and avoid automatic reading, automatic order entry, or automatic replies until the core ERP flow is stable.
- Add later conversation archive reading / business recognition for customer groups: message retention, order / modification / confirmation / payment screenshot / complaint classification, payment screenshot OCR, recommended matching, and human-confirmed write-off.
- Add a separate later customer-group auto-reply sending-agent module using dedicated Enterprise WeChat employee accounts, fixed ERP templates, whitelist rollout, screenshot logs, rate limits, backup accounts, and safety stops; do not use Enterprise WeChat customer-group Webhook robots as the main route.
- Keep V1 customer notifications human-led, including finished-goods photo / goods-ready / carrier-arrangement notifications; ERP generates shared todos, copyable text, and photo prompts, while any later auto-send remains whitelist-only assistance with kill switches and manual takeover.
- Add shared automation safety and operations capabilities: archive prerequisites, customer-group mapping correction, idempotency, human workbench queues, kill switches, template versioning, explainable recognition, rollout metrics, and automatic downgrade to manual handling.
- Add an order-draft review workflow for customer-group recognized orders. V1/V2 should require office review before formal order creation; the review page compares original source messages against parsed ERP fields, highlights missing / uncertain / risky values, and keeps primary actions to create formal order, save pending information, or void draft. Missing-field blocking should be order-type specific: stock/common goods only need clear size/color/quantity to proceed, while custom print orders require production-critical print image/artwork/content details. Inventory shown during auto-recognition is only a snapshot; formal order creation re-checks and reserves inventory, and pending-fulfillment reservations use a shared task pool with urgency-based reminders rather than individual assignment or automatic release. Manual stock entry should provide save-and-wait-for-outbound and save-to-fulfillment-pending-confirmation actions; waiting-for-outbound tasks do not auto-print paper notes, and printing remains a permission-controlled manual office action in V1. Later high-trust automatic order entry is limited to simple stock orders with clear stock-core parsing, sufficient trusted inventory, complete price snapshot, and no strong customer risk or manual exception.
- Keep merchant interfaces / dynamic aggregated-payment QR codes as V3 options, not near-term priorities.
- Add lightweight after-sales / customer complaint records linked to customers, original order lines, fulfillment evidence, handling results, amount impact, and responsibility tracing.
- Add after-sales follow-up, after-sales statistics, and performance / deduction confirmation workflows without blocking normal order entry, production, or fulfillment by default.
- Add payroll / performance source-data preparation based on punch-clock hours, employee hourly base wage, hourly position subsidy, HR-confirmed attendance exceptions, manually entered/imported performance, confirmed performance / deduction records, production quantities, and responsibility tracing; support employee profiles with hourly base wage and default / current position, position records with hourly subsidies, effective-dated wage / position / subsidy snapshots, and manual HR payroll-review adjustment for temporary position changes until the existing payroll spreadsheet confirms whether finer segmented rules are needed; support Deli punch-clock attendance import first for the confirmed D5FN device, store only masked device SN in long-lived docs, reserve automatic Deli cloud/open-platform synchronization because official documentation lists DL-D5FN as a supported comprehensive sign-in API model, but require open-platform account permission and App-Key / App-Secret before implementation, support role / employee attendance rules including fixed but configurable standard times, configurable ordinary-employee four punch times, the current non-silk-screen four-punch baseline, 12:00-13:00 unpaid lunch/rest, silk-screen workers defaulting to two punches, minute-level valid work-segment hour accumulation, payroll export hours with 2 decimals by default, valid punch matching, raw extra-punch preservation, and same-day temporary leave / return segments such as 14:00 punch-out and 16:00 return where prior management verbal permission or large-group leave notice is required and away time is excluded from punch-clock wage hours by default, let HR / personnel handle missed punches, make-up punches, abnormal punch records, fixed temporary-leave and leave reason options, lightweight evidence flags, leave / overtime confirmation without overtime premium, employee/supervisor-submitted make-up reasons, frequent make-up reminders such as more than 3 per calendar month, payroll review from the 1st to 5th of the following month, and escalation near payroll settlement, refine payroll import/export fields after the existing payroll spreadsheet is provided, keep supervisor confirmation only for high-risk attendance exceptions, keep performance / deduction final confirmation separate from HR by default, and avoid final automatic payroll release in early V1.
- Make direct Deli D5FN attendance synchronization the final payroll-attendance workflow: ERP should automatically sync or allow HR to click `sync attendance`, then show latest punches, exceptions, make-up-punch work, hour summaries, and payroll drafts inside ERP. Excel / CSV import remains only a transition and emergency fallback for missing API permission, API outage, historical backfill, or reconciliation.
- Keep attendance-platform integration vendor-replaceable: try Deli D5FN first, but switch to another open-API attendance platform if Deli cannot provide acceptable API access, pricing / contract terms, data completeness, sync reliability, historical backfill, or employee / punch-record synchronization. Normalize all providers into the same ERP attendance records, employee mapping, sync batches, exception handling, hour summaries, and payroll drafts.
- Prioritize Enterprise WeChat-compatible attendance integration because the factory already uses Enterprise WeChat: evaluate Enterprise WeChat check-in / hardware check-in APIs and compatible physical devices, while keeping ERP as the employee-facing attendance UI. Add an employee mobile `My attendance` page for self-view of own punches, exceptions, make-up status, monthly hours, and payroll-review summary, with no raw-record editing and no cross-employee visibility.

## 2026-07-12 UI Progress

- Completed the approved `09-gpt-order-entry-final-candidate.png` order-entry implementation without changing the established order business flow.
- Next UI priority is to collect real office-operator feedback on recognition correction speed, exception locating, and the final confirm action before applying the same fidelity pass to the next workbench.
- Before customer-group automation is connected, add a formal recognition-inbox read model where each group/message context becomes one independently traceable draft, with source group, customer binding, received time, line count, missing-field count, inventory exceptions, and current handler/status. Do not merge concurrent groups into the current draft table.
- Add the confirmed real WeChat stock-order case as a parser/conversation fixture: split inherited same-size color quantities, retain and confirm likely dimension typos, classify quantity-bearing inventory questions without reserving stock, wait for explicit customer intent after an available result, create a same-day 19:30 temporary hold for `有的话给我留 N`, classify the confirmed afternoon block as a new original order without merging by customer/day, append immediate additions only to unconfirmed drafts, preserve available lines when only shortage lines are cancelled, close unavailable candidates/lines with an auditable out-of-stock cancellation, and parse source-scoped bag-color plus handle-color shorthand such as `焦糖米提` and `米白咖提`.
- Add seasonal/cycle demand forecasting based on customer purchase history, size, color, order frequency, cycle-sales patterns, and busy/slow-season data.
