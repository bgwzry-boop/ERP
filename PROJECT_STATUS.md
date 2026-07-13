# Project Status

Last updated: 2026-07-13 (V8.119)

## Current Verdict

The ERP core is substantially implemented, but production go-live is not approved.

| Dimension | Current truth |
| --- | ---: |
| P0 prototype / core code | `97-98%` |
| V1 readiness | `80-83%` |
| Release gates | `0/4` |
| Production go-live stages | `1/5` |
| Runtime readiness | `5/11` |
| Field evidence | `0/34` |
| Owner signoff | `0/6` |
| Remaining onsite tasks | `53` |

The generated [go-live suite](/Users/xu/Documents/ERP/.erp-local-storage/v1-go-live-suite/latest.zh-CN.md) is authoritative for release numbers. The [rectification plan](/Users/xu/Documents/ERP/docs/development/rectification-plan-2026-07-12.zh-CN.md) and [unblock plan](/Users/xu/Documents/ERP/.erp-local-storage/v1-go-live-suite/v1-unblock-plan.zh-CN.md) define execution order.

## Implemented

- Office Todo, Order Entry, Order Pool, Inventory, Fulfillment, and Statements are active operational pages.
- Production/Packing, Raw Material, Master Data, Workshop, and Driver role tools have working API-backed flows.
- Conversation recognition, temporary holds, shortage cancellation/restore, reviewed split confirmation, independent draft queues, and field-level review gates are implemented.
- Core order-to-payment and custom-print production-to-fulfillment flows have permission, idempotency, transaction, repository, and E2E coverage.
- CSS ownership is split across base, shell, shared, components, and feature layers; the root legacy stylesheet is retired.
- Pretest, full/core tests, and Batch A/B use a manifest-driven sequential runner with explicit failure localization.

## Hard Blockers

1. D49: eight real employee roles and secure production environment values.
2. D50: production PostgreSQL, restore database, object storage, long-running deployment, monitoring, and recovery.
3. D51: Windows print hardware, label media/scanning, and real driver phones.
4. D52: real master data and normal/exception business trial runs.
5. D53: 34 field evidence items, six signoffs, V1/V2 boundary, controlled remote repository, and fixed release commit.

## Remaining Code Work

- Expand the anonymized conversation corpus from 1 confirmed case to 20-50 real samples.
- Continue only justified API composition-root and internal test-composite cleanup.
- Complete the final cross-workbench accessibility/responsive audit when field devices are available.
- Do not treat these maintenance items as substitutes for D49-D53 acceptance.

## Latest Verification

