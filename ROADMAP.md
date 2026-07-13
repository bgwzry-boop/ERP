# Roadmap

Last updated: 2026-07-13 (V8.119)

## Release Sequence

| Priority | Scope | Completion condition |
| --- | --- | --- |
| D49 | Real employees, permissions, first-password changes, default machines, production env | Eight roles ready; env intake/preflight unblocked |
| D50 | PostgreSQL, restore validation, object storage, deployment, monitoring, rollback | Production first-stage closeout ready |
| D51 | Dot-matrix printer, label printer/media/scanning, driver devices | Print and driver closeouts ready |
| D52 | Real master data and end-to-end business trial runs | Field evidence `34/34` |
| D53 | Signoff, V1/V2 boundary, fixed Git release and go/no-go | Signoff `6/6`, gates `4/4` |

No code refactor, UI polish, or automated lab check may replace these field gates.

## Parallel Maintenance

- Expand the order-conversation corpus only from real anonymized samples.
- Keep employee-role coverage persistence assertions across local, API restart, and PostgreSQL repository boundaries.
- Keep D49 status synchronized after committed employee/account operations without letting read-refresh failures alter write truth.
- Preserve one cross-module D49 lifecycle regression from import through first password change, revocation, restart, and PostgreSQL readiness reload.
- Preserve explicit D49 regressions for account lockout, temporary-password reset, password expiry, and recovery.
- Keep all eight D49 roles and every environment blocker discoverable on desktop and mobile; summary grouping may reduce repetition but never discard raw counts or detailed intake rows.
- D49 services return every sanitized blocker without arbitrary count caps; response-size control comes from bounded check sources and UI grouping, not silent projection truncation.
- Keep every downloadable master-data module independently precheckable; price and inventory remain coupled to product specs, while employee rows require workshop/machine bindings only for workshop roles.
- Keep demonstration master data physically isolated from import sheets. Empty sheets and unchanged example markers fail precheck; examples may guide users but never become staged rows by default.
- Keep employee number required and case-insensitively unique across template precheck, execution payload, account review, password lifecycle, and audit; mutable names or roles never generate replacement identities.
- Enforce employee-number identity across separate import batches and persistence, not only within one workbook. PostgreSQL and local repositories reject unsafe formats and case-only collisions before any partial workspace commit.
- Keep a dedicated blank employee-machine workbook and D49 execution guide in every go-live handoff/suite; filled employee workbooks remain controlled business files outside Git, and their presence never counts as account readiness.
- Precheck filled D49 workbooks offline before browser upload, but keep the report read-only and identity-redacted. Offline `uploadAllowed` never bypasses server precheck, formal import authorization, account review, or lifecycle readiness.
- Keep the offline precheck compatible with valid namespace-prefixed OOXML and self-closing blank cells so missing leading fields cannot shift employee data into the wrong columns.
- Keep employee import independent from workshop assignment: import stable identities first, then let authorized staff assign a fixed machine, a workshop-only general-worker scope, or an explicit unassigned state with audit evidence. Workshop-role readiness remains fail-closed without a machine.
- Keep operational todo navigation reference-driven. Draft, inventory, fulfillment, statement, and preview actions must resolve real targets or report a blocked result; UI actions must never claim simulated success.
- Project every todo reference through one server-owned resolver. Missing targets are operational exceptions, while unsupported external references stay explicitly unverifiable; neither state may silently enter a normal navigation path.
- Reduce `apiServer.mjs` composition responsibilities when a stable service boundary exists.
- Split raw-material local trace/cost projections only when it improves independent testing.
- Migrate only high-value internal composite test scripts; top-level and Batch A/B orchestration are complete.
- Run final accessibility/responsive checks against real phones and printing workflows.

## Completed Structural Tracks

- Runtime-mode isolation, strict production startup, shared role catalog, and formal authentication.
- PostgreSQL repositories, idempotency, transaction boundaries, object-storage contracts, release/readiness tooling.
- WeChat-style recognition, independent drafts, temporary holds, shortage recovery, reviewed splitting, low-confidence review.
- Frontend action/read controllers, V1 status projections/builders, production print panels, layered CSS ownership.
- Inventory-intent routing and inventory-reservation release command orchestration are isolated from the API composition root.
- Field-evidence evidence/signoff/boundary row staging and CSV/draft orchestration are isolated from the API composition root.
- Field-evidence draft generation, validation, freshness evaluation, and redacted result projection are isolated from the API composition root.
- Current-process production-env live precheck projection and redacted failure handling are isolated from the API composition root; file audit and preview remain separate boundaries.
- Server-owned env-file source precedence and read-only audit projection are isolated; file preview and values-fragment flows reuse the same source contract without accepting frontend paths.
- Env-file preview audit gating, memory-only overlay, stage diagnosis, and redacted failure handling are isolated; `process.env` remains immutable and the combined precheck reuses the overlay helper.
- Production-env setup prepared/ready/error projection and guidance are isolated; the API supplies a fixed server command without frontend paths, values, imports, or force overwrite.
- Production-env intake precheck and setup-safe env resolution are isolated; only the server-owned setup latest report and fixed intake CSV are accepted, with paths and values excluded from responses.
- Production-env real-value apply reports use one isolated projection for variable allowlisting, normalized counts, path exclusion, and sensitive-text redaction; write orchestration remains gated and server-owned.
- Production-env real-value apply orchestration is isolated and preserves strict order: server flag, one server-owned fragment, ready setup target, fragment audit, current dry-run proof, then the controlled command; no earlier failure may invoke the write command.
- Release-candidate refresh write orchestration is isolated: a ready refresh precheck is mandatory, command inputs are server-owned, command-result free text is redacted, and blocked/error results cannot claim candidate or suite refresh.
- Release-candidate refresh precheck is isolated: stale, invalid, missing, or blocked field drafts and incomplete env, production-combination, signoff, or V1/V2 boundary gates fail closed before any refresh command can run.
- V1/V2 boundary precheck and scope-brief refresh are isolated; refreshing the brief never confirms the boundary, mutates evidence, or refreshes the release candidate/go-live suite.
- Production go-live composition is isolated: server-owned env files, memory-only overlay, intake verification, current runtime readiness, five-stage projection, and release-gate redaction share one fail-closed service boundary.
- D49 now has one read-only status projection combining all eight formal employee roles with secure production-env setup, audit, preflight, and intake; it improves operator visibility but cannot satisfy the gate without real onsite inputs.
- Authorized managers can now move from the D49 projection directly into the employee-machine import template; technical operations remains read-only unless master-data permission is explicitly granted.
- Source-specific master-data entry points place their matching workbook first without auto-downloading or weakening precheck, confirmation-plan, or formal-import gates.
- Employee import precheck and backend account review share one eight-role alias contract; unknown roles and workshop rows without a default machine fail before formal import.
- Employee precheck, review drafts, and confirmation plans retain a non-blocking `covered/8` projection so batched imports remain possible while missing D49 roles stay visible.
- Manifest-driven pretest/test/core and Batch A/B runners with direct validation.
- Read-only Git baseline scope auditing with file-level ownership, forbidden-path checks, and explicit remote/clean-worktree blockers.
- Added-line and untracked-text credential scanning reports only path/rule metadata and blocks high-confidence secret material.

## V2 Deferred

- Enterprise WeChat archive ingestion and automatic replies.
- Payroll, attendance, full HR, after-sales responsibility and performance deductions.
- Advanced BI, automatic scheduling, route optimization, deep cost and margin allocation.

V1/V2 scope still requires formal owner signoff before release.

## History

The complete roadmap through V8.80 is preserved in the [roadmap archive](/Users/xu/Documents/ERP/docs/history/status/ROADMAP-through-v8.80.md).