- Batch A `7/7`, Batch B `18/18`, including PostgreSQL 16 live.
- V8.81 archives the four complete prior logs and reduces current status documents from 6,302 to 236 combined lines with a structural/truth consistency gate.
- V8.82 moves inventory-reservation release validation, quantity calculation, ledger/log assembly, and transaction orchestration into a directly tested command service; the HTTP route is now response mapping only and `apiServer.mjs` falls from 12,036 to 11,957 lines.
- V8.83 expands the dirty worktree to 144 real files and classifies all of them into five ownership groups; unclassified, duplicate, forbidden, sensitive, and staged counts are zero, while the missing controlled remote and dirty worktree remain release blockers.
- V8.84 scans added lines and untracked text for high-confidence private keys, cloud/Git tokens, and credentialed production database URLs without echoing matched content; current findings are zero.
- V8.85 moves evidence/signoff/boundary row staging, CSV mutation, sensitive-value rejection, draft rebuild, and closeout projection into a directly tested service; `apiServer.mjs` falls from 11,957 to 11,456 lines.
- V8.86 moves field-evidence draft generation, validation, freshness evaluation, and response redaction into a directly tested service; release refresh reuses the same pure projection and `apiServer.mjs` falls from 11,456 to 11,093 lines.
- V8.87 moves current-process production-env precheck projection, blocker/warning classification, error redaction, and read-only safeguards into a directly tested service; `apiServer.mjs` falls from 11,093 to 10,986 lines.
- V8.88 moves server-owned env-file source precedence, read-only audit, result redaction, and configuration guidance into a directly tested service; preview and values-fragment flows reuse the same source projection and `apiServer.mjs` falls from 10,986 to 10,472 lines.
- V8.89 moves env-file audit gating, memory-only overlay, variable preflight, stage diagnosis, and failure redaction into a directly tested preview service; the combined precheck reuses the same overlay function and `apiServer.mjs` falls from 10,472 to 10,058 lines.
- V8.90 moves production-env setup execution projection, prepared/ready/error states, configuration guidance, and failure redaction into a directly tested service; the API injects only the fixed controlled command and `apiServer.mjs` falls from 10,058 to 9,828 lines.
- V8.91 moves production-env intake precheck and setup-safe env resolution into a directly tested service; it reads only the server-owned setup latest report and fixed intake CSV, never accepts or exposes browser paths or real values, and `apiServer.mjs` falls from 9,828 to 9,461 lines.
- V8.92 moves production-env real-value apply report projection into a directly tested service, centralizing variable allowlisting, count normalization, path exclusion, and sensitive free-text redaction; `apiServer.mjs` falls from 9,461 to 9,236 lines.
- V8.93 moves the production-env real-value apply gate sequence and controlled command orchestration into a directly tested service; the API delegates in one line and `apiServer.mjs` falls from 9,236 to 8,973 lines.
- V8.94 moves release-candidate refresh write orchestration, server-owned command inputs, success/blocked/error projection, and summary redaction into a directly tested service; mandatory precheck remains intact and `apiServer.mjs` falls from 8,973 to 8,796 lines.
- V8.95 moves release-candidate refresh draft freshness/validity, evidence, production-env, production-combination, signoff, and V1/V2 boundary gates into a directly tested precheck service; the API keeps composition only and `apiServer.mjs` falls from 8,796 to 8,503 lines.
- V8.96 moves V1/V2 boundary precheck, blocker projection, and scope-brief refresh into a directly tested service; refresh cannot mutate boundary confirmation, evidence, release candidate, or suite state, and `apiServer.mjs` falls from 8,503 to 8,259 lines. D49 remains 0/8 formal roles and production-env preflight 2/11.
- V8.97 moves production go-live composition, missing-env projections, stage/unblock/evidence/runtime sanitization, and release-gate summary into a directly tested service; all free text now receives full connection-string, URL, and local-path redaction, and `apiServer.mjs` falls from 8,259 to 7,710 lines. Release truth is unchanged.
- V8.98 adds one read-only D49 projection for eight formal employee roles plus secure production-env setup, audit, preflight, and intake. Demo mode never bypasses it, seed accounts never count, and the API exposes no employee identities, login names, passwords, env paths, or values. Current truth remains roles `0/8`, env preflight `2/11`, and intake `0/29`.
- V8.99 makes D49 actionable from the status workbench: authorized management users can open the employee-machine import flow directly, while technical-operations users retain read-only D49 visibility without receiving master-data access. Browser permission and overflow checks pass; release truth is unchanged.
- V8.100 places the source-specific employee-machine workbook first and marks it as the current entry while retaining every other template. Download remains explicit and all precheck/confirmation/commit gates remain unchanged.
- V8.101 centralizes the eight formal employee-role aliases for frontend precheck and backend account review. Unknown roles and workshop rows without a default machine now fail precheck instead of silently becoming workshop accounts.
- V8.102 carries a non-blocking eight-role coverage summary through precheck, review draft, confirmation plan, and the import UI. It exposes role counts and gaps only; actual D49 readiness still requires enabled, password-changed formal accounts.
- V8.103 proves that role coverage survives local persistence, API listing and restart, and PostgreSQL reload. This closes a regression-evidence gap without changing D49 readiness or release truth.
- V8.104 refreshes both employee-account reviews and authoritative V1/D49 status after committed employee imports, account enablement, password issuance, or revocation. Failed, fallback, uncommitted, and cancelled paths do not refresh or claim progress.
- V8.105 proves D49 role transitions within one API lifecycle: pending and temporary-password accounts remain blocked, first password change makes the workshop role ready, revocation and restart block it again. PostgreSQL reload also feeds persisted formal accounts into role readiness.
- V8.106 extends D49 evidence to operational security states: active lockout blocks the role, administrator reset clears lockout but requires another first-password change, and expired passwords block readiness explicitly.
- V8.107 removes the six-item D49 UI truncation. All eight roles are visible, all environment blockers remain reachable, and identical environment summaries are grouped with occurrence counts while detailed variables stay in the intake section.
- V8.108 removes the remaining server-side 12-environment/20-total blocker caps. A 24-blocker stress case proves complete, redacted projection while the UI retains grouping for density.
- V8.109 makes the employee-machine workbook operational for real D49 intake: standalone templates precheck independently, the role column uses the shared eight-role stop-list, and workshop/default-machine fields are conditional instead of forcing fake workshop values onto office, finance, driver, management, or technical staff. Payload mapping enforces the same fail-closed contract.
- V8.110 removes importable demonstration rows from production master-data sheets. Reference values live only in isolated example sheets, empty business sheets and unchanged example markers fail precheck, and internal fixture rows require an explicit test-only generator option.
- V8.111 makes employee number the required, case-insensitively unique formal identity key. Precheck and execution payload both reject missing or duplicate identifiers instead of generating identities from mutable names/roles or silently deduplicating records; the longer UI requirement summary now wraps without clipping.
- V8.112 extends that identity contract across batches and persistence: one shared 1-32 character safe format is enforced by precheck, payload, and repository, while migration `0020` adds a PostgreSQL format check and unique `lower(id)` index. Local and PostgreSQL evidence reject case-only collisions without partial writes.
- V8.113 adds a dedicated blank employee-machine workbook and Chinese execution guide to every go-live handoff pack. The suite top-level index links both artifacts, canonical sync verifies byte equality, and no real employee, temporary password, seed import row, or production readiness claim is added.
- V8.115 creates a controlled, Git-excluded 18-row D49 intake draft covering five roles. Offline precheck now reads namespace-prefixed OOXML and self-closing blank cells correctly; the draft is blocked only by 18 stable employee numbers and nine workshop/machine assignments. Formal readiness remains `0/8` until server import and account lifecycle completion.
- V8.116 adds one technical-operations employee to the controlled draft: 19 rows now cover `6/8` roles, with finance and management still absent. Workbook ranges and summaries are generated dynamically; precheck reports 37 blockers comprising 19 employee numbers and nine workshop/machine assignments. Formal readiness remains `0/8`.
- V8.117 adds audited manual employee assignment with `fixed machine`, `general worker / floating`, and `unassigned` modes. Employee import now permits deferred workshop/machine assignment, while workshop-role readiness still requires a machine. The controlled 19-row draft now has only 19 employee-number blockers; formal readiness remains `0/8`.
- V8.118 closes four office-workbench placeholders: todo actions now open referenced drafts and inventory records, print preview reuses fulfillment/statement preview flows, unknown actions fail without simulated success, and the redundant Order Pool placeholder button is removed. Release truth is unchanged.
- V8.119 adds one server-authoritative todo-reference projection across drafts, orders, inventory, fulfillment, statements, corrections, and production tasks. Missing references render as exceptions and cannot navigate or print; unverifiable external references remain explicit. Release truth is unchanged.
- V8.114 adds a read-only offline D49 workbook precheck before browser upload. It enforces the dedicated workbook scope and projects row/field issues plus role counts without employee names, employee-number values, paths, passwords, or staged rows; upload permission still requires the server precheck and does not imply account readiness.
- Pretest `6/6`, full test `122/122` including document and Git-scope gates, core E2E `2/2`.
- OpenAPI `153/368/387`, production build, dependency audit, and diff checks pass.
- Local frontend `5174` and API `8787` return HTTP `200`.

## Immediate Next Step

Import and review real employees, complete first-password changes/default-machine bindings, and apply the secure production env intake. Until those inputs exist, keep release truth blocked and perform only scoped maintenance.

## History

The complete V8.80-and-earlier log is preserved in the [status archive](/Users/xu/Documents/ERP/docs/history/status/PROJECT_STATUS-through-v8.80.md).
